/**
 * Tests for exactSolver.ts — verify it matches the brute-force oracle
 * from matchEngine.test.ts on 1000 random inputs.
 *
 * Run: deno test supabase/functions/_shared/exactSolver.test.ts
 */

import { assertEquals, assert } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { solveExact } from "./exactSolver.ts";
import type { TimeSlot, PollResponse } from "./matchEngine.ts";

// ── Seeded PRNG (same as matchEngine.test.ts) ────────────────────────────────

function makeRng(seed: number) {
  let s = seed | 0 || 1;
  return () => {
    s ^= s << 13; s ^= s >> 17; s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

// ── Brute-force oracle (copied from matchEngine.test.ts) ─────────────────────

function combos<T>(arr: T[], k: number): T[][] {
  const result: T[][] = [];
  const c: T[] = [];
  (function go(start: number) {
    if (c.length === k) { result.push([...c]); return; }
    for (let i = start; i <= arr.length - (k - c.length); i++) {
      c.push(arr[i]);
      go(i + 1);
      c.pop();
    }
  })(0);
  return result;
}

function playerLimit(r: PollResponse): number {
  if (r.can_play_twice === false) return 1;
  if (r.can_play_twice === true)  return 2;
  return 999;
}

function oracleMaxParticipation(
  timeSlots: TimeSlot[],
  responses: PollResponse[],
): number {
  const slotAvail = new Map<string, string[]>();
  for (const s of timeSlots) {
    const avail: string[] = [];
    for (const r of responses) {
      if ((r.selected_slots ?? []).includes(s.id)) avail.push(r.user_id);
    }
    slotAvail.set(s.id, avail);
  }

  const limits = new Map<string, number>();
  for (const r of responses) limits.set(r.user_id, playerLimit(r));

  const seen = new Set<string>();
  const candidates: string[][] = [];
  for (const s of timeSlots) {
    const avail = slotAvail.get(s.id) ?? [];
    if (avail.length < 4) continue;
    for (const group of combos(avail, 4)) {
      const key = [...group].sort().join(",");
      if (!seen.has(key)) { seen.add(key); candidates.push(group); }
    }
  }

  const allPlayerIds = new Set(responses.map(r => r.user_id));
  let best = 0;
  const matchCount = new Map<string, number>();
  const placed = new Set<string>();

  function dfs(idx: number): void {
    if (placed.size > best) best = placed.size;
    if (idx >= candidates.length) return;
    if (placed.size + (allPlayerIds.size - placed.size) <= best) return;

    dfs(idx + 1);

    const group = candidates[idx];
    let canTake = true;
    for (const uid of group) {
      if ((matchCount.get(uid) ?? 0) >= (limits.get(uid) ?? 1)) {
        canTake = false; break;
      }
    }
    if (canTake) {
      const newP: string[] = [];
      for (const uid of group) {
        matchCount.set(uid, (matchCount.get(uid) ?? 0) + 1);
        if (!placed.has(uid)) { placed.add(uid); newP.push(uid); }
      }
      dfs(idx + 1);
      for (const uid of group) matchCount.set(uid, matchCount.get(uid)! - 1);
      for (const uid of newP) placed.delete(uid);
    }
  }

  dfs(0);
  return best;
}

// ── Random input generator (same as matchEngine.test.ts) ─────────────────────

function slot(id: string, day: string, start: string, end: string): TimeSlot {
  return { id, day, start_time: start, end_time: end };
}

function randomInput(rng: () => number): { timeSlots: TimeSlot[]; responses: PollResponse[] } {
  const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday"];
  const slotCount = 2 + Math.floor(rng() * 3);
  const playerCount = 6 + Math.floor(rng() * 7);

  const timeSlots: TimeSlot[] = [];
  for (let i = 0; i < slotCount; i++) {
    timeSlots.push(slot(`s${i}`, DAYS[i % DAYS.length], "19:00", "20:30"));
  }

  const responses: PollResponse[] = [];
  for (let p = 0; p < playerCount; p++) {
    const availCount = 1 + Math.floor(rng() * slotCount);
    const shuffled = [...timeSlots].sort(() => rng() - 0.5);
    const selected = shuffled.slice(0, availCount).map(s => s.id);
    const r = rng();
    const canPlayTwice = r < 0.7 ? false : r < 0.9 ? true : null;

    responses.push({
      user_id: `p${p}`,
      selected_slots: selected,
      flexible_times: null,
      can_play_twice: canPlayTwice,
    });
  }

  return { timeSlots, responses };
}

// ── Tests ────────────────────────────────────────────────────────────────────

Deno.test("Exact solver matches oracle on counterexample (oracle=9, engine=4)", () => {
  const s0: TimeSlot = { id: "s0", day: "Monday",    start_time: "19:00", end_time: "20:30" };
  const s1: TimeSlot = { id: "s1", day: "Tuesday",   start_time: "19:00", end_time: "20:30" };
  const s2: TimeSlot = { id: "s2", day: "Wednesday", start_time: "19:00", end_time: "20:30" };
  const s3: TimeSlot = { id: "s3", day: "Thursday",  start_time: "19:00", end_time: "20:30" };

  const responses: PollResponse[] = [
    { user_id: "p0", selected_slots: ["s1","s0","s2"],      flexible_times: null, can_play_twice: false },
    { user_id: "p1", selected_slots: ["s1","s0","s2","s3"], flexible_times: null, can_play_twice: false },
    { user_id: "p2", selected_slots: ["s3","s2"],           flexible_times: null, can_play_twice: false },
    { user_id: "p3", selected_slots: ["s0","s1","s3"],      flexible_times: null, can_play_twice: false },
    { user_id: "p4", selected_slots: ["s1"],                flexible_times: null, can_play_twice: false },
    { user_id: "p5", selected_slots: ["s1"],                flexible_times: null, can_play_twice: null },
    { user_id: "p6", selected_slots: ["s0","s1","s3","s2"], flexible_times: null, can_play_twice: false },
    { user_id: "p7", selected_slots: ["s2","s3"],           flexible_times: null, can_play_twice: false },
    { user_id: "p8", selected_slots: ["s3","s1"],           flexible_times: null, can_play_twice: null },
  ];

  const result = solveExact([s0, s1, s2, s3], responses);
  const oracle = oracleMaxParticipation([s0, s1, s2, s3], responses);

  console.log(`Exact solver: ${result.maxPlaced} placed, ${result.matches.length} matches`);
  for (const m of result.matches) console.log(`  [${m.join(",")}]`);
  console.log(`Oracle: ${oracle} placed`);

  assertEquals(result.maxPlaced, oracle, `exact=${result.maxPlaced} oracle=${oracle}`);
  assertEquals(result.maxPlaced, 9, "should place all 9 players");
});

Deno.test("Exact solver matches oracle on 1000 random inputs", () => {
  const rng = makeRng(42);
  let mismatches = 0;
  let tested = 0;

  for (let i = 0; i < 1000; i++) {
    const { timeSlots, responses } = randomInput(rng);
    const exact = solveExact(timeSlots, responses);
    const oracle = oracleMaxParticipation(timeSlots, responses);

    if (exact.maxPlaced !== oracle) {
      console.log(`Trial ${i}: exact=${exact.maxPlaced} oracle=${oracle}`);
      mismatches++;
    }
    tested++;
  }

  console.log(`Tested ${tested} inputs, ${mismatches} mismatches`);
  assertEquals(mismatches, 0, `${mismatches} inputs where exact solver != oracle`);
});
