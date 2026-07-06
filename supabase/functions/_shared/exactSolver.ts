/**
 * Exact solver for maximum-participation match scheduling.
 *
 * Formulation: set-packing — choose a subset of candidate 4-player matches
 * to maximise the number of DISTINCT players placed, subject to per-player
 * match-count limits (can_play_twice).
 *
 * Algorithm: branch-and-bound DFS with three pruning strategies:
 *   1. UPPER BOUND: placed + reachable unplaced players (those who appear in
 *      at least one remaining candidate where all 4 players are still eligible).
 *   2. CANDIDATE ORDERING: most-constrained-player-first — candidates
 *      containing players with fewest remaining candidate appearances are
 *      tried first, pruning dominated branches earlier.
 *   3. SKIP DOMINATED: a candidate where all 4 players are already placed
 *      (and none are unlimited) adds zero new coverage — skip immediately.
 */

import type { TimeSlot, PollResponse } from "./matchEngine.ts";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ExactResult {
  maxPlaced: number;
  matches: string[][];   // the chosen groups of 4
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function playerLimit(r: PollResponse): number {
  if (r.can_play_twice === false) return 1;
  if (r.can_play_twice === true)  return 2;
  return 999;  // null = unlimited, capped for arithmetic
}

function combinations4(arr: string[]): string[][] {
  const result: string[][] = [];
  const n = arr.length;
  for (let i = 0; i < n - 3; i++)
    for (let j = i + 1; j < n - 2; j++)
      for (let k = j + 1; k < n - 1; k++)
        for (let l = k + 1; l < n; l++)
          result.push([arr[i], arr[j], arr[k], arr[l]]);
  return result;
}

// ── Solver ───────────────────────────────────────────────────────────────────

export function solveExact(
  timeSlots: TimeSlot[],
  responses: PollResponse[],
  deadlineMs: number = Infinity,
): ExactResult {
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

  // Generate deduplicated candidate matches across all slots
  const seen = new Set<string>();
  let candidates: string[][] = [];
  for (const s of timeSlots) {
    const avail = slotAvail.get(s.id) ?? [];
    if (avail.length < 4) continue;
    for (const group of combinations4(avail)) {
      const key = group.join(",");  // already sorted from combinations4
      if (!seen.has(key)) {
        seen.add(key);
        candidates.push(group);
      }
    }
  }

  if (candidates.length === 0) return { maxPlaced: 0, matches: [] };

  // ── PRUNING 2: Candidate ordering ──────────────────────────────────────
  // Score each candidate by the MINIMUM "remaining options" of its players.
  // Players appearing in fewer candidates are more constrained; matches
  // containing them should be explored first to prune aggressively.
  const playerCandCount = new Map<string, number>();
  for (const c of candidates) {
    for (const uid of c) {
      playerCandCount.set(uid, (playerCandCount.get(uid) ?? 0) + 1);
    }
  }
  candidates.sort((a, b) => {
    const minA = Math.min(...a.map(uid => playerCandCount.get(uid) ?? 0));
    const minB = Math.min(...b.map(uid => playerCandCount.get(uid) ?? 0));
    return minA - minB;  // most constrained first
  });

  // ── Branch-and-bound DFS ───────────────────────────────────────────────
  const totalPlayers = responses.length;
  let bestPlaced = 0;
  let bestMatches: string[][] = [];
  let exhausted = true;

  const matchCount = new Map<string, number>();
  const placed = new Set<string>();
  const chosen: number[] = [];  // indices into candidates
  const deadline = deadlineMs < Infinity ? performance.now() + deadlineMs : Infinity;
  let nodeCount = 0;

  function dfs(idx: number): void {
    if (placed.size > bestPlaced) {
      bestPlaced = placed.size;
      bestMatches = chosen.map(i => candidates[i]);
    }

    if (idx >= candidates.length) return;
    if (!exhausted) return;  // deadline abort propagation

    // Check deadline every 10K nodes
    if (++nodeCount % 10000 === 0 && deadline < Infinity && performance.now() > deadline) {
      exhausted = false;
      return;
    }

    // ── PRUNING 1: Upper bound on reachable players ──────────────────
    const unplaced = totalPlayers - placed.size;
    if (placed.size + unplaced <= bestPlaced) return;

    // Try including candidate[idx]
    const group = candidates[idx];

    // ── PRUNING 3: Skip dominated candidates ─────────────────────────
    // If all 4 players are already placed and none can add a new match
    // (all at limit), this candidate adds zero new coverage.
    let allPlaced = true;
    let canTake = true;
    for (const uid of group) {
      if (!placed.has(uid)) allPlaced = false;
      if ((matchCount.get(uid) ?? 0) >= limits.get(uid)!) {
        canTake = false;
        break;
      }
    }

    if (canTake && !allPlaced) {
      // Take this candidate
      const newPlayers: string[] = [];
      for (const uid of group) {
        matchCount.set(uid, (matchCount.get(uid) ?? 0) + 1);
        if (!placed.has(uid)) { placed.add(uid); newPlayers.push(uid); }
      }
      chosen.push(idx);

      dfs(idx + 1);

      chosen.pop();
      for (const uid of group) matchCount.set(uid, matchCount.get(uid)! - 1);
      for (const uid of newPlayers) placed.delete(uid);
    }

    // Skip this candidate (always explore)
    dfs(idx + 1);
  }

  dfs(0);
  return { maxPlaced: bestPlaced, matches: bestMatches };
}
