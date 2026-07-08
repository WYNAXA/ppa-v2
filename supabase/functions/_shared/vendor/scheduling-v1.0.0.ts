/**
 * @scheduling v1.0.0 — Pure interval logic for padel scheduling.
 *
 * Shared between PPA (poll engine, match scheduling) and VM (court
 * availability, booking conflicts). All functions are pure — no I/O,
 * no DB, no Supabase client.
 *
 * Extracted from:
 *   - get-court-availability/index.ts: overlaps (line 66), minutesToHHMM (47),
 *     tsToMinutes (60), slot-generation loop (203-207)
 *   - _shared/timeUtils.ts: timeToMinutes (8)
 *   - _shared/timeUtils.ts: isUserAvailableForSlot overlap (line 49)
 *
 * Version pinned in filename. Import via alias "@scheduling" (import_map).
 */

// ── Time conversion ─────────────────────────────────────────────────────────

/** Convert "HH:MM" or "HH:MM:SS" to minutes since midnight. */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Convert minutes since midnight to "HH:MM". */
export function minutesToHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Extract minutes-since-midnight-UTC from a timestamptz string. */
export function tsToMinutes(ts: string): number {
  const d = new Date(ts);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

// ── Interval overlap ────────────────────────────────────────────────────────

/**
 * True if half-open interval [aStart, aEnd) overlaps [bStart, bEnd).
 * Values in minutes since midnight.
 *
 * Handles wrap-past-midnight: if aEnd <= aStart, the interval is treated
 * as wrapping (e.g. 23:00–01:00 = [1380, 60)). In this case we split into
 * [aStart, 1440) + [0, aEnd) and check each against [bStart, bEnd).
 * Same for bEnd <= bStart.
 */
export function overlaps(
  aStart: number, aEnd: number,
  bStart: number, bEnd: number,
): boolean {
  // Empty intervals never overlap
  if (aStart === aEnd || bStart === bEnd) return false;

  // Non-wrapping fast path (the common case)
  if (aStart < aEnd && bStart < bEnd) {
    return aStart < bEnd && aEnd > bStart;
  }

  // Handle wrap-past-midnight: split into non-wrapping sub-intervals
  const aIntervals: [number, number][] = aEnd > aStart
    ? [[aStart, aEnd]]
    : [[aStart, 1440], [0, aEnd]];

  const bIntervals: [number, number][] = bEnd > bStart
    ? [[bStart, bEnd]]
    : [[bStart, 1440], [0, bEnd]];

  for (const [as, ae] of aIntervals) {
    for (const [bs, be] of bIntervals) {
      if (as < be && ae > bs) return true;
    }
  }
  return false;
}

// ── Fit-in-window ───────────────────────────────────────────────────────────

/**
 * Can a booking of `durationMin` minutes fit entirely within [windowStart, windowEnd)?
 * Values in minutes since midnight. Does NOT handle wrap-past-midnight on the window
 * (venues with wrap should split into two calls).
 */
export function fitsInWindow(
  windowStart: number,
  windowEnd: number,
  durationMin: number,
): boolean {
  return windowEnd - windowStart >= durationMin;
}

// ── Candidate start generation ──────────────────────────────────────────────

/**
 * Generate candidate slot start times at `intervalMin`-minute granularity
 * within [windowStart, windowEnd), where each slot must fit `durationMin`.
 *
 * Returns an array of start-time values in minutes since midnight.
 *
 * @param windowStart  minutes since midnight (e.g. 420 for 07:00)
 * @param windowEnd    minutes since midnight (e.g. 1380 for 23:00)
 * @param durationMin  slot duration in minutes (e.g. 90)
 * @param intervalMin  step between starts (e.g. 30)
 */
export function candidateStarts(
  windowStart: number,
  windowEnd: number,
  durationMin: number,
  intervalMin: number,
): number[] {
  const starts: number[] = [];
  for (
    let s = windowStart;
    s + durationMin <= windowEnd;
    s += intervalMin
  ) {
    starts.push(s);
  }
  return starts;
}
