/**
 * Tests for @scheduling v1.0.0.
 * Run: deno test supabase/functions/_shared/vendor/scheduling-v1.0.0.test.ts
 */

import { assertEquals, assert } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import {
  timeToMinutes,
  minutesToHHMM,
  tsToMinutes,
  overlaps,
  fitsInWindow,
  candidateStarts,
} from "./scheduling-v1.0.0.ts";

// ── timeToMinutes ────────────────────────────────────────────────────────────

Deno.test("timeToMinutes: HH:MM", () => {
  assertEquals(timeToMinutes("07:00"), 420);
  assertEquals(timeToMinutes("23:00"), 1380);
  assertEquals(timeToMinutes("00:00"), 0);
  assertEquals(timeToMinutes("12:30"), 750);
});

Deno.test("timeToMinutes: HH:MM:SS", () => {
  assertEquals(timeToMinutes("19:00:00"), 1140);
});

// ── minutesToHHMM ────────────────────────────────────────────────────────────

Deno.test("minutesToHHMM", () => {
  assertEquals(minutesToHHMM(0), "00:00");
  assertEquals(minutesToHHMM(420), "07:00");
  assertEquals(minutesToHHMM(750), "12:30");
  assertEquals(minutesToHHMM(1380), "23:00");
  assertEquals(minutesToHHMM(1439), "23:59");
});

// ── tsToMinutes ──────────────────────────────────────────────────────────────

Deno.test("tsToMinutes: ISO timestamptz", () => {
  assertEquals(tsToMinutes("2026-07-06T19:30:00.000Z"), 1170);
  assertEquals(tsToMinutes("2026-07-06T00:00:00.000Z"), 0);
  assertEquals(tsToMinutes("2026-07-06T23:59:00.000Z"), 1439);
});

// ── overlaps ─────────────────────────────────────────────────────────────────

Deno.test("overlaps: standard cases", () => {
  // [10:00, 11:00) vs [10:30, 11:30) → overlap
  assert(overlaps(600, 660, 630, 690));
  // [10:00, 11:00) vs [11:00, 12:00) → NO overlap (half-open)
  assert(!overlaps(600, 660, 660, 720));
  // [10:00, 11:00) vs [09:00, 10:00) → NO overlap
  assert(!overlaps(600, 660, 540, 600));
  // identical → overlap
  assert(overlaps(600, 660, 600, 660));
  // contained → overlap
  assert(overlaps(600, 720, 630, 690));
});

Deno.test("overlaps: zero-length intervals", () => {
  // [10:00, 10:00) is empty → no overlap with anything
  assert(!overlaps(600, 600, 600, 660));
  assert(!overlaps(600, 660, 630, 630));
});

Deno.test("overlaps: wrap-past-midnight", () => {
  // [23:00, 01:00) vs [00:00, 02:00) → overlap (both include midnight-1am)
  assert(overlaps(1380, 60, 0, 120));
  // [23:00, 01:00) vs [02:00, 03:00) → NO overlap
  assert(!overlaps(1380, 60, 120, 180));
  // [23:00, 01:00) vs [22:00, 23:30) → overlap (22:00-23:30 overlaps 23:00-midnight part)
  assert(overlaps(1380, 60, 1320, 1410));
  // [23:00, 01:00) vs [01:00, 02:00) → NO overlap (half-open, b starts at a's end)
  assert(!overlaps(1380, 60, 60, 120));
});

// ── fitsInWindow ─────────────────────────────────────────────────────────────

Deno.test("fitsInWindow", () => {
  // 07:00-23:00 (960 min window), 90 min duration → fits
  assert(fitsInWindow(420, 1380, 90));
  // 07:00-08:00 (60 min window), 90 min duration → doesn't fit
  assert(!fitsInWindow(420, 480, 90));
  // exact fit
  assert(fitsInWindow(420, 510, 90));
  // zero duration always fits (if window > 0)
  assert(fitsInWindow(420, 421, 0));
});

// ── candidateStarts ──────────────────────────────────────────────────────────

Deno.test("candidateStarts: standard 30-min granularity", () => {
  // 07:00-09:00 window, 60 min slots, 30 min interval
  const starts = candidateStarts(420, 540, 60, 30);
  // 07:00 (420), 07:30 (450), 08:00 (480) — 08:30 won't fit (08:30+60=09:30 > 09:00)
  assertEquals(starts, [420, 450, 480]);
});

Deno.test("candidateStarts: 90-min slots, 30-min interval", () => {
  // 19:00-21:00 (120 min), 90 min slots
  const starts = candidateStarts(1140, 1260, 90, 30);
  // 19:00 (1140) fits (19:00+90=20:30 <= 21:00)
  // 19:30 (1170) fits (19:30+90=21:00 <= 21:00)
  // 20:00 (1200) does NOT fit (20:00+90=21:30 > 21:00)
  assertEquals(starts, [1140, 1170]);
});

Deno.test("candidateStarts: window too small for one slot", () => {
  const starts = candidateStarts(420, 450, 60, 30);
  assertEquals(starts, []);
});

Deno.test("candidateStarts: exact fit for one slot", () => {
  const starts = candidateStarts(420, 510, 90, 30);
  assertEquals(starts, [420]);
});
