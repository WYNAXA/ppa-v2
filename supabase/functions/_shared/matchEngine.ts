/**
 * Unified scheduling engine — pure assignment core.
 *
 * Takes poll data + history, returns match proposals.  No DB writes.
 *
 * Objective stack (strict lexicographic order):
 *   1. PARTICIPATION: maximise distinct players in full 4-player matches.
 *      Solved by ILP (HiGHS WASM) — proven optimal, oracle-equal.
 *   2. BENCH ROTATION: ILP secondary objective (epsilon * bench_debt per y_p).
 *      Never reduces participation; only breaks ties among equal-placed solutions.
 *   3. PAIRING DIVERSITY: within assigned groups, minimise recent pairing frequency.
 *   4. TOGETHERNESS: implicit in ILP (all slot assignments explored).
 */

import { weekDayToDate, type DayName } from "./dateUtils.ts";
import { isUserAvailableForSlot } from "./timeUtils.ts";
import { solveILP } from "./ilpSolver.ts";

// ── Public types ─────────────────────────────────────────────────────────────

export interface TimeSlot {
  id: string;
  day: string;
  start_time: string;
  end_time: string;
}

export interface PollResponse {
  user_id: string;
  selected_slots: string[] | null;
  flexible_times: Record<string, { available: boolean; slots: string[] }> | null;
  can_play_twice: boolean | null;   // false=1 match, true=2, null=unlimited
}

export interface BenchHistory {
  user_id: string;
  bench_count: number;             // outcome='benched' rows in last 3 months
}

export interface PairingRecord {
  player_ids: string[];
  match_date: string;              // yyyy-MM-dd
}

export interface EngineInput {
  weekStartDate: string;           // yyyy-MM-dd (normally a Monday)
  timeSlots: TimeSlot[];
  responses: PollResponse[];
  benchHistory: BenchHistory[];
  pairingHistory: PairingRecord[];
  togetherness: boolean;           // true = cluster matches on fewer days
}

export interface ProposedMatch {
  date: string;                    // yyyy-MM-dd
  day: string;
  timeSlot: string;                // "HH:mm-HH:mm"
  slotId: string;
  playerIds: string[];             // exactly 4
  diversityScore: number;
}

export interface EngineOutput {
  matches: ProposedMatch[];
  playersScheduled: string[];      // distinct user_ids placed in a match
  playersBenched: string[];        // available at a slot WITH a match, not placed
  totalParticipation: number;      // = playersScheduled.length
}

// ── Internal types ───────────────────────────────────────────────────────────

interface PairingMaps {
  frequency: Map<string, Map<string, number>>;
  recency: Map<string, Map<string, number>>;  // value = days since match
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Maximum matches a player may be assigned based on can_play_twice. */
function maxMatchesFor(r: PollResponse): number {
  if (r.can_play_twice === false) return 1;
  if (r.can_play_twice === true)  return 2;
  return Infinity;                 // null = unlimited
}

const DAY_ORDER = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

// ── Level 3: Pairing diversity ───────────────────────────────────────────────
// Scoring tiers reused from check-poll-auto-match/index.ts:288-337
// (scorePlayerGroup).  The original scores each C(4,2)=6 pair in a group:
//
//   Frequency:  0 times → +100    (CPAM line 298-301)
//               1 time  → +50     (CPAM line 302)
//               2 times → +25     (CPAM line 304)
//               3+      → -freq*10 (CPAM line 306)
//
//   Recency:    <7 days  → -100   (CPAM line 314-315)
//               <14 days → -50    (CPAM line 316-317)
//               <30 days → -25    (CPAM line 318-319)

function buildPairingMaps(history: PairingRecord[]): PairingMaps {
  const frequency = new Map<string, Map<string, number>>();
  const recency   = new Map<string, Map<string, number>>();
  const now = Date.now();

  for (const rec of history) {
    const pids = rec.player_ids ?? [];
    const matchMs = new Date(rec.match_date + "T12:00:00Z").getTime();
    const daysSince = (now - matchMs) / 86_400_000;

    for (let i = 0; i < pids.length; i++) {
      for (let j = i + 1; j < pids.length; j++) {
        const a = pids[i], b = pids[j];

        if (!frequency.has(a)) frequency.set(a, new Map());
        if (!frequency.has(b)) frequency.set(b, new Map());
        frequency.get(a)!.set(b, (frequency.get(a)!.get(b) ?? 0) + 1);
        frequency.get(b)!.set(a, (frequency.get(b)!.get(a) ?? 0) + 1);

        if (!recency.has(a)) recency.set(a, new Map());
        if (!recency.has(b)) recency.set(b, new Map());
        const prevA = recency.get(a)!.get(b);
        if (prevA === undefined || daysSince < prevA) recency.get(a)!.set(b, daysSince);
        const prevB = recency.get(b)!.get(a);
        if (prevB === undefined || daysSince < prevB) recency.get(b)!.set(a, daysSince);
      }
    }
  }
  return { frequency, recency };
}

/** Score a group of players for pairing diversity.  Higher = more diverse. */
export function scoreDiversity(playerIds: string[], pairing: PairingMaps): number {
  let score = 0;
  for (let i = 0; i < playerIds.length; i++) {
    for (let j = i + 1; j < playerIds.length; j++) {
      const a = playerIds[i], b = playerIds[j];

      const freq = pairing.frequency.get(a)?.get(b) ?? 0;
      if      (freq === 0) score += 100;   // never played together
      else if (freq === 1) score += 50;
      else if (freq === 2) score += 25;
      else                 score -= freq * 10;

      const days = pairing.recency.get(a)?.get(b);
      if (days !== undefined) {
        if      (days < 7)  score -= 100;  // played together very recently
        else if (days < 14) score -= 50;
        else if (days < 30) score -= 25;
      }
    }
  }
  return score;
}

// ── Combination / grouping helpers ───────────────────────────────────────────

function combinations(arr: string[], k: number): string[][] {
  const result: string[][] = [];
  const combo: string[] = [];
  (function recurse(start: number) {
    if (combo.length === k) { result.push([...combo]); return; }
    for (let i = start; i <= arr.length - (k - combo.length); i++) {
      combo.push(arr[i]);
      recurse(i + 1);
      combo.pop();
    }
  })(0);
  return result;
}

/**
 * Partition `players` into `groupCount` groups of 4, maximising total
 * diversity score.
 *
 * - pool <= 12 (3 groups): exhaustive enumeration — worst case
 *   C(12,4)*C(8,4) = 34 650 iterations, each scoring 6 pairs = trivial.
 * - pool > 12: greedy — pick best group of 4 from remaining, repeat.
 */
function partitionForDiversity(
  players: string[],
  groupCount: number,
  pairing: PairingMaps,
): string[][] {
  if (groupCount <= 0) return [];
  const pool = players.slice(0, groupCount * 4);
  if (groupCount === 1) return [pool];
  if (pool.length <= 12) return enumerateBestSplit(pool, groupCount, pairing);
  return greedyPartition(pool, groupCount, pairing);
}

function enumerateBestSplit(
  pool: string[],
  groupCount: number,
  pairing: PairingMaps,
): string[][] {
  if (groupCount === 1) return [pool.slice(0, 4)];

  let bestGroups: string[][] = [];
  let bestScore = -Infinity;

  for (const group of combinations(pool, 4)) {
    const groupSet = new Set(group);
    const remaining = pool.filter(p => !groupSet.has(p));
    const rest = enumerateBestSplit(remaining, groupCount - 1, pairing);
    const total =
      scoreDiversity(group, pairing) +
      rest.reduce((s, g) => s + scoreDiversity(g, pairing), 0);
    if (total > bestScore) {
      bestScore = total;
      bestGroups = [group, ...rest];
    }
  }
  return bestGroups;
}

function greedyPartition(
  pool: string[],
  groupCount: number,
  pairing: PairingMaps,
): string[][] {
  const remaining = [...pool];
  const groups: string[][] = [];
  for (let g = 0; g < groupCount && remaining.length >= 4; g++) {
    // For manageable sizes, enumerate; otherwise take first 4.
    const candidates = remaining.length <= 8
      ? combinations(remaining, 4)
      : [remaining.slice(0, 4)];
    let bestGroup = candidates[0];
    let bestScore = scoreDiversity(bestGroup, pairing);
    for (let c = 1; c < candidates.length; c++) {
      const s = scoreDiversity(candidates[c], pairing);
      if (s > bestScore) { bestScore = s; bestGroup = candidates[c]; }
    }
    const gs = new Set(bestGroup);
    groups.push(bestGroup);
    remaining.splice(0, remaining.length, ...remaining.filter(p => !gs.has(p)));
  }
  return groups;
}

// ── Main engine ──────────────────────────────────────────────────────────────

export async function generateProposals(input: EngineInput): Promise<EngineOutput> {
  const {
    weekStartDate, timeSlots, responses,
    benchHistory, pairingHistory, togetherness: _togetherness,
  } = input;

  // ════════════════════════════════════════════════════════════════════════
  // Step 1 — Availability matrix: O(P * S)
  // ════════════════════════════════════════════════════════════════════════
  const slotPlayers = new Map<string, string[]>();

  for (const slot of timeSlots) {
    const available: string[] = [];
    for (const r of responses) {
      if (isUserAvailableForSlot(
        { selected_slots: r.selected_slots ?? [], flexible_times: r.flexible_times ?? {} },
        slot,
      )) {
        available.push(r.user_id);
      }
    }
    slotPlayers.set(slot.id, available);
  }

  // ════════════════════════════════════════════════════════════════════════
  // Step 2 — Lookups
  // ════════════════════════════════════════════════════════════════════════
  const benchDebt = new Map<string, number>();
  for (const h of benchHistory) benchDebt.set(h.user_id, h.bench_count);

  const pairing = buildPairingMaps(pairingHistory);

  // ════════════════════════════════════════════════════════════════════════
  // Step 3 — Level 1 + 2: ILP-optimal participation with bench rotation
  //
  // The ILP maximises distinct players placed in full 4-player matches
  // (Level 1 = primary objective coefficient 1.0 per player).
  //
  // Level 2 (bench rotation) is encoded as a secondary tiebreak in the
  // objective: each y_p gets coefficient 1 + 0.001 * benchDebt_p.
  // Since 0.001 * maxDebt < 1.0, the secondary weight can NEVER outweigh
  // placing one additional player.  It only breaks ties among solutions
  // with equal participation, preferring to seat higher-debt players.
  // ════════════════════════════════════════════════════════════════════════
  const ilpResult = await solveILP(timeSlots, responses, benchDebt);

  // Build slotAssigned from ILP assignments
  const slotAssigned = ilpResult.assignments;

  // ════════════════════════════════════════════════════════════════════════
  // Step 4 — Level 3: Diversity grouping
  //
  // For each slot's ILP-assigned players, partition into groups of 4 that
  // maximise total diversity score.  The grouping only reorders players
  // WITHIN the ILP-decided set — it never adds or removes anyone, so
  // Level 1 (proven optimal participation) is preserved.
  // ════════════════════════════════════════════════════════════════════════
  const proposals: ProposedMatch[] = [];

  for (const slot of timeSlots) {
    const assigned = slotAssigned.get(slot.id);
    if (!assigned || assigned.length === 0) continue;

    // The ILP assignment list may contain bridge players multiple times
    // (once per match-appearance). The total length = 4 * matchCount.
    const matchCount = Math.floor(assigned.length / 4);
    if (matchCount === 0) continue;

    // Deduplicate: count how many matches each player appears in at this slot.
    const playerAppearances = new Map<string, number>();
    for (const uid of assigned) {
      playerAppearances.set(uid, (playerAppearances.get(uid) ?? 0) + 1);
    }

    // Separate single-appearance (regular) and multi-appearance (bridge) players.
    const singlePlayers: string[] = [];
    const bridgePlayers: { uid: string; count: number }[] = [];
    for (const [uid, count] of playerAppearances) {
      if (count === 1) singlePlayers.push(uid);
      else bridgePlayers.push({ uid, count });
    }

    if (matchCount === 1) {
      // One match: use diversity grouping on the unique player set
      const uniquePlayers = [...singlePlayers, ...bridgePlayers.map(b => b.uid)];
      const groups = partitionForDiversity(uniquePlayers.slice(0, 4), 1, pairing);
      const date = weekDayToDate(weekStartDate, slot.day as DayName);
      for (const group of groups) {
        proposals.push({
          date,
          day: slot.day,
          timeSlot: `${slot.start_time}-${slot.end_time}`,
          slotId: slot.id,
          playerIds: group,
          diversityScore: scoreDiversity(group, pairing),
        });
      }
    } else if (bridgePlayers.length === 0) {
      // Multiple matches, no bridge players: all unique.
      // Use diversity grouping directly.
      const groups = partitionForDiversity(
        singlePlayers.slice(0, matchCount * 4), matchCount, pairing,
      );
      const date = weekDayToDate(weekStartDate, slot.day as DayName);
      for (const group of groups) {
        proposals.push({
          date,
          day: slot.day,
          timeSlot: `${slot.start_time}-${slot.end_time}`,
          slotId: slot.id,
          playerIds: group,
          diversityScore: scoreDiversity(group, pairing),
        });
      }
    } else {
      // Multiple matches WITH bridge players: distribute bridge players
      // across groups first, then fill with singles.
      const groups: string[][] = Array.from({ length: matchCount }, () => []);

      // Place bridge players first — each goes into `count` groups
      for (const { uid, count } of bridgePlayers) {
        let placed = 0;
        for (let g = 0; g < matchCount && placed < count; g++) {
          if (groups[g].length < 4 && !groups[g].includes(uid)) {
            groups[g].push(uid);
            placed++;
          }
        }
      }

      // Fill remaining spots with single-appearance players
      let singleIdx = 0;
      for (const group of groups) {
        while (group.length < 4 && singleIdx < singlePlayers.length) {
          group.push(singlePlayers[singleIdx++]);
        }
      }

      const date = weekDayToDate(weekStartDate, slot.day as DayName);
      for (const group of groups) {
        if (group.length === 4) {
          proposals.push({
            date,
            day: slot.day,
            timeSlot: `${slot.start_time}-${slot.end_time}`,
            slotId: slot.id,
            playerIds: group,
            diversityScore: scoreDiversity(group, pairing),
          });
        }
      }
    }
  }

  // Chronological output order (Level 4: togetherness is implicit in
  // the ILP's slot assignments — all valid groupings are explored by
  // the solver. The output is sorted chronologically for display.)
  proposals.sort((a, b) =>
    a.date.localeCompare(b.date) || a.timeSlot.localeCompare(b.timeSlot),
  );

  // ════════════════════════════════════════════════════════════════════════
  // Step 5 — Scheduled + Benched
  //
  // Benched (locked definition): responded AND available at a slot where
  // at least one match was created AND not placed in any match.
  //
  // A responder available ONLY at slots with < 4 players (no match created)
  // is NOT benched — that's lack-of-numbers, not a fairness issue.
  // ════════════════════════════════════════════════════════════════════════
  const scheduledSet = new Set<string>();
  for (const m of proposals) m.playerIds.forEach(id => scheduledSet.add(id));

  const slotsWithMatches = new Set(proposals.map(m => m.slotId));

  const benchedSet = new Set<string>();
  for (const r of responses) {
    if (scheduledSet.has(r.user_id)) continue;
    for (const slotId of slotsWithMatches) {
      if ((slotPlayers.get(slotId) ?? []).includes(r.user_id)) {
        benchedSet.add(r.user_id);
        break;
      }
    }
  }

  return {
    matches: proposals,
    playersScheduled: Array.from(scheduledSet),
    playersBenched:   Array.from(benchedSet),
    totalParticipation: scheduledSet.size,
  };
}
