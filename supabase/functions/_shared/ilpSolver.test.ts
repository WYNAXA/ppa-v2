/**
 * Tests for ilpSolver.ts — ILP-based exact participation solver.
 *
 * Run: deno test --allow-read --allow-net supabase/functions/_shared/ilpSolver.test.ts
 */

import { assertEquals, assert } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { solveILP } from "./ilpSolver.ts";
import type { TimeSlot, PollResponse } from "./matchEngine.ts";

// ── Seeded PRNG ──────────────────────────────────────────────────────────────

function makeRng(seed: number) {
  let s = seed | 0 || 1;
  return () => {
    s ^= s << 13; s ^= s >> 17; s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

// ── Brute-force oracle (same as exactSolver.test.ts) ─────────────────────────

function combos<T>(arr: T[], k: number): T[][] {
  const result: T[][] = [];
  const c: T[] = [];
  (function go(start: number) {
    if (c.length === k) { result.push([...c]); return; }
    for (let i = start; i <= arr.length - (k - c.length); i++) {
      c.push(arr[i]); go(i + 1); c.pop();
    }
  })(0);
  return result;
}

function playerLimit(r: PollResponse): number {
  if (r.can_play_twice === false) return 1;
  if (r.can_play_twice === true) return 2;
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

// ── Helpers ──────────────────────────────────────────────────────────────────

function slot(id: string, day: string): TimeSlot {
  return { id, day, start_time: "19:00", end_time: "20:30" };
}

function randomInput(rng: () => number): { timeSlots: TimeSlot[]; responses: PollResponse[] } {
  const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday"];
  const slotCount = 2 + Math.floor(rng() * 3);
  const playerCount = 6 + Math.floor(rng() * 7);

  const timeSlots: TimeSlot[] = [];
  for (let i = 0; i < slotCount; i++) {
    timeSlots.push(slot(`s${i}`, DAYS[i % DAYS.length]));
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

Deno.test("ILP: counterexample (oracle=9) solved exactly", async () => {
  const timeSlots = [
    slot("s0", "Monday"), slot("s1", "Tuesday"),
    slot("s2", "Wednesday"), slot("s3", "Thursday"),
  ];

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

  const result = await solveILP(timeSlots, responses);

  console.log(`ILP placed: ${result.maxPlaced}`);
  for (const [sid, players] of result.assignments) {
    if (players.length > 0) console.log(`  ${sid}: [${players.join(",")}]`);
  }

  assertEquals(result.maxPlaced, 9, "must place all 9 players");
});

Deno.test("ILP: matches oracle on 1000 random inputs", async () => {
  const rng = makeRng(42);
  let mismatches = 0;
  let tested = 0;

  for (let i = 0; i < 1000; i++) {
    const { timeSlots, responses } = randomInput(rng);
    const ilpResult = await solveILP(timeSlots, responses);
    const oracle = oracleMaxParticipation(timeSlots, responses);

    if (ilpResult.maxPlaced !== oracle) {
      console.log(`Trial ${i}: ILP=${ilpResult.maxPlaced} oracle=${oracle}`);
      console.log(`  slots: ${timeSlots.map(s => s.id).join(",")}`);
      console.log(`  players: ${responses.map(r =>
        `${r.user_id}:[${(r.selected_slots??[]).join(",")}]cpt=${r.can_play_twice}`
      ).join(" ")}`);
      mismatches++;
      if (mismatches >= 5) break;  // stop after 5 to see the pattern
    }
    tested++;
  }

  console.log(`Tested ${tested} inputs, ${mismatches} mismatches`);
  assertEquals(mismatches, 0, `${mismatches} inputs where ILP != oracle`);
});

Deno.test("ILP benchmark: 50 players grid", async () => {
  const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

  function benchInput(playerCount: number, slotCount: number, bridgePct: number) {
    let seed = playerCount * 1000 + slotCount * 100 + Math.round(bridgePct * 100);
    const rng = () => { seed ^= seed << 13; seed ^= seed >> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };

    const timeSlots: TimeSlot[] = [];
    for (let i = 0; i < slotCount; i++) {
      timeSlots.push(slot(`s${i}`, DAYS[i % 6]));
    }

    const bridgeCount = Math.round(playerCount * bridgePct);
    const responses: PollResponse[] = [];

    for (let p = 0; p < playerCount; p++) {
      const isBridge = p < bridgeCount;
      const maxSlots = isBridge ? slotCount : Math.min(2, slotCount);
      const availCount = 1 + Math.floor(rng() * maxSlots);
      const shuffled = [...timeSlots].sort(() => rng() - 0.5);
      const selected = shuffled.slice(0, availCount).map(s => s.id);

      responses.push({
        user_id: `p${p}`,
        selected_slots: selected,
        flexible_times: null,
        can_play_twice: isBridge ? null : false,
      });
    }

    return { timeSlots, responses };
  }

  console.log("players | slots | bridge% | median_ms | placed | flag");
  console.log("--------|-------|---------|-----------|--------|-----");

  for (const slotCount of [2, 3, 4, 6]) {
    for (const bridge of [0, 0.15, 0.30]) {
      const { timeSlots, responses } = benchInput(50, slotCount, bridge);

      try {
        const times: number[] = [];
        let placed = 0;
        for (let r = 0; r < 5; r++) {
          const t0 = performance.now();
          const res = await solveILP(timeSlots, responses);
          times.push(performance.now() - t0);
          placed = res.maxPlaced;
        }
        times.sort((a, b) => a - b);
        const med = times[2];
        const flag = med > 3000 ? " > 3s" : "";
        console.log(
          `     50 | ${String(slotCount).padStart(5)} | ${String(Math.round(bridge*100)).padStart(6)}% | ${med.toFixed(1).padStart(9)} | ${String(placed).padStart(6)} |${flag}`
        );
      } catch (e) {
        console.log(
          `     50 | ${String(slotCount).padStart(5)} | ${String(Math.round(bridge*100)).padStart(6)}% | ${"ERROR".padStart(9)} | ${"—".padStart(6)} | ${String(e).slice(0, 60)}`
        );
      }
    }
  }
});
