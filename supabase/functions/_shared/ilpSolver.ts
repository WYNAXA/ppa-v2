/**
 * Exact participation solver via HiGHS WASM — slot-assignment ILP.
 *
 * Model (NO C(N,4) enumeration):
 *
 *   Variables:
 *     x_{p,s} in {0,1}  — player p assigned to slot s
 *     y_p     in {0,1}  — player p is placed (in at least one match)
 *     m_s     integer   — number of complete 4-player matches at slot s
 *
 *   Objective:
 *     maximize  sum_p  y_p
 *
 *   Constraints:
 *     (C1) Availability:       x_{p,s} = 0            for all (p,s) where p is NOT available at s
 *     (C2) Player limit:       sum_s x_{p,s} <= limit  for each player p
 *     (C3) Group-of-4:         sum_p x_{p,s} = 4 * m_s for each slot s
 *     (C4) Coverage link:      y_p <= sum_s x_{p,s}    for each player p
 *     (C5) Match upper bound:  m_s <= floor(|avail_s| / 4)  for each slot s
 *
 *   Model size at P players, S slots:
 *     Binary vars:   P*S (assignments) + P (coverage) = P*(S+1)
 *     Integer vars:  S (match counts)
 *     Constraints:   P (limits) + S (group-of-4) + P (coverage) + S (match bounds) = 2P + 2S
 *                    (availability enforced via bounds, not explicit constraints)
 *     At 50 players x 6 slots: 350 vars, 112 constraints.
 */

import type { TimeSlot, PollResponse } from "./matchEngine.ts";

// ── HiGHS loader (cached singleton) ──────────────────────────────────────────

// Static imports — embedded at build time, no Deno.readFile/readTextFile.
// The bundler includes these .ts modules in the deploy, so the WASM and
// glue are available in the deployed edge function without runtime IO.
import { HIGHS_GLUE_SOURCE } from "./highs-wasm/highs14_glue.ts";
import { HIGHS_WASM_BASE64 } from "./highs-wasm/highs14_wasm_b64.ts";

let _glueSource: string | null = null;
let _wasmBinary: Uint8Array | null = null;

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function getHiGHS(): Promise<any> {
  // Cache the patched glue and decoded WASM binary (but NOT the instance)
  if (!_glueSource) {
    let src = HIGHS_GLUE_SOURCE;
    src = src.replace(/if\s*\(\s*typeof\s+exports\s*===\s*'object'[\s\S]*$/, "");
    src = src.replace(/if\(m\)\{var fs=require\("fs"\).*?\}else if/, "if(false){}else if");
    src = src.replace(/if\(ENVIRONMENT_IS_NODE\)\{var fs=require\("node:fs"\).*?\}else if/, "if(false){}else if");
    _glueSource = src;
  }
  if (!_wasmBinary) {
    _wasmBinary = decodeBase64(HIGHS_WASM_BASE64);
  }

  // Fresh instance each solve to avoid Emscripten VFS state corruption
  // (Defect 2 — the virtual filesystem retains m.lp between solves).
  const ModuleFactory = new Function(_glueSource + "\nreturn Module;")();
  return ModuleFactory({
    wasmBinary: _wasmBinary,
    print: () => {},
    printErr: () => {},
  });
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface ILPResult {
  maxPlaced: number;
  assignments: Map<string, string[]>;  // slotId -> assigned player ids
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Compute per-player match cap.
 * - max_matches set (1 or 2): use directly
 * - max_matches null + can_play_twice false: 1
 * - max_matches null + can_play_twice true: 2
 * - max_matches null + can_play_twice null: capped at distinct available
 *   days (computed later from slot availability, passed as availDays)
 */
function playerLimit(r: PollResponse, availDays?: number): number {
  if (r.max_matches != null) return r.max_matches;
  if (r.can_play_twice === false) return 1;
  if (r.can_play_twice === true)  return 2;
  // null max_matches + null can_play_twice = cap at available days
  return availDays ?? 999;
}

// Sanitize player/slot ids for LP variable names (alphanumeric + underscore only)
function lpName(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, "_");
}

// ── ILP builder ──────────────────────────────────────────────────────────────

function buildLP(
  timeSlots: TimeSlot[],
  responses: PollResponse[],
  benchDebts?: Map<string, number>,
): { lp: string; varCount: number; constraintCount: number } {
  // Build availability per slot
  const slotAvail = new Map<string, string[]>();
  for (const s of timeSlots) {
    const avail: string[] = [];
    for (const r of responses) {
      if ((r.selected_slots ?? []).includes(s.id)) avail.push(r.user_id);
    }
    slotAvail.set(s.id, avail);
  }

  // Compute distinct available days per player (for null max_matches cap).
  // Each slot's day field gives the day; count distinct days a player is available.
  const playerAvailDays = new Map<string, number>();
  for (const r of responses) {
    const days = new Set<string>();
    for (const s of timeSlots) {
      if ((r.selected_slots ?? []).includes(s.id)) {
        // For range polls, extract date from slot ID (yyyy-MM-dd_HH:MM_HH:MM)
        const dateMatch = s.id.match(/^(\d{4}-\d{2}-\d{2})_/);
        days.add(dateMatch ? dateMatch[1] : s.day);
      }
    }
    playerAvailDays.set(r.user_id, Math.max(days.size, 1));
  }

  // Per-player limits (ILP hard constraint — NOT a post-filter)
  const limits = new Map<string, number>();
  for (const r of responses) limits.set(r.user_id, playerLimit(r, playerAvailDays.get(r.user_id)));

  const allPlayers = responses.map(r => r.user_id);
  const slotIds = timeSlots.map(s => s.id);

  // Track which (player, slot) pairs are available
  const availSet = new Set<string>();
  for (const [sid, avail] of slotAvail) {
    for (const pid of avail) availSet.add(`${pid}:${sid}`);
  }

  // ── Objective: maximize sum y_p + eps1 * sum(benchDebt_p * y_p)
  //                         + eps2 * sum(x_{p,s} for preferred (p,s)) ──────
  // Level 1: participation (coefficient 1 per player).
  // Level 2: bench rotation tiebreak (eps1=0.001 * debt, < 1).
  // Level 3: preferred-date soft favour (eps2=0.00001 per preferred assignment).
  //   Among equally-optimal schedules, prefer placing players on their
  //   preferred day. eps2 is small enough that it NEVER reduces participation
  //   or overrides bench rotation.
  const eps1 = 0.001;
  const eps2 = 0.00001;

  // Build preferred-slot lookup: player_id -> set of slot IDs on their preferred date
  const preferredSlots = new Map<string, Set<string>>();
  for (const r of responses) {
    if (!r.preferred_date) continue;
    const prefSlots = new Set<string>();
    for (const s of timeSlots) {
      const dateMatch = s.id.match(/^(\d{4}-\d{2}-\d{2})_/);
      const slotDate = dateMatch ? dateMatch[1] : null;
      // Range polls: match date in slot ID; legacy: match day name
      if (slotDate === r.preferred_date || s.day === r.preferred_date) {
        prefSlots.add(s.id);
      }
    }
    if (prefSlots.size > 0) preferredSlots.set(r.user_id, prefSlots);
  }

  let lp = "Maximize\n  obj:";
  lp += allPlayers.map(p => {
    const debt = benchDebts?.get(p) ?? 0;
    const coeff = 1 + eps1 * debt;
    return ` + ${coeff} y_${lpName(p)}`;
  }).join("");

  // Preferred-date soft favour terms
  for (const [p, prefSlots] of preferredSlots) {
    for (const s of prefSlots) {
      if (availSet.has(`${p}:${s}`)) {
        lp += ` + ${eps2} x_${lpName(p)}_${lpName(s)}`;
      }
    }
  }

  lp += "\n";

  lp += "Subject To\n";
  let constraintCount = 0;

  // ── (C2) Player limit: sum_s x_{p,s} <= limit(p) ──────────────────────
  // Bridge players (limit=999) can appear in matches at multiple slots.
  for (const p of allPlayers) {
    const lim = limits.get(p)!;
    const terms: string[] = [];
    for (const s of slotIds) {
      if (availSet.has(`${p}:${s}`)) terms.push(`x_${lpName(p)}_${lpName(s)}`);
    }
    if (terms.length === 0) continue;
    lp += `  lim_${lpName(p)}: ${terms.join(" + ")} <= ${lim}\n`;
    constraintCount++;
  }

  // ── (C3) Group-of-4: sum_p x_{p,s} - 4 * m_s = 0   for each slot s ──
  // This is the crux: the number of players assigned to a slot must be
  // EXACTLY 4 * m_s, where m_s is an integer. This means assigned counts
  // are always multiples of 4 — no 1-3 player remainders are possible.
  // Combined with the binary x_{p,s} variables and per-player limits,
  // this ensures every assigned player is part of a complete 4-player group.
  for (const s of slotIds) {
    const avail = slotAvail.get(s) ?? [];
    if (avail.length === 0) continue;
    const terms = avail.map(p => `x_${lpName(p)}_${lpName(s)}`).join(" + ");
    lp += `  grp_${lpName(s)}: ${terms} - 4 m_${lpName(s)} = 0\n`;
    constraintCount++;
  }

  // ── (C4) Coverage link: y_p <= sum_s x_{p,s} ─────────────────────────
  for (const p of allPlayers) {
    const terms: string[] = [];
    for (const s of slotIds) {
      if (availSet.has(`${p}:${s}`)) terms.push(`x_${lpName(p)}_${lpName(s)}`);
    }
    if (terms.length === 0) continue;
    lp += `  cov_${lpName(p)}: y_${lpName(p)} - ${terms.join(" - ")} <= 0\n`;
    constraintCount++;
  }

  // ── (C6) Per-match distinctness: x_{p,s} <= m_s ────────────────────────
  // A player can appear in at most m_s matches at slot s (one seat per match,
  // not multiple seats in a single match). This prevents degenerate solutions
  // where a bridge player fills 3 of 4 seats in one match.
  for (const p of allPlayers) {
    const lim = limits.get(p)!;
    if (lim <= 1) continue;  // already bounded to 0-1 by limit constraint
    for (const s of slotIds) {
      if (availSet.has(`${p}:${s}`)) {
        lp += `  dist_${lpName(p)}_${lpName(s)}: x_${lpName(p)}_${lpName(s)} - m_${lpName(s)} <= 0\n`;
        constraintCount++;
      }
    }
  }

  // ── Bounds ─────────────────────────────────────────────────────────────
  lp += "Bounds\n";
  // Precompute max matches per slot.
  // Each match needs 4 player-slots. Available capacity at a slot =
  // sum of min(player_limit, some_large_number) across available players.
  // But this is loose. A tighter bound: we can't have more matches than
  // the total player-slots / 4.  With bridge players, total capacity > |avail|.
  const slotMaxMatches = new Map<string, number>();
  for (const s of slotIds) {
    const avail = slotAvail.get(s) ?? [];
    // Total capacity: each player contributes min(limit, generous_cap)
    // A player with limit=999 at a slot with N available can appear in at most N/3
    // matches (each match needs 3 other players). But for the bound, just use
    // sum(min(limit, |avail|)) / 4.
    let totalCap = 0;
    for (const pid of avail) {
      totalCap += Math.min(limits.get(pid)!, avail.length);
    }
    slotMaxMatches.set(s, Math.floor(totalCap / 4));
  }

  // x_{p,s} = number of matches at slot s that include player p (integer).
  // Upper bound: min(player's global limit, max matches at this slot).
  // The constraint x_{p,s} <= m_s is implicit from the bound since
  // m_s <= slotMaxMatches and x_{p,s} <= slotMaxMatches.
  // We add an explicit linking constraint below (C6) to enforce x_{p,s} <= m_s.
  for (const p of allPlayers) {
    const lim = limits.get(p)!;
    for (const s of slotIds) {
      if (availSet.has(`${p}:${s}`)) {
        const msMax = slotMaxMatches.get(s) ?? 0;
        const ub = Math.min(lim, msMax);
        lp += `  0 <= x_${lpName(p)}_${lpName(s)} <= ${ub}\n`;
      }
    }
  }

  // y_p: binary 0-1
  for (const p of allPlayers) {
    lp += `  0 <= y_${lpName(p)} <= 1\n`;
  }

  // (C5) m_s bounds (precomputed above as slotMaxMatches)
  for (const s of slotIds) {
    lp += `  0 <= m_${lpName(s)} <= ${slotMaxMatches.get(s) ?? 0}\n`;
  }

  // ── Integer declarations ───────────────────────────────────────────────
  lp += "General\n  ";
  const intVars: string[] = [];

  // x_{p,s} integer (not just binary — unlimited players can be >1)
  for (const p of allPlayers) {
    for (const s of slotIds) {
      if (availSet.has(`${p}:${s}`)) intVars.push(`x_${lpName(p)}_${lpName(s)}`);
    }
  }
  // y_p binary (declared as general with 0-1 bounds = effectively binary)
  for (const p of allPlayers) intVars.push(`y_${lpName(p)}`);
  // m_s integer
  for (const s of slotIds) intVars.push(`m_${lpName(s)}`);

  lp += intVars.join(" ");
  lp += "\nEnd\n";

  return { lp, varCount: intVars.length, constraintCount };
}

// ── Public solver ────────────────────────────────────────────────────────────

export async function solveILP(
  timeSlots: TimeSlot[],
  responses: PollResponse[],
  benchDebts?: Map<string, number>,
): Promise<ILPResult> {
  const highs = await getHiGHS();

  const { lp } = buildLP(timeSlots, responses, benchDebts);

  // MIP solve: returns the proven integer optimum.
  // The constraint matrix is NOT totally unimodular (the 4*m_s coupling
  // breaks TU), so the LP relaxation can be fractional — e.g. 50/6/0%
  // gives LP=50 but IP=48.  The MIP solver is mandatory for correctness.
  // The fresh-instance-per-solve (getHiGHS, line 51) prevents the
  // Emscripten VFS corruption that previously caused Aborted() on
  // sequential solves.
  const result = highs.solve(lp, { time_limit: 10.0, presolve: "on" });

  if (result.Status !== "Optimal") {
    throw new Error(`ILP solver returned status "${result.Status}" — not optimal`);
  }

  // Extract placed count
  let maxPlaced = 0;
  const assignments = new Map<string, string[]>();
  for (const s of timeSlots) assignments.set(s.id, []);

  const cols = result.Columns || {};
  for (const [name, val] of Object.entries(cols)) {
    const v = val as any;
    if (name.startsWith("y_") && v.Primal > 0.5) {
      maxPlaced++;
    }
    if (name.startsWith("x_") && v.Primal > 0.5) {
      // x_{p,s} = number of matches at slot s that include player p.
      // Push the player once per match-appearance so the assignment list
      // has exactly 4 * m_s entries (enabling correct grouping into matches).
      const count = Math.round(v.Primal);
      for (const s of timeSlots) {
        const suffix = `_${lpName(s.id)}`;
        if (name.endsWith(suffix)) {
          const playerPart = name.slice(2, name.length - suffix.length);
          for (const r of responses) {
            if (lpName(r.user_id) === playerPart) {
              for (let k = 0; k < count; k++) {
                assignments.get(s.id)!.push(r.user_id);
              }
              break;
            }
          }
          break;
        }
      }
    }
  }

  return { maxPlaced, assignments };
}

// Also export buildLP for testing
export { buildLP, getHiGHS };
