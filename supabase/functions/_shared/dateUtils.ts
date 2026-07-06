/**
 * UTC-explicit date arithmetic for poll → match scheduling.
 *
 * Every method uses getUTC* / setUTC* so the output is identical regardless of
 * the runtime's local timezone.  This matters because:
 *  - Edge functions run on Deno (UTC today, but not contractually guaranteed).
 *  - Downstream cron jobs (auto-cancel, push-notification prompts) key on
 *    match_date; a ±1-day error mis-fires or silently skips them.
 */

const DAY_NAMES = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
] as const;

export type DayName = (typeof DAY_NAMES)[number];

/**
 * Parse a `yyyy-MM-dd` string into a Date pinned to UTC noon.
 *
 * Why noon?  `new Date("2026-07-06")` gives UTC midnight, which is safe for
 * UTC-only arithmetic.  But noon gives a 12-hour buffer in both directions,
 * so even if a caller accidentally prints the Date via a local-TZ method the
 * calendar day won't shift.  The returned Date is used only for arithmetic —
 * final output always goes through `formatDateUTC`.
 */
export function parseUTCDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

/**
 * Format a Date as `yyyy-MM-dd` using only UTC accessors.
 */
export function formatDateUTC(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 0-based offset from Monday: Monday=0 … Sunday=6.
 * Throws on unknown day name so typos surface immediately.
 */
export function dayOffset(day: DayName): number {
  const idx = DAY_NAMES.indexOf(day);
  if (idx === -1) throw new Error(`Unknown day name: "${day}"`);
  return idx;
}

/**
 * Given a poll's week_start_date (expected Monday, but defensive against any
 * day) and a target day name, return the calendar date (`yyyy-MM-dd`) of that
 * day within the week.
 *
 * Algorithm:
 *  1. Parse weekStartDate to UTC noon.
 *  2. Compute the JS-UTC day-of-week of that date (getUTCDay: Sun=0..Sat=6).
 *  3. Convert both the start's DOW and the target DOW to Monday=0 offsets.
 *  4. delta = (targetMonOffset - startMonOffset + 7) % 7.
 *  5. Add delta days via UTC arithmetic.
 *
 * If weekStartDate IS a Monday, delta equals the simple `dayOffset(day)`.
 * If weekStartDate is NOT a Monday the modular arithmetic still produces
 * the correct date within that 7-day window.
 */
export function weekDayToDate(weekStartDate: string, day: DayName): string {
  const base = parseUTCDate(weekStartDate);

  // JS getUTCDay: Sun=0 Mon=1 … Sat=6  →  convert to Mon=0 … Sun=6
  const startDow = (base.getUTCDay() + 6) % 7; // Mon=0
  const targetDow = dayOffset(day);              // Mon=0
  const delta = (targetDow - startDow + 7) % 7;

  const result = new Date(base.getTime());
  result.setUTCDate(result.getUTCDate() + delta);
  return formatDateUTC(result);
}
