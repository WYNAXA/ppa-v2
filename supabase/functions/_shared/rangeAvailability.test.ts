/**
 * Tests for rangeAvailability.ts — range-to-virtual-slot conversion + oracle.
 *
 * Run: deno test --allow-read --allow-net supabase/functions/_shared/rangeAvailability.test.ts
 */

import { assertEquals, assert } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import {
  rangesToVirtualSlots,
  computeRangeBenched,
  isRangePoll,
  type RangeResponse,
  type TimeRange,
} from "./rangeAvailability.ts";
import { generateProposals, type EngineInput } from "./matchEngine.ts";
import { timeToMinutes } from "./vendor/scheduling-v1.0.0.ts";

// ── Helpers ──────────────────────────────────────────────────────────────────

function rr(uid: string, ranges: Record<string, TimeRange[]>, cpt: boolean | null = false): RangeResponse {
  return { user_id: uid, availability_ranges: ranges, can_play_twice: cpt };
}

// ── Brute-force oracle for range availability ────────────────────────────────
// Given range responses, compute the TRUE max players placeable in groups-of-4,
// where each group must share a common >=60-min window on the same date.

function oracleRangeMax(rangeResponses: RangeResponse[]): number {
  // Build: for each date, for each 30-min candidate start, which players cover [start, start+60)?
  const MIN_DUR = 60;
  const INTERVAL = 30;

  // Collect all dates
  const dates = new Set<string>();
  for (const r of rangeResponses) {
    for (const d of Object.keys(r.availability_ranges)) dates.add(d);
  }

  // Build candidate "slots": (date, start) → list of available player ids
  const candidates: { date: string; start: number; players: string[] }[] = [];

  for (const date of dates) {
    let earliest = 1440, latest = 0;
    const userRanges = new Map<string, { start: number; end: number }[]>();

    for (const r of rangeResponses) {
      const rngs = r.availability_ranges[date];
      if (!rngs) continue;
      const parsed = rngs.map(rng => ({ start: timeToMinutes(rng.start), end: timeToMinutes(rng.end) }))
        .filter(rng => rng.end > rng.start);
      if (parsed.length === 0) continue;
      userRanges.set(r.user_id, parsed);
      for (const rng of parsed) {
        if (rng.start < earliest) earliest = rng.start;
        if (rng.end > latest) latest = rng.end;
      }
    }

    for (let s = earliest; s + MIN_DUR <= latest; s += INTERVAL) {
      const end = s + MIN_DUR;
      const available: string[] = [];
      for (const [uid, ranges] of userRanges) {
        if (ranges.some(rng => rng.start <= s && rng.end >= end)) available.push(uid);
      }
      if (available.length >= 4) candidates.push({ date, start: s, players: available });
    }
  }

  // Dedup candidates by sorted player key (same group available at multiple starts = one option)
  const seen = new Set<string>();
  const uniqueCandidates: string[][] = [];
  for (const c of candidates) {
    // Generate all C(available, 4) groups
    const avail = c.players;
    for (let i = 0; i < avail.length - 3; i++)
      for (let j = i + 1; j < avail.length - 2; j++)
        for (let k = j + 1; k < avail.length - 1; k++)
          for (let l = k + 1; l < avail.length; l++) {
            const group = [avail[i], avail[j], avail[k], avail[l]].sort();
            const key = group.join(",");
            if (!seen.has(key)) { seen.add(key); uniqueCandidates.push(group); }
          }
  }

  // DFS over subsets of unique 4-player groups to maximise distinct placed
  const limits = new Map<string, number>();
  for (const r of rangeResponses) {
    limits.set(r.user_id, r.can_play_twice === false ? 1 : r.can_play_twice === true ? 2 : 999);
  }

  let best = 0;
  const matchCount = new Map<string, number>();
  const placed = new Set<string>();

  function dfs(idx: number): void {
    if (placed.size > best) best = placed.size;
    if (idx >= uniqueCandidates.length) return;
    if (placed.size + (rangeResponses.length - placed.size) <= best) return;

    dfs(idx + 1); // skip

    const group = uniqueCandidates[idx];
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
      dfs(idx + 1);
      for (const uid of group) matchCount.set(uid, matchCount.get(uid)! - 1);
      for (const uid of newP) placed.delete(uid);
    }
  }

  dfs(0);
  return best;
}

// ── Targeted tests ───────────────────────────────────────────────────────────

Deno.test("rangesToVirtualSlots: 5 players same day, overlapping ranges → virtual slots", () => {
  const responses = [
    rr("p1", { "2026-07-13": [{ start: "18:00", end: "21:00" }] }),
    rr("p2", { "2026-07-13": [{ start: "19:00", end: "22:00" }] }),
    rr("p3", { "2026-07-13": [{ start: "18:30", end: "20:30" }] }),
    rr("p4", { "2026-07-13": [{ start: "19:00", end: "21:00" }] }),
    rr("p5", { "2026-07-13": [{ start: "19:00", end: "20:30" }] }),
  ];

  const { timeSlots, responses: pollResp } = rangesToVirtualSlots(responses);

  // All 5 overlap in [19:00, 20:30). Virtual slots at 19:00 and 19:30 should exist (both fit 60min).
  assert(timeSlots.length >= 1, "at least 1 virtual slot");

  const slot19 = timeSlots.find(s => s.start_time === "19:00");
  assert(slot19, "19:00 virtual slot exists");

  // Check availability: all 5 available at 19:00-20:00 window
  const p1Resp = pollResp.find(r => r.user_id === "p1");
  assert(p1Resp?.selected_slots?.includes(slot19!.id), "p1 available at 19:00 slot");

  console.log(`Virtual slots: ${timeSlots.length}, slot IDs: ${timeSlots.map(s => s.id).join(", ")}`);
});

Deno.test("rangesToVirtualSlots: sub-60-min overlap → no slot", () => {
  // p1: 18:00-18:45, p2: 18:30-19:15 → overlap is 18:30-18:45 = 15min < 60
  const responses = [
    rr("p1", { "2026-07-13": [{ start: "18:00", end: "18:45" }] }),
    rr("p2", { "2026-07-13": [{ start: "18:30", end: "19:15" }] }),
    rr("p3", { "2026-07-13": [{ start: "18:00", end: "18:50" }] }),
    rr("p4", { "2026-07-13": [{ start: "18:20", end: "19:00" }] }),
  ];

  const { timeSlots } = rangesToVirtualSlots(responses);
  // No slot should form: the common window for all 4 is 18:30-18:45 = 15min
  assertEquals(timeSlots.length, 0, "no virtual slots (sub-60-min overlap)");
});

Deno.test("rangesToVirtualSlots: multi-range per day", () => {
  // p1: morning 08:00-10:00 AND evening 18:00-20:00
  const responses = [
    rr("p1", { "2026-07-13": [{ start: "08:00", end: "10:00" }, { start: "18:00", end: "20:00" }] }),
    rr("p2", { "2026-07-13": [{ start: "18:00", end: "21:00" }] }),
    rr("p3", { "2026-07-13": [{ start: "18:30", end: "20:30" }] }),
    rr("p4", { "2026-07-13": [{ start: "18:00", end: "20:00" }] }),
  ];

  const { timeSlots } = rangesToVirtualSlots(responses);
  // Evening window should form; morning has only p1
  assert(timeSlots.length >= 1, "evening slots exist");
  const morningSlot = timeSlots.find(s => s.start_time === "08:00");
  assert(!morningSlot, "no morning slot (only 1 player)");
});

Deno.test("rangesToVirtualSlots: two dates, different groups", () => {
  const responses = [
    rr("p1", { "2026-07-13": [{ start: "19:00", end: "21:00" }] }),
    rr("p2", { "2026-07-13": [{ start: "19:00", end: "21:00" }] }),
    rr("p3", { "2026-07-13": [{ start: "19:00", end: "21:00" }] }),
    rr("p4", { "2026-07-13": [{ start: "19:00", end: "21:00" }] }),
    rr("p5", { "2026-07-14": [{ start: "19:00", end: "21:00" }] }),
    rr("p6", { "2026-07-14": [{ start: "19:00", end: "21:00" }] }),
    rr("p7", { "2026-07-14": [{ start: "19:00", end: "21:00" }] }),
    rr("p8", { "2026-07-14": [{ start: "19:00", end: "21:00" }] }),
  ];

  const { timeSlots, responses: pollResp } = rangesToVirtualSlots(responses);
  // Should have slots on both dates
  const monSlots = timeSlots.filter(s => s.id.startsWith("2026-07-13"));
  const tueSlots = timeSlots.filter(s => s.id.startsWith("2026-07-14"));
  assert(monSlots.length >= 1, "Monday slots exist");
  assert(tueSlots.length >= 1, "Tuesday slots exist");

  // p1-p4 should be available at Monday slots only
  const p1 = pollResp.find(r => r.user_id === "p1")!;
  assert(p1.selected_slots!.some(s => s.startsWith("2026-07-13")), "p1 at Monday");
  assert(!p1.selected_slots!.some(s => s.startsWith("2026-07-14")), "p1 NOT at Tuesday");
});

Deno.test("computeRangeBenched: responder overlapping formed match → benched", () => {
  const responses = [
    rr("p1", { "2026-07-13": [{ start: "19:00", end: "21:00" }] }),
    rr("p5", { "2026-07-13": [{ start: "19:30", end: "21:30" }] }),
  ];
  const scheduled = new Set(["p1"]);
  const formed = [{ date: "2026-07-13", start: timeToMinutes("19:00"), end: timeToMinutes("20:00") }];

  const benched = computeRangeBenched(responses, scheduled, formed);
  assert(benched.has("p5"), "p5 benched (overlaps formed match, not placed)");
});

Deno.test("computeRangeBenched: responder NOT overlapping any formed match → no row", () => {
  const responses = [
    rr("p5", { "2026-07-14": [{ start: "08:00", end: "10:00" }] }),
  ];
  const scheduled = new Set<string>();
  const formed = [{ date: "2026-07-13", start: timeToMinutes("19:00"), end: timeToMinutes("20:00") }];

  const benched = computeRangeBenched(responses, scheduled, formed);
  assert(!benched.has("p5"), "p5 NOT benched (different date, no overlap)");
});

Deno.test("isRangePoll: detects range vs slot responses", () => {
  assert(isRangePoll([{ availability_ranges: { "2026-07-13": [{ start: "19:00", end: "21:00" }] } }]));
  assert(!isRangePoll([{ selected_slots: ["mon19"] }]));
  assert(!isRangePoll([{ availability_ranges: {} }]));
});

// ── Engine integration: range → ILP → proposals ─────────────────────────────

Deno.test("Range engine integration: 5 players, 1 match, 1 benched", async () => {
  const rangeResp = [
    rr("p1", { "2026-07-13": [{ start: "19:00", end: "21:00" }] }),
    rr("p2", { "2026-07-13": [{ start: "19:00", end: "21:00" }] }),
    rr("p3", { "2026-07-13": [{ start: "19:00", end: "21:00" }] }),
    rr("p4", { "2026-07-13": [{ start: "19:00", end: "21:00" }] }),
    rr("p5", { "2026-07-13": [{ start: "19:00", end: "21:00" }] }),
  ];

  const { timeSlots, responses } = rangesToVirtualSlots(rangeResp);
  assert(timeSlots.length > 0, "virtual slots generated");

  const output = await generateProposals({
    weekStartDate: "2026-07-13",
    timeSlots,
    responses,
    benchHistory: [],
    pairingHistory: [],
    togetherness: false,
  });

  assertEquals(output.totalParticipation, 4, "4 players placed");
  assertEquals(output.matches.length, 1, "1 match");
  assertEquals(output.playersBenched.length, 1, "1 benched");
  console.log("Range integration: 4 placed, 1 benched");
});

// ── Property test: engine vs oracle on 1000 random range inputs ──────────────

function makeRng(seed: number) {
  let s = seed | 0 || 1;
  return () => { s ^= s << 13; s ^= s >> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
}

function randomRangeInput(rng: () => number): RangeResponse[] {
  const playerCount = 4 + Math.floor(rng() * 9);  // 4-12
  const dateCount = 1 + Math.floor(rng() * 3);     // 1-3 dates
  const dates: string[] = [];
  for (let d = 0; d < dateCount; d++) dates.push(`2026-07-${String(13 + d).padStart(2, "0")}`);

  const responses: RangeResponse[] = [];
  for (let p = 0; p < playerCount; p++) {
    const ranges: Record<string, TimeRange[]> = {};
    // Each player available on 1-dateCount dates
    const availDates = 1 + Math.floor(rng() * dateCount);
    const shuffled = [...dates].sort(() => rng() - 0.5).slice(0, availDates);

    for (const date of shuffled) {
      const rangeCount = 1 + Math.floor(rng() * 2); // 1-2 ranges per day
      const dayRanges: TimeRange[] = [];
      for (let r = 0; r < rangeCount; r++) {
        const startHour = 7 + Math.floor(rng() * 14); // 07:00-20:00
        const durHours = 1 + Math.floor(rng() * 4);   // 1-4 hours
        const endHour = Math.min(startHour + durHours, 23);
        if (endHour > startHour) {
          dayRanges.push({
            start: `${String(startHour).padStart(2, "0")}:${rng() < 0.5 ? "00" : "30"}`,
            end: `${String(endHour).padStart(2, "0")}:${rng() < 0.5 ? "00" : "30"}`,
          });
        }
      }
      if (dayRanges.length > 0) ranges[date] = dayRanges;
    }

    const r = rng();
    responses.push({
      user_id: `p${p}`,
      availability_ranges: ranges,
      can_play_twice: r < 0.7 ? false : r < 0.9 ? true : null,
    });
  }

  return responses;
}

Deno.test("Property: range engine matches oracle on 1000 random inputs", async () => {
  const rng = makeRng(42);
  let mismatches = 0;
  let tested = 0;

  for (let i = 0; i < 1000; i++) {
    const rangeResp = randomRangeInput(rng);
    const oracle = oracleRangeMax(rangeResp);

    const { timeSlots, responses } = rangesToVirtualSlots(rangeResp);

    let enginePlaced = 0;
    if (timeSlots.length > 0 && responses.some(r => (r.selected_slots ?? []).length > 0)) {
      const output = await generateProposals({
        weekStartDate: "2026-07-13",
        timeSlots,
        responses,
        benchHistory: [],
        pairingHistory: [],
        togetherness: false,
      });
      enginePlaced = output.totalParticipation;
    }

    if (enginePlaced !== oracle) {
      if (mismatches < 3) {
        console.log(`Trial ${i}: engine=${enginePlaced} oracle=${oracle}`);
        console.log(`  players: ${rangeResp.length}, slots: ${timeSlots.length}`);
      }
      mismatches++;
    }
    tested++;
  }

  console.log(`Range property: ${tested} tested, ${mismatches} mismatches`);
  assertEquals(mismatches, 0, `${mismatches} range inputs where engine != oracle`);
});
