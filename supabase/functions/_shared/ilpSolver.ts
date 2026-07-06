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

let _glueSource: string | null = null;
let _wasmBinary: Uint8Array | null = null;

async function getHiGHS(): Promise<any> {
  const thisDir = new URL(".", import.meta.url).pathname;

  // Cache the source text and WASM binary (but NOT the instance)
  if (!_glueSource) {
    // Use HiGHS v1.14.2 (highs14.js/highs14.wasm) — v1.8.0 MIP solver
    // crashes on certain all-binary 50/6-slot models in the Deno test runner.
    let src = await Deno.readTextFile(thisDir + "highs-wasm/highs14.js");
    src = src.replace(/if\s*\(\s*typeof\s+exports\s*===\s*'object'[\s\S]*$/, "");
    src = src.replace(/if\(m\)\{var fs=require\("fs"\).*?\}else if/, "if(false){}else if");
    src = src.replace(/if\(ENVIRONMENT_IS_NODE\)\{var fs=require\("node:fs"\).*?\}else if/, "if(false){}else if");
    _glueSource = src;
  }
  if (!_wasmBinary) {
    _wasmBinary = await Deno.readFile(thisDir + "highs-wasm/highs14.wasm");
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

function playerLimit(r: PollResponse): number {
  if (r.can_play_twice === false) return 1;
  if (r.can_play_twice === true)  return 2;
  return 999;  // null = unlimited
}

// Sanitize player/slot ids for LP variable names (alphanumeric + underscore only)
function lpName(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, "_");
}

// ── ILP builder ──────────────────────────────────────────────────────────────

function buildLP(
  timeSlots: TimeSlot[],
  responses: PollResponse[],
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

  // Per-player limits
  const limits = new Map<string, number>();
  for (const r of responses) limits.set(r.user_id, playerLimit(r));

  const allPlayers = responses.map(r => r.user_id);
  const slotIds = timeSlots.map(s => s.id);

  // Track which (player, slot) pairs are available
  const availSet = new Set<string>();
  for (const [sid, avail] of slotAvail) {
    for (const pid of avail) availSet.add(`${pid}:${sid}`);
  }

  // ── Objective: maximize sum y_p ────────────────────────────────────────
  let lp = "Maximize\n  obj:";
  lp += allPlayers.map(p => ` + y_${lpName(p)}`).join("");
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
): Promise<ILPResult> {
  const highs = await getHiGHS();

  const { lp } = buildLP(timeSlots, responses);

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
      // Parse x_PLAYER_SLOT
      // Variable name format: x_{lpName(player)}_{lpName(slot)}
      // We need to find which slot this belongs to
      for (const s of timeSlots) {
        const suffix = `_${lpName(s.id)}`;
        if (name.endsWith(suffix)) {
          const playerPart = name.slice(2, name.length - suffix.length);
          // Find the player whose lpName matches
          for (const r of responses) {
            if (lpName(r.user_id) === playerPart) {
              assignments.get(s.id)!.push(r.user_id);
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
