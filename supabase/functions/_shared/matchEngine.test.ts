/**
 * Tests for matchEngine.ts — pure assignment core.
 *
 * Run: deno test supabase/functions/_shared/matchEngine.test.ts
 */

import { assertEquals, assert } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import {
  generateProposals,
  type TimeSlot,
  type PollResponse,
  type BenchHistory,
  type PairingRecord,
  type EngineInput,
} from "./matchEngine.ts";

// ── Helpers ──────────────────────────────────────────────────────────────────

function slot(id: string, day: string, start: string, end: string): TimeSlot {
  return { id, day, start_time: start, end_time: end };
}

function resp(
  userId: string,
  slots: string[],
  canPlayTwice: boolean | null = false,
): PollResponse {
  return { user_id: userId, selected_slots: slots, flexible_times: null, can_play_twice: canPlayTwice };
}

function base(overrides: Partial<EngineInput>): EngineInput {
  return {
    weekStartDate: "2026-07-06",  // a Monday
    timeSlots: [],
    responses: [],
    benchHistory: [],
    pairingHistory: [],
    togetherness: false,
    ...overrides,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. PARTICIPATION MAXIMISATION
//    8 players at 2 exclusive slots -> 2 matches, all 8 scheduled, 0 benched.
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("Level 1: maximise participation across exclusive slots", async () => {
  const mon = slot("mon19", "Monday", "19:00", "20:30");
  const tue = slot("tue19", "Tuesday", "19:00", "20:30");

  const out = await generateProposals(base({
    timeSlots: [mon, tue],
    responses: [
      resp("p1", ["mon19"]), resp("p2", ["mon19"]),
      resp("p3", ["mon19"]), resp("p4", ["mon19"]),
      resp("p5", ["tue19"]), resp("p6", ["tue19"]),
      resp("p7", ["tue19"]), resp("p8", ["tue19"]),
    ],
  }));

  assertEquals(out.matches.length, 2, "should create 2 matches");
  assertEquals(out.totalParticipation, 8, "all 8 players should be scheduled");
  assertEquals(out.playersBenched.length, 0, "nobody benched");
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. BENCH ROTATION TIEBREAK
//    6 players, 1 slot -> 1 match (4 players). Top 4 by bench-debt play;
//    bottom 2 are benched.
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("Level 2: highest bench-debt players get priority", async () => {
  const mon = slot("mon19", "Monday", "19:00", "20:30");

  const out = await generateProposals(base({
    timeSlots: [mon],
    responses: [
      resp("p1", ["mon19"]), resp("p2", ["mon19"]),
      resp("p3", ["mon19"]), resp("p4", ["mon19"]),
      resp("p5", ["mon19"]), resp("p6", ["mon19"]),
    ],
    benchHistory: [
      { user_id: "p1", bench_count: 5 },
      { user_id: "p2", bench_count: 4 },
      { user_id: "p3", bench_count: 3 },
      { user_id: "p4", bench_count: 2 },
      { user_id: "p5", bench_count: 1 },
      { user_id: "p6", bench_count: 0 },
    ],
  }));

  assertEquals(out.matches.length, 1, "1 match from 6 players");
  assertEquals(out.totalParticipation, 4);

  const scheduled = new Set(out.playersScheduled);
  assert(scheduled.has("p1"), "p1 (debt=5) should play");
  assert(scheduled.has("p2"), "p2 (debt=4) should play");
  assert(scheduled.has("p3"), "p3 (debt=3) should play");
  assert(scheduled.has("p4"), "p4 (debt=2) should play");

  const benched = new Set(out.playersBenched);
  assert(benched.has("p5"), "p5 (debt=1) should be benched");
  assert(benched.has("p6"), "p6 (debt=0) should be benched");
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. PAIRING DIVERSITY
//    8 players, 1 slot, 2 matches. p1+p2 have 5 shared matches, p3+p4 have 5.
//    Optimal split separates both pairs into different groups.
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("Level 3: diversity grouping separates frequent pairs", async () => {
  const mon = slot("mon19", "Monday", "19:00", "20:30");

  const pairingHistory: PairingRecord[] = [];
  for (let i = 0; i < 5; i++) {
    pairingHistory.push({ player_ids: ["p1", "p2", "pX", "pY"], match_date: "2026-06-01" });
    pairingHistory.push({ player_ids: ["p3", "p4", "pX", "pY"], match_date: "2026-06-01" });
  }

  const out = await generateProposals(base({
    timeSlots: [mon],
    responses: [
      resp("p1", ["mon19"]), resp("p2", ["mon19"]),
      resp("p3", ["mon19"]), resp("p4", ["mon19"]),
      resp("p5", ["mon19"]), resp("p6", ["mon19"]),
      resp("p7", ["mon19"]), resp("p8", ["mon19"]),
    ],
    pairingHistory,
  }));

  assertEquals(out.matches.length, 2, "2 matches from 8 players");

  for (const m of out.matches) {
    const ids = new Set(m.playerIds);
    assert(!(ids.has("p1") && ids.has("p2")), "p1 and p2 must be in different groups");
    assert(!(ids.has("p3") && ids.has("p4")), "p3 and p4 must be in different groups");
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// 3b. DIVERSITY WITH BRIDGE PLAYERS
//     1 slot, 6 limit-1 players + 2 bridges (unlimited).  The ILP needs both
//     bridges in both matches to reach sum = 6*1 + 2*2 = 10? No, 4*m = 8 for
//     m=2. So: 6 singles (contribute 6) + 2 bridges (contribute 1 each) = 8.
//     That means bridges appear once each and there's no multi-match bridge.
//
//     For bridge reuse: 5 singles + 3 bridges at 1 slot.  m=2 → sum=8.
//     5*1 + 3*1 = 8 → each bridge once. Still no reuse.
//
//     Bridge reuse only happens when singles < 3 per match.
//     3 singles + 1 bridge at 1 slot → m=1 → [s1,s2,s3,B]. No multi-match.
//
//     2 slots: slot A has [p1,p2,p3,B1,B2], slot B has [p4,p5,p6,B1,B2].
//     Each slot has 5 players. ILP: A m=1 takes 4, B m=1 takes 4.
//     B1 and B2 each available at both slots → ILP assigns each bridge to
//     one slot. Total 8 placed. No bridge reuse within a slot.
//
//     The bridge-reuse-within-a-slot case requires 3 singles + 2 bridges (5)
//     at 1 slot with m=2: sum = 3 + 2*something = 8 → each bridge contributes
//     2.5. Not integer! m=1: sum = 4. Takes [3 singles + 1 bridge] or
//     [2 singles + 2 bridges]. Either way pB appears once.
//
//     Conclusion: bridge reuse within a single slot requires at LEAST 4
//     bridges (4 bridges * 2 appearances = 8 = 4*2). With 4 bridges and 0
//     singles: m=2, each bridge in both matches. [B1,B2,B3,B4] and
//     [B1,B2,B3,B4] — same group twice!
//
//     The realistic bridge-reuse case is CROSS-SLOT (bridge plays at slot A
//     match AND slot B match). The grouping per-slot always has at most 1
//     bridge appearance. The three-branch code's bridge path is hit only
//     when the ILP emits x_{B,s} > 1 at some slot.
//
//     Test: 4 bridges + 4 singles at 1 slot. ILP: m=2.
//     sum = 4*1 + 4*x_B ≤ 8. Each bridge x_B ≤ m=2. If all bridges appear
//     once: sum = 8 = 4*2. m=2 works without reuse!
//     The ILP will NOT reuse bridges unless forced. To force: 2 singles + 2
//     bridges at 1 slot. m=1: sum = 4. Take any 4. Can't place all 4 in m=1.
//     m=2: sum = 2*1 + 2*2 = 6 ≠ 8. Infeasible.
//
//     The within-slot bridge reuse path is actually very rare — it only
//     fires when the ILP's integer solution has x_{p,s} > 1, which requires
//     the slot to have fewer unique players than 4*m. This typically means
//     the slot has e.g. 3 unique players who between them fill 2 matches
//     via bridge reuse — a very degenerate case.
//
//     For now: test diversity on the CROSS-SLOT bridge case, which is the
//     common path. The single-path fix will handle both.
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("Level 3: bridge within-slot diversity separates frequent pairs", async () => {
  // 1 slot: 4 singles + 3 bridges. ILP creates 4 matches. Each match:
  // [1 single + 3 bridges]. p1+B1 have 5 shared matches → diversity should
  // put p1 in a match WITHOUT B1 if possible. Since each match has all 3
  // bridges, this is impossible — so instead test that when we have 2 matches
  // with room to swap, the swap happens.
  //
  // Simpler: 6 singles + 2 bridges at 1 slot. m=2 → sum=8.
  // 6*1 + 2*1 = 8. No bridge reuse! Each bridge once. Both use matchCount=1
  // path. Not helpful.
  //
  // 4 singles + 2 bridges. m=1 (sum=4). Can place 4: e.g. [p1,p2,B1,B2].
  // Only 1 match, no grouping choice.
  //
  // The REAL bridge-reuse-with-grouping-choice case:
  // 6 singles + 2 bridges at 1 slot, m=2 → sum=8.
  // 6 + 2*1 = 8 → each bridge once. This is the no-bridge-reuse path
  // (bridgePlayers.length > 0 but each count=1 → classified as single).
  // Wait — the code checks count > 1. If count=1 they go to singlePlayers.
  // So this is the all-singles path. Diversity DOES apply. Good.
  //
  // For bridge reuse: need x_{B,s} > 1. Need fewer unique players than 4*m.
  // 5 unique + 1 bridge with x=3: sum = 5 + 3 = 8 = 4*2. m=2.
  // Matches: bridge in 3 of 2 matches — impossible (x <= m=2). So x=2.
  // 5 + 2 = 7 ≠ 8. Need another: 5 + 2 + 1 (another bridge at x=1) = 8.
  // So: 5 singles + 2 bridges, bridge1 at x=2, bridge2 at x=1.
  //
  // ILP will find this. 5 singles + 2 bridges = 7 unique, 2 matches.
  // Matches: [s1,s2,s3,B1] and [s4,s5,B1,B2]. B1 in both (x=2). B2 in one.
  // The sequential bridge branch places B1 into groups 0 and 1, then B2
  // into group 0. Then fills singles sequentially: g0=[B1,B2,s1,s2],
  // g1=[B1,s3,s4,s5]. No diversity consideration.
  //
  // If s1+B1 have heavy history, diversity should put s1 in group 1 (without B1
  // is impossible since B1 is in both). So this test doesn't work for separation.
  //
  // I'll construct: 2 bridges (B1,B2) each in both matches, + 4 singles.
  // x_B1 = x_B2 = 2, sum = 4 + 4 = 8 = 4*2. ILP: 4 singles at x=1, 2 bridges
  // at x=2. Total appearances = 8. Matches: each match has 2 bridges + 2 singles.
  // Singles can be distributed: {s1,s2} and {s3,s4} or {s1,s3} and {s2,s4} etc.
  // If s1+s2 have heavy history, diversity should put s1+s3 in one group and
  // s2+s4 in the other.
  const mon = slot("mon19", "Monday", "19:00", "20:30");

  const pairingHistory: PairingRecord[] = [];
  for (let i = 0; i < 5; i++) {
    pairingHistory.push({ player_ids: ["s1", "s2", "pX", "pY"], match_date: "2026-06-01" });
  }

  const out = await generateProposals(base({
    timeSlots: [mon],
    responses: [
      resp("s1", ["mon19"]), resp("s2", ["mon19"]),
      resp("s3", ["mon19"]), resp("s4", ["mon19"]),
      resp("B1", ["mon19"], null), resp("B2", ["mon19"], null),
    ],
    pairingHistory,
  }));

  assertEquals(out.matches.length, 2, "2 matches with bridge reuse");
  assertEquals(out.totalParticipation, 6, "all 6 placed");

  // Each match must have 4 distinct players
  for (const m of out.matches) {
    assertEquals(new Set(m.playerIds).size, 4, `match must have 4 distinct: [${m.playerIds}]`);
  }

  // s1 and s2 must be in DIFFERENT groups (diversity should separate them)
  for (const m of out.matches) {
    const ids = new Set(m.playerIds);
    assert(
      !(ids.has("s1") && ids.has("s2")),
      `s1 and s2 must be in different groups for diversity, found together: [${m.playerIds.join(",")}]`,
    );
  }
});

Deno.test("Level 3: bridge cross-slot diversity separates frequent pairs", async () => {
  // 2 slots. p1-p3 at slot A, p4-p6 at slot B, bridges B1+B2 at both.
  // p1+B1 played together 5 times. Diversity should avoid putting them together.
  const sA = slot("sA", "Monday", "19:00", "20:30");
  const sB = slot("sB", "Tuesday", "19:00", "20:30");

  const pairingHistory: PairingRecord[] = [];
  for (let i = 0; i < 5; i++) {
    pairingHistory.push({ player_ids: ["p1", "B1", "pX", "pY"], match_date: "2026-06-01" });
  }

  const out = await generateProposals(base({
    timeSlots: [sA, sB],
    responses: [
      resp("p1", ["sA"]), resp("p2", ["sA"]), resp("p3", ["sA"]),
      resp("p4", ["sB"]), resp("p5", ["sB"]), resp("p6", ["sB"]),
      resp("B1", ["sA", "sB"], null),
      resp("B2", ["sA", "sB"], null),
    ],
    pairingHistory,
  }));

  assertEquals(out.matches.length, 2, "2 matches");
  assertEquals(out.totalParticipation, 8, "all 8 placed");

  // At slot A: group is [p1, p2, p3, B?]. Diversity should prefer B2 over B1
  // because p1+B1 have high frequency. The no-bridge path uses
  // partitionForDiversity which handles this. But which path fires?
  const slotAMatch = out.matches.find(m => m.day === "Monday");
  assert(slotAMatch !== undefined, "Monday match must exist");
  const aIds = new Set(slotAMatch!.playerIds);

  // If diversity works: B2 should be at slot A (not B1, who has history with p1)
  // If diversity is disabled: B1 may land at slot A
  if (aIds.has("p1") && aIds.has("B1")) {
    // This is the diversity failure — p1+B1 should be separated
    throw new Error(
      `Diversity failure: p1 and B1 in same match [${slotAMatch!.playerIds.join(",")}] ` +
      `despite 5 shared history matches. B2 should have been chosen for slot A instead.`
    );
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. BENCHED EDGE CASE
//    mon19: 5 players -> 1 match -> 1 benched.
//    tue19: 2 players -> no match -> NOT benched (lack-of-numbers).
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("Benched: empty-slot responders are NOT benched", async () => {
  const mon = slot("mon19", "Monday", "19:00", "20:30");
  const tue = slot("tue19", "Tuesday", "19:00", "20:30");

  const out = await generateProposals(base({
    timeSlots: [mon, tue],
    responses: [
      resp("p1", ["mon19"]), resp("p2", ["mon19"]),
      resp("p3", ["mon19"]), resp("p4", ["mon19"]),
      resp("p5", ["mon19"]),
      resp("p6", ["tue19"]), resp("p7", ["tue19"]),
    ],
  }));

  assertEquals(out.matches.length, 1, "only Monday match");
  assertEquals(out.totalParticipation, 4);

  // Exactly 1 of the 5 Monday players is benched (ILP picks any 4 of 5)
  const monPlayers = ["p1","p2","p3","p4","p5"];
  const benchedMon = monPlayers.filter(p => out.playersBenched.includes(p));
  assertEquals(benchedMon.length, 1, "exactly 1 Monday player benched");

  // p6, p7 available only at Tuesday (no match) → NOT benched
  assert(!out.playersBenched.includes("p6"), "p6 not benched (empty slot)");
  assert(!out.playersBenched.includes("p7"), "p7 not benched (empty slot)");
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. CAN_PLAY_TWICE
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("can_play_twice=true allows a player in 2 matches", async () => {
  const s1 = slot("mon19", "Monday", "19:00", "20:30");
  const s2 = slot("mon21", "Monday", "20:30", "22:00");

  const out = await generateProposals(base({
    timeSlots: [s1, s2],
    responses: [
      resp("p1", ["mon19", "mon21"], true),
      resp("p2", ["mon19"]), resp("p3", ["mon19"]), resp("p4", ["mon19"]),
      resp("p5", ["mon21"]), resp("p6", ["mon21"]), resp("p7", ["mon21"]),
    ],
  }));

  assertEquals(out.matches.length, 2, "2 matches");
  const p1Matches = out.matches.filter(m => m.playerIds.includes("p1"));
  assertEquals(p1Matches.length, 2, "p1 should be in 2 matches");
  assertEquals(out.totalParticipation, 7, "7 distinct players");
  assertEquals(out.playersBenched.length, 0);
});

// ══════════════════════════════════════════════════════════════════════════════
// 6. TOGETHERNESS PRESERVES PARTICIPATION
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("Level 4: togetherness does not reduce participation", async () => {
  const mon = slot("mon19", "Monday", "19:00", "20:30");
  const tue = slot("tue19", "Tuesday", "19:00", "20:30");

  const responses = [
    resp("m1", ["mon19"]), resp("m2", ["mon19"]),
    resp("m3", ["mon19"]), resp("m4", ["mon19"]),
    resp("t1", ["tue19"]), resp("t2", ["tue19"]),
    resp("t3", ["tue19"]), resp("t4", ["tue19"]),
    resp("t5", ["tue19"]), resp("t6", ["tue19"]),
    resp("f1", ["mon19", "tue19"]), resp("f2", ["mon19", "tue19"]),
    resp("f3", ["mon19", "tue19"]), resp("f4", ["mon19", "tue19"]),
  ];

  const spread = await generateProposals(base({
    timeSlots: [mon, tue], responses, togetherness: false,
  }));
  const cluster = await generateProposals(base({
    timeSlots: [mon, tue], responses, togetherness: true,
  }));

  assertEquals(
    spread.totalParticipation, cluster.totalParticipation,
    `participation must match: spread=${spread.totalParticipation} cluster=${cluster.totalParticipation}`,
  );
  const spreadTue = spread.matches.filter(m => m.day === "Tuesday").length;
  const clusterTue = cluster.matches.filter(m => m.day === "Tuesday").length;
  assert(clusterTue >= spreadTue, "togetherness should cluster on Tue");
});

// ══════════════════════════════════════════════════════════════════════════════
// 7. FLEXIBILITY TIEBREAK
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("Flexibility tiebreak preserves exclusive player placement", async () => {
  const mon = slot("mon19", "Monday", "19:00", "20:30");
  const tue = slot("tue19", "Tuesday", "19:00", "20:30");

  const out = await generateProposals(base({
    timeSlots: [mon, tue],
    responses: [
      resp("p1", ["mon19", "tue19"]), resp("p2", ["mon19", "tue19"]),
      resp("p3", ["mon19", "tue19"]), resp("p4", ["mon19", "tue19"]),
      resp("p5", ["tue19"]), resp("p6", ["tue19"]),
      resp("p7", ["tue19"]), resp("p8", ["tue19"]),
      resp("p9", ["mon19"]),
    ],
  }));

  const monMatch = out.matches.find(m => m.day === "Monday");
  assert(monMatch !== undefined, "Monday match must exist");
  assert(monMatch!.playerIds.includes("p9"), "p9 (exclusive) must be in Monday match");
  const tueMatch = out.matches.find(m => m.day === "Tuesday");
  assert(tueMatch !== undefined, "Tuesday match must exist");
  assertEquals(out.totalParticipation, 8, "8 of 9 scheduled");
});

// ══════════════════════════════════════════════════════════════════════════════
// 8. CROSS-SLOT GLOBAL PARTICIPATION
//    4 exclusive slots each with 5 (4 excl + 1 flex).  Each flex available at
//    its exclusive slot + a shared pool slot (4 players).
//    Ascending order: pool(4) < sA-sD(5) -> pool processed first -> all 4 flex
//    placed.  Then each exclusive slot has 4 left -> 4 more matches.
//    Result: 5 matches, 20 players.
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("Level 1 global: greedy handles scattered flex leftovers via slot ordering", async () => {
  const sA   = slot("sA",   "Monday",    "19:00", "20:30");
  const sB   = slot("sB",   "Tuesday",   "19:00", "20:30");
  const sC   = slot("sC",   "Wednesday", "19:00", "20:30");
  const sD   = slot("sD",   "Thursday",  "19:00", "20:30");
  const pool = slot("pool", "Friday",    "19:00", "20:30");

  const out = await generateProposals(base({
    timeSlots: [sA, sB, sC, sD, pool],
    responses: [
      resp("e1",  ["sA"]), resp("e2",  ["sA"]), resp("e3",  ["sA"]), resp("e4",  ["sA"]),
      resp("e5",  ["sB"]), resp("e6",  ["sB"]), resp("e7",  ["sB"]), resp("e8",  ["sB"]),
      resp("e9",  ["sC"]), resp("e10", ["sC"]), resp("e11", ["sC"]), resp("e12", ["sC"]),
      resp("e13", ["sD"]), resp("e14", ["sD"]), resp("e15", ["sD"]), resp("e16", ["sD"]),
      resp("f1", ["sA", "pool"]), resp("f2", ["sB", "pool"]),
      resp("f3", ["sC", "pool"]), resp("f4", ["sD", "pool"]),
    ],
  }));

  assertEquals(out.matches.length, 5, "5 matches: 1 pool + 4 exclusive slots");
  assertEquals(out.totalParticipation, 20, "all 20 players scheduled");
  assertEquals(out.playersBenched.length, 0, "nobody benched");
});

// ══════════════════════════════════════════════════════════════════════════════
// 9. FLEX AS 4TH — mutual exclusion is handled optimally
//    f1 is the 4th at both B and C. Greedy picks one; max is 1 match either way.
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("Level 1 global: flex as 4th player — optimal with mutual exclusion", async () => {
  const sB = slot("sB", "Tuesday",   "19:00", "20:30");
  const sC = slot("sC", "Wednesday", "19:00", "20:30");

  const out = await generateProposals(base({
    timeSlots: [sB, sC],
    responses: [
      resp("e1", ["sB"]), resp("e2", ["sB"]), resp("e3", ["sB"]),
      resp("e4", ["sC"]), resp("e5", ["sC"]), resp("e6", ["sC"]),
      resp("f1", ["sB", "sC"]),
    ],
  }));

  assertEquals(out.matches.length, 1, "1 match (f1 can only be the 4th at one slot)");
  assertEquals(out.totalParticipation, 4);
  assert(out.playersScheduled.includes("f1"), "f1 must be scheduled");
});

// ══════════════════════════════════════════════════════════════════════════════
// 10. BRUTE-FORCE ORACLE + PROPERTY TEST
//
// Independent exhaustive solver: enumerates ALL valid sets of 4-player matches
// across all slots, respecting availability and can_play_twice, and returns the
// maximum number of distinct players that can be placed.
//
// Then: 1000 random small inputs compared engine vs oracle.
// ══════════════════════════════════════════════════════════════════════════════

/** Seeded PRNG (xorshift32) for reproducible random inputs. */
function makeRng(seed: number) {
  let s = seed | 0 || 1;
  return () => {
    s ^= s << 13; s ^= s >> 17; s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** All combinations of `k` elements from `arr`. */
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

/** Max matches a player can be in, mirroring matchEngine.ts:82-86. */
function playerLimit(r: PollResponse): number {
  if (r.can_play_twice === false) return 1;
  if (r.can_play_twice === true)  return 2;
  return 999; // null = unlimited, capped for sanity
}

/**
 * Brute-force oracle: returns the maximum number of DISTINCT players placeable
 * in valid 4-player matches.
 *
 * Algorithm: for each slot, generate the DISTINCT sets of 4 available players,
 * deduplicated by sorted player key (a group [A,B,C,D] available at two slots
 * appears once).  Then DFS over subsets with aggressive pruning:
 *   - upper bound: placed + unplaced players who still have eligible slots
 *   - skip branches where a player would exceed their match limit
 *
 * Exponential worst-case but tractable for <=12 players / <=4 slots.
 */
function oracleMaxParticipation(
  timeSlots: TimeSlot[],
  responses: PollResponse[],
): number {
  // Build availability per slot
  const slotAvail = new Map<string, string[]>();
  for (const s of timeSlots) {
    const avail: string[] = [];
    for (const r of responses) {
      const selected = r.selected_slots ?? [];
      if (selected.includes(s.id)) avail.push(r.user_id);
    }
    slotAvail.set(s.id, avail);
  }

  // Build per-player limits
  const limits = new Map<string, number>();
  for (const r of responses) limits.set(r.user_id, playerLimit(r));

  // Generate all candidate matches, deduplicated by sorted player key
  const seen = new Set<string>();
  const candidates: string[][] = [];
  for (const s of timeSlots) {
    const avail = slotAvail.get(s.id) ?? [];
    if (avail.length < 4) continue;
    for (const group of combos(avail, 4)) {
      const key = [...group].sort().join(",");
      if (!seen.has(key)) {
        seen.add(key);
        candidates.push(group);
      }
    }
  }

  // All player ids for upper-bound computation
  const allPlayerIds = new Set(responses.map(r => r.user_id));

  // DFS: try including or excluding each candidate match
  let best = 0;
  const matchCount = new Map<string, number>();
  const placed = new Set<string>();

  function dfs(idx: number): void {
    if (placed.size > best) best = placed.size;
    if (idx >= candidates.length) return;

    // Tight upper bound: current placed + number of unplaced players
    // (even if we magically placed all remaining unplaced, could we beat best?)
    const unplacedCount = allPlayerIds.size - placed.size;
    if (placed.size + unplacedCount <= best) return;

    // Branch 1: skip this candidate
    dfs(idx + 1);

    // Branch 2: include this candidate (if all players eligible)
    const group = candidates[idx];
    let canTake = true;
    for (const uid of group) {
      if ((matchCount.get(uid) ?? 0) >= (limits.get(uid) ?? 1)) {
        canTake = false;
        break;
      }
    }

    if (canTake) {
      const newPlayers: string[] = [];
      for (const uid of group) {
        matchCount.set(uid, (matchCount.get(uid) ?? 0) + 1);
        if (!placed.has(uid)) { placed.add(uid); newPlayers.push(uid); }
      }

      dfs(idx + 1);

      for (const uid of group) matchCount.set(uid, matchCount.get(uid)! - 1);
      for (const uid of newPlayers) placed.delete(uid);
    }
  }

  dfs(0);
  return best;
}

/** Recording variant of oracle — returns the actual matches chosen. */
function oracleWithSolution(
  timeSlots: TimeSlot[],
  responses: PollResponse[],
): { placed: number; matches: string[][] } {
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

  let bestPlaced = 0;
  let bestMatches: string[][] = [];
  const matchCount = new Map<string, number>();
  const placed = new Set<string>();
  const chosen: string[][] = [];

  function dfs(idx: number): void {
    if (placed.size > bestPlaced) {
      bestPlaced = placed.size;
      bestMatches = chosen.map(c => [...c]);
    }
    if (idx >= candidates.length) return;
    const unplacedCount = responses.length - placed.size;
    if (placed.size + unplacedCount <= bestPlaced) return;

    dfs(idx + 1);

    const group = candidates[idx];
    let canTake = true;
    for (const uid of group) {
      if ((matchCount.get(uid) ?? 0) >= (limits.get(uid) ?? 1)) { canTake = false; break; }
    }
    if (canTake) {
      const newP: string[] = [];
      for (const uid of group) {
        matchCount.set(uid, (matchCount.get(uid) ?? 0) + 1);
        if (!placed.has(uid)) { placed.add(uid); newP.push(uid); }
      }
      chosen.push(group);
      dfs(idx + 1);
      chosen.pop();
      for (const uid of group) matchCount.set(uid, matchCount.get(uid)! - 1);
      for (const uid of newP) placed.delete(uid);
    }
  }

  dfs(0);
  return { placed: bestPlaced, matches: bestMatches };
}

/** Generate a random poll input for the property test. */
function randomInput(rng: () => number): EngineInput {
  const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday"];
  const slotCount = 2 + Math.floor(rng() * 3); // 2-4
  const playerCount = 6 + Math.floor(rng() * 7); // 6-12

  const timeSlots: TimeSlot[] = [];
  for (let i = 0; i < slotCount; i++) {
    timeSlots.push({
      id: `s${i}`,
      day: DAYS[i % DAYS.length],
      start_time: "19:00",
      end_time: "20:30",
    });
  }

  const responses: PollResponse[] = [];
  for (let p = 0; p < playerCount; p++) {
    // Each player available at 1-slotCount slots (at least 1)
    const availCount = 1 + Math.floor(rng() * slotCount);
    // Pick random subset of slots
    const shuffled = [...timeSlots].sort(() => rng() - 0.5);
    const selected = shuffled.slice(0, availCount).map(s => s.id);

    // Random can_play_twice: 70% false, 20% true, 10% null
    const r = rng();
    const canPlayTwice = r < 0.7 ? false : r < 0.9 ? true : null;

    responses.push({
      user_id: `p${p}`,
      selected_slots: selected,
      flexible_times: null,
      can_play_twice: canPlayTwice,
    });
  }

  return {
    weekStartDate: "2026-07-06",
    timeSlots,
    responses,
    benchHistory: [],
    pairingHistory: [],
    togetherness: false,
  };
}

Deno.test("Property: engine participation matches brute-force oracle on 1000 random inputs", async () => {
  const rng = makeRng(42);
  let tested = 0;
  let maxGap = 0;
  let worstInput: EngineInput | null = null;
  let worstEngine = 0;
  let worstOracle = 0;

  for (let i = 0; i < 1000; i++) {
    const input = randomInput(rng);
    const engineResult = await generateProposals(input);
    const oracleResult = oracleMaxParticipation(input.timeSlots, input.responses);

    const gap = oracleResult - engineResult.totalParticipation;

    if (gap > maxGap) {
      maxGap = gap;
      worstInput = input;
      worstEngine = engineResult.totalParticipation;
      worstOracle = oracleResult;
    }

    // Engine must never EXCEED oracle (would mean oracle is buggy)
    assert(
      engineResult.totalParticipation <= oracleResult,
      `Trial ${i}: engine ${engineResult.totalParticipation} > oracle ${oracleResult} — oracle bug`,
    );

    tested++;
  }

  console.log(`Property test: ${tested} trials completed`);
  console.log(`Max gap (oracle - engine): ${maxGap}`);

  if (maxGap > 0 && worstInput) {
    const slots = worstInput.timeSlots.map(s => s.id).join(",");
    const players = worstInput.responses.map(r =>
      `${r.user_id}:[${(r.selected_slots ?? []).join(",")}]cpt=${r.can_play_twice}`
    ).join(" ");
    console.log(`Worst case: oracle=${worstOracle} engine=${worstEngine}`);
    console.log(`  Slots: ${slots}`);
    console.log(`  Players: ${players}`);
  }

  console.log(`Gap distribution: max=${maxGap}, across ${tested} trials`);
  assertEquals(maxGap, 0, `Engine suboptimal: oracle beat engine by ${maxGap}`);
});

// ══════════════════════════════════════════════════════════════════════════════
// 11. PROPOSAL VALIDITY — every emitted match must have 4 distinct players,
//     total distinct placed == ILP optimum, no player exceeds their limit.
// ══════════════════════════════════════════════════════════════════════════════

function playerMatchLimit(r: PollResponse): number {
  if (r.can_play_twice === false) return 1;
  if (r.can_play_twice === true) return 2;
  return 999;
}

Deno.test("Proposal validity on 1000 random inputs", async () => {
  const rng = makeRng(42);
  let failures = 0;

  for (let i = 0; i < 1000; i++) {
    const input = randomInput(rng);
    const result = await generateProposals(input);
    const oracle = oracleMaxParticipation(input.timeSlots, input.responses);

    // Build response lookup
    const respMap = new Map<string, PollResponse>();
    for (const r of input.responses) respMap.set(r.user_id, r);

    // (a) Every proposal has exactly 4 DISTINCT player ids
    for (const m of result.matches) {
      const unique = new Set(m.playerIds);
      if (unique.size !== 4 || m.playerIds.length !== 4) {
        console.log(`Trial ${i}: match has ${m.playerIds.length} ids, ${unique.size} distinct: [${m.playerIds.join(",")}]`);
        failures++;
        break;
      }
    }

    // (b) Total distinct placed in proposals == ILP optimum
    const placedInMatches = new Set<string>();
    for (const m of result.matches) m.playerIds.forEach(id => placedInMatches.add(id));
    if (placedInMatches.size !== oracle) {
      console.log(`Trial ${i}: placed in proposals=${placedInMatches.size} != oracle=${oracle}`);
      const slots = input.timeSlots.map(s => s.id).join(",");
      const players = input.responses.map(r =>
        `${r.user_id}:[${(r.selected_slots ?? []).join(",")}]cpt=${r.can_play_twice}`
      ).join(" ");
      console.log(`  Slots: ${slots}`);
      console.log(`  Players: ${players}`);
      failures++;
      if (failures >= 5) break;
      continue;
    }

    // (c) No player exceeds their can_play_twice limit
    const matchCounts = new Map<string, number>();
    for (const m of result.matches) {
      for (const uid of m.playerIds) {
        matchCounts.set(uid, (matchCounts.get(uid) ?? 0) + 1);
      }
    }
    for (const [uid, cnt] of matchCounts) {
      const lim = playerMatchLimit(respMap.get(uid)!);
      if (cnt > lim) {
        console.log(`Trial ${i}: ${uid} in ${cnt} matches, limit=${lim}`);
        failures++;
        break;
      }
    }
  }

  console.log(`Proposal validity: ${failures} failures`);
  assertEquals(failures, 0, `${failures} inputs with invalid proposals`);
});

// ══════════════════════════════════════════════════════════════════════════════
// 11. COUNTEREXAMPLE from property test — smallest failing input
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("COUNTEREXAMPLE: oracle=9 engine=4 — diagnose greedy failure", async () => {
  const s0 = slot("s0", "Monday",    "19:00", "20:30");
  const s1 = slot("s1", "Tuesday",   "19:00", "20:30");
  const s2 = slot("s2", "Wednesday", "19:00", "20:30");
  const s3 = slot("s3", "Thursday",  "19:00", "20:30");

  const input = base({
    timeSlots: [s0, s1, s2, s3],
    responses: [
      resp("p0", ["s1","s0","s2"]),            // flex=3
      resp("p1", ["s1","s0","s2","s3"]),       // flex=4
      resp("p2", ["s3","s2"]),                 // flex=2
      resp("p3", ["s0","s1","s3"]),            // flex=3
      resp("p4", ["s1"]),                      // excl
      resp("p5", ["s1"], null),                // excl, unlimited
      resp("p6", ["s0","s1","s3","s2"]),       // flex=4
      resp("p7", ["s2","s3"]),                 // flex=2
      resp("p8", ["s3","s1"], null),           // flex=2, unlimited
    ],
  });

  const out = await generateProposals(input);
  const oracle = oracleMaxParticipation(input.timeSlots, input.responses);

  console.log(`Engine: ${out.totalParticipation} placed, ${out.matches.length} matches`);
  for (const m of out.matches) {
    console.log(`  ${m.day} ${m.timeSlot}: [${m.playerIds.join(",")}]`);
  }
  console.log(`Oracle: ${oracle} placed`);

  // Run recording oracle to see WHICH matches it picks
  const oracleSolution = oracleWithSolution(input.timeSlots, input.responses);
  console.log(`Oracle solution: ${oracleSolution.placed} placed, ${oracleSolution.matches.length} matches`);
  for (const m of oracleSolution.matches) {
    console.log(`  [${m.join(",")}]`);
  }
  // Check each player's match count in oracle solution
  const omc = new Map<string, number>();
  for (const m of oracleSolution.matches) {
    for (const uid of m) omc.set(uid, (omc.get(uid) ?? 0) + 1);
  }
  for (const [uid, cnt] of omc) {
    const r = input.responses.find(rr => rr.user_id === uid)!;
    const lim = r.can_play_twice === false ? 1 : r.can_play_twice === true ? 2 : 999;
    console.log(`  ${uid}: in ${cnt} matches, limit=${lim} ${cnt > lim ? "VIOLATION" : "ok"}`);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// 14. FLEX-TIME BENCHED — a responder available ONLY via flexible_times at
//     a slot where a match formed must be in playersBenched.
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("Benched: flex-time-only responder at formed slot is benched", async () => {
  const mon = slot("mon19", "Monday", "19:00", "20:30");

  const out = await generateProposals(base({
    timeSlots: [mon],
    responses: [
      // 4 direct slot selections → they form a match
      resp("p1", ["mon19"]), resp("p2", ["mon19"]),
      resp("p3", ["mon19"]), resp("p4", ["mon19"]),
      // p5: available via flexible_times ONLY (no selected_slots for mon19)
      {
        user_id: "p5",
        selected_slots: [],  // no direct slot selection
        flexible_times: {
          Monday: { available: true, slots: ["19:00"] },  // overlaps mon19
        },
        can_play_twice: false,
      },
    ],
  }));

  assertEquals(out.matches.length, 1, "1 match on Monday");
  assertEquals(out.totalParticipation, 4);

  // p5 is available at mon19 via flex-times AND a match was formed there → BENCHED
  assert(out.playersBenched.includes("p5"), "p5 (flex-time-only) should be benched");
});

// ══════════════════════════════════════════════════════════════════════════════
// 15. RECONCILIATION: scheduled + benched covers all available-at-formed-slot
//     responders on 1000 inputs. No responder falls through the cracks.
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("Reconciliation: scheduled + benched == all available-at-formed-slot on 1000 inputs", async () => {
  const rng = makeRng(42);
  let failures = 0;

  for (let i = 0; i < 1000; i++) {
    const input = randomInput(rng);
    const result = await generateProposals(input);

    // Build slot-level availability (same as engine Step 1)
    const slotPlayers = new Map<string, Set<string>>();
    for (const s of input.timeSlots) {
      const avail = new Set<string>();
      for (const r of input.responses) {
        // Replicate isUserAvailableForSlot: check selected_slots
        const selected = r.selected_slots ?? [];
        if (selected.includes(s.id)) { avail.add(r.user_id); continue; }
        // Check flexible_times
        const flex = (r.flexible_times as any)?.[s.day];
        if (flex?.available && Array.isArray(flex.slots)) {
          const slotStart = parseInt(s.start_time.split(":")[0]) * 60 + parseInt(s.start_time.split(":")[1]);
          const slotEnd = parseInt(s.end_time.split(":")[0]) * 60 + parseInt(s.end_time.split(":")[1]);
          for (const ft of flex.slots) {
            const ftStart = parseInt(ft.split(":")[0]) * 60 + parseInt(ft.split(":")[1]);
            const ftEnd = ftStart + 90;
            if (ftStart < slotEnd && ftEnd > slotStart) { avail.add(r.user_id); break; }
          }
        }
      }
      slotPlayers.set(s.id, avail);
    }

    // Slots with matches
    const slotsWithMatches = new Set(result.matches.map(m => m.slotId));

    // Every responder available at a formed slot must be in scheduled OR benched
    const scheduledSet = new Set(result.playersScheduled);
    const benchedSet = new Set(result.playersBenched);

    for (const slotId of slotsWithMatches) {
      for (const uid of slotPlayers.get(slotId) ?? []) {
        if (!scheduledSet.has(uid) && !benchedSet.has(uid)) {
          console.log(`Trial ${i}: ${uid} available at formed slot ${slotId} but neither scheduled nor benched`);
          failures++;
          break;
        }
      }
      if (failures > 0) break;
    }
    if (failures >= 5) break;
  }

  console.log(`Reconciliation: ${failures} failures`);
  assertEquals(failures, 0, `${failures} responders fell through the cracks`);
});
