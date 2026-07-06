/**
 * Benchmark harness for the exact solver.
 *
 * Run: deno run supabase/functions/_shared/exactSolver.bench.ts
 *
 * Grid: players x slots x bridge-density.
 * Reports median of 5 runs per cell, flags cells > 1000ms.
 */

import { solveExact } from "./exactSolver.ts";
import type { TimeSlot, PollResponse } from "./matchEngine.ts";

// ── Seeded PRNG ──────────────────────────────────────────────────────────────

function makeRng(seed: number) {
  let s = seed | 0 || 1;
  return () => {
    s ^= s << 13; s ^= s >> 17; s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

// ── Input generator ──────────────────────────────────────────────────────────

const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];

function generateInput(
  playerCount: number,
  slotCount: number,
  bridgePct: number,
  rng: () => number,
): { timeSlots: TimeSlot[]; responses: PollResponse[] } {
  const timeSlots: TimeSlot[] = [];
  for (let i = 0; i < slotCount; i++) {
    timeSlots.push({
      id: `s${i}`,
      day: DAYS[i % 7],
      start_time: `${19 + Math.floor(i / 7)}:00`,
      end_time: `${20 + Math.floor(i / 7)}:30`,
    });
  }

  const bridgeCount = Math.round(playerCount * bridgePct);
  const responses: PollResponse[] = [];

  for (let p = 0; p < playerCount; p++) {
    const isBridge = p < bridgeCount;
    // Bridge players: available at 2-slotCount slots. Others: 1-2 slots.
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

// ── Benchmark runner ─────────────────────────────────────────────────────────

function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function benchCell(
  playerCount: number,
  slotCount: number,
  bridgePct: number,
  runs: number,
): { medianMs: number; placed: number } {
  const rng = makeRng(playerCount * 1000 + slotCount * 100 + Math.round(bridgePct * 100));
  const { timeSlots, responses } = generateInput(playerCount, slotCount, bridgePct, rng);

  const times: number[] = [];
  let placed = 0;
  for (let r = 0; r < runs; r++) {
    const t0 = performance.now();
    const result = solveExact(timeSlots, responses, TIMEOUT_MS);
    const t1 = performance.now();
    times.push(t1 - t0);
    placed = result.maxPlaced;
  }

  return { medianMs: median(times), placed };
}

// ── Main ─────────────────────────────────────────────────────────────────────

const PLAYERS = [12, 20, 30, 40, 50, 60, 80, 100];
const SLOTS   = [2, 3, 4, 6];
const BRIDGE  = [0, 0.15, 0.30];
const RUNS    = 5;
const TIMEOUT_MS = 5000;  // skip cell after this

// Header
console.log("players | slots | bridge% | median_ms | placed | flag");
console.log("--------|-------|---------|-----------|--------|-----");

for (const p of PLAYERS) {
  for (const s of SLOTS) {
    for (const b of BRIDGE) {
      // Run single probe with hard timeout
      let medianMs: number;
      let placed: number;
      let flag = "";

      try {
        const t0 = performance.now();
        const result = benchCell(p, s, b, 1);
        const probeMs = performance.now() - t0;

        if (probeMs > TIMEOUT_MS) {
          medianMs = probeMs;
          placed = result.placed;
          flag = "> TIMEOUT";
        } else if (probeMs > 2000) {
          // Too slow for 5 runs; report the single probe
          medianMs = probeMs;
          placed = result.placed;
          if (medianMs > 1000) flag = "> 1000ms";
        } else {
          const full = benchCell(p, s, b, RUNS);
          medianMs = full.medianMs;
          placed = full.placed;
          if (medianMs > 1000) flag = "> 1000ms";
        }
      } catch (_e) {
        medianMs = -1;
        placed = -1;
        flag = "ERROR";
      }

      console.log(
        `${String(p).padStart(7)} | ${String(s).padStart(5)} | ${String(Math.round(b*100)).padStart(6)}% | ${medianMs >= 0 ? medianMs.toFixed(1).padStart(9) : "—".padStart(9)} | ${String(placed).padStart(6)} | ${flag}`
      );
    }
  }
}
