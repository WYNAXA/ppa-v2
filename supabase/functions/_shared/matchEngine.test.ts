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
//    8 players at 2 exclusive slots → 2 matches, all 8 scheduled, 0 benched.
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("Level 1: maximise participation across exclusive slots", () => {
  const mon = slot("mon19", "Monday", "19:00", "20:30");
  const tue = slot("tue19", "Tuesday", "19:00", "20:30");

  const out = generateProposals(base({
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
//    6 players, 1 slot → 1 match (4 players). Top 4 by bench-debt play;
//    bottom 2 are benched.
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("Level 2: highest bench-debt players get priority", () => {
  const mon = slot("mon19", "Monday", "19:00", "20:30");

  const out = generateProposals(base({
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
  // Top 4 by debt (p1=5, p2=4, p3=3, p4=2) should be scheduled
  assert(scheduled.has("p1"), "p1 (debt=5) should play");
  assert(scheduled.has("p2"), "p2 (debt=4) should play");
  assert(scheduled.has("p3"), "p3 (debt=3) should play");
  assert(scheduled.has("p4"), "p4 (debt=2) should play");

  // p5 and p6 should be benched
  const benched = new Set(out.playersBenched);
  assert(benched.has("p5"), "p5 (debt=1) should be benched");
  assert(benched.has("p6"), "p6 (debt=0) should be benched");
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. PAIRING DIVERSITY
//    8 players, 1 slot, 2 matches. p1+p2 have 5 shared matches, p3+p4 have 5.
//    Optimal split separates both pairs into different groups.
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("Level 3: diversity grouping separates frequent pairs", () => {
  const mon = slot("mon19", "Monday", "19:00", "20:30");

  // Build pairing history: 5 matches where p1+p2 played together,
  // 5 matches where p3+p4 played together.
  const pairingHistory: PairingRecord[] = [];
  for (let i = 0; i < 5; i++) {
    pairingHistory.push({ player_ids: ["p1", "p2", "pX", "pY"], match_date: "2026-06-01" });
    pairingHistory.push({ player_ids: ["p3", "p4", "pX", "pY"], match_date: "2026-06-01" });
  }

  const out = generateProposals(base({
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

  // Verify p1 and p2 are NOT in the same group
  for (const m of out.matches) {
    const ids = new Set(m.playerIds);
    assert(
      !(ids.has("p1") && ids.has("p2")),
      `p1 and p2 must be in different groups, found together: ${m.playerIds}`,
    );
    assert(
      !(ids.has("p3") && ids.has("p4")),
      `p3 and p4 must be in different groups, found together: ${m.playerIds}`,
    );
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. BENCHED EDGE CASE
//    mon19: 5 players → 1 match → 1 benched.
//    tue19: 2 players → no match → NOT benched (lack-of-numbers).
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("Benched: empty-slot responders are NOT benched", () => {
  const mon = slot("mon19", "Monday", "19:00", "20:30");
  const tue = slot("tue19", "Tuesday", "19:00", "20:30");

  const out = generateProposals(base({
    timeSlots: [mon, tue],
    responses: [
      // 5 available on Monday
      resp("p1", ["mon19"]), resp("p2", ["mon19"]),
      resp("p3", ["mon19"]), resp("p4", ["mon19"]),
      resp("p5", ["mon19"]),
      // 2 available on Tuesday only (no match possible)
      resp("p6", ["tue19"]), resp("p7", ["tue19"]),
    ],
  }));

  assertEquals(out.matches.length, 1, "only Monday match");
  assertEquals(out.totalParticipation, 4);

  // p5 available at Monday (has match), not scheduled → BENCHED
  assert(out.playersBenched.includes("p5"), "p5 should be benched");

  // p6, p7 available only at Tuesday (no match) → NOT benched
  assert(!out.playersBenched.includes("p6"), "p6 not benched (empty slot)");
  assert(!out.playersBenched.includes("p7"), "p7 not benched (empty slot)");
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. CAN_PLAY_TWICE
//    p1 available at two slots with can_play_twice=true → plays in both.
//    playersScheduled counts p1 once. Total unique = 7.
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("can_play_twice=true allows a player in 2 matches", () => {
  const s1 = slot("mon19", "Monday", "19:00", "20:30");
  const s2 = slot("mon21", "Monday", "20:30", "22:00");

  const out = generateProposals(base({
    timeSlots: [s1, s2],
    responses: [
      resp("p1", ["mon19", "mon21"], true),   // can play twice
      resp("p2", ["mon19"]),
      resp("p3", ["mon19"]),
      resp("p4", ["mon19"]),
      resp("p5", ["mon21"]),
      resp("p6", ["mon21"]),
      resp("p7", ["mon21"]),
    ],
  }));

  assertEquals(out.matches.length, 2, "2 matches");

  // p1 appears in both
  const p1Matches = out.matches.filter(m => m.playerIds.includes("p1"));
  assertEquals(p1Matches.length, 2, "p1 should be in 2 matches");

  // But counted once in playersScheduled
  assertEquals(out.totalParticipation, 7, "7 distinct players");
  assertEquals(out.playersBenched.length, 0);
});

// ══════════════════════════════════════════════════════════════════════════════
// 6. TOGETHERNESS PRESERVES PARTICIPATION
//    With overlap, togetherness changes clustering but not total count.
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("Level 4: togetherness does not reduce participation", () => {
  // Mon: 4 exclusive + 4 flexible = 8
  // Tue: 6 exclusive + 4 flexible = 10
  const mon = slot("mon19", "Monday", "19:00", "20:30");
  const tue = slot("tue19", "Tuesday", "19:00", "20:30");

  const responses = [
    // Mon exclusive
    resp("m1", ["mon19"]), resp("m2", ["mon19"]),
    resp("m3", ["mon19"]), resp("m4", ["mon19"]),
    // Tue exclusive
    resp("t1", ["tue19"]), resp("t2", ["tue19"]),
    resp("t3", ["tue19"]), resp("t4", ["tue19"]),
    resp("t5", ["tue19"]), resp("t6", ["tue19"]),
    // Flexible (both days)
    resp("f1", ["mon19", "tue19"]), resp("f2", ["mon19", "tue19"]),
    resp("f3", ["mon19", "tue19"]), resp("f4", ["mon19", "tue19"]),
  ];

  const spread = generateProposals(base({
    timeSlots: [mon, tue], responses, togetherness: false,
  }));
  const cluster = generateProposals(base({
    timeSlots: [mon, tue], responses, togetherness: true,
  }));

  // Both must schedule the same total
  assertEquals(
    spread.totalParticipation, cluster.totalParticipation,
    `participation must match: spread=${spread.totalParticipation} cluster=${cluster.totalParticipation}`,
  );

  // Togetherness should produce more matches on the popular day (Tue=10)
  const spreadTue = spread.matches.filter(m => m.day === "Tuesday").length;
  const clusterTue = cluster.matches.filter(m => m.day === "Tuesday").length;
  assert(
    clusterTue >= spreadTue,
    `togetherness should cluster on Tue: spread=${spreadTue} cluster=${clusterTue}`,
  );
});

// ══════════════════════════════════════════════════════════════════════════════
// 7. FLEXIBILITY TIEBREAK — constrained players saved for their slot
//    p9 exclusive to Mon; p1-p4 available both. Mon (5) processed first
//    (constrained). p9 (flex=1) goes in ahead of p1-p4 (flex=2).
//    Tue still gets p5-p8 exclusive → both slots matched.
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("Flexibility tiebreak preserves exclusive player placement", () => {
  const mon = slot("mon19", "Monday", "19:00", "20:30");
  const tue = slot("tue19", "Tuesday", "19:00", "20:30");

  const out = generateProposals(base({
    timeSlots: [mon, tue],
    responses: [
      resp("p1", ["mon19", "tue19"]), resp("p2", ["mon19", "tue19"]),
      resp("p3", ["mon19", "tue19"]), resp("p4", ["mon19", "tue19"]),
      resp("p5", ["tue19"]), resp("p6", ["tue19"]),
      resp("p7", ["tue19"]), resp("p8", ["tue19"]),
      resp("p9", ["mon19"]),  // exclusive to Mon
    ],
  }));

  // p9 must be in the Monday match (only slot available)
  const monMatch = out.matches.find(m => m.day === "Monday");
  assert(monMatch !== undefined, "Monday match must exist");
  assert(monMatch!.playerIds.includes("p9"), "p9 (exclusive) must be in Monday match");

  // Tuesday should also have a match
  const tueMatch = out.matches.find(m => m.day === "Tuesday");
  assert(tueMatch !== undefined, "Tuesday match must exist");

  assertEquals(out.totalParticipation, 8, "8 of 9 scheduled (1 benched or unused)");
});
