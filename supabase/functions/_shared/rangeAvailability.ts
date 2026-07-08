/**
 * Range-availability layer for the scheduling engine.
 *
 * Converts availability_ranges (ISO-date-keyed, multi-range-per-day)
 * into virtual TimeSlots + selected_slots that the existing ILP solver
 * can consume unchanged.
 *
 * CONTRACT: availability_ranges jsonb =
 *   { "yyyy-MM-dd": [ {"start":"HH:MM","end":"HH:MM"}, ... ], ... }
 *   Ranges within one day, end > start, end <= "23:59". Match forms
 *   if 4+ players share a common window >= 60 min on a given date.
 */

import {
  timeToMinutes,
  overlaps,
  candidateStarts,
  minutesToHHMM,
} from "./vendor/scheduling-v1.0.0.ts";

import type { TimeSlot, PollResponse } from "./matchEngine.ts";

// ── Types ────────────────────────────────────────────────────────────────────

export interface TimeRange {
  start: string;  // "HH:MM"
  end: string;    // "HH:MM"
}

export interface RangeResponse {
  user_id: string;
  availability_ranges: Record<string, TimeRange[]>;  // { "yyyy-MM-dd": [...] }
  can_play_twice: boolean | null;
}

export interface VirtualSlotResult {
  timeSlots: TimeSlot[];
  responses: PollResponse[];
}

// ── Constants ────────────────────────────────────────────────────────────────

const MIN_MATCH_DURATION = 60;  // minutes — a padel match needs at least 60 min
const SLOT_INTERVAL = 30;       // 30-min granularity for candidate starts

// ── Core: range → virtual slots ──────────────────────────────────────────────

/**
 * Convert range-based responses into virtual TimeSlots + PollResponses
 * that the existing ILP solver can consume.
 *
 * Algorithm per date:
 *   1. Collect all ranges from all responders for that date.
 *   2. Generate candidate 30-min-interval start times across the day's
 *      overall window (earliest start → latest end).
 *   3. For each candidate start, check which responders have a range
 *      covering [start, start + MIN_MATCH_DURATION).
 *   4. If 4+ responders cover that window, create a virtual TimeSlot
 *      and mark those responders as available at it (via selected_slots).
 *
 * The ILP then maximises groups-of-4 across these virtual slots, exactly
 * as it does for legacy discrete slots.
 */
export function rangesToVirtualSlots(
  rangeResponses: RangeResponse[],
): VirtualSlotResult {
  // Collect all dates that have any range
  const allDates = new Set<string>();
  for (const r of rangeResponses) {
    for (const date of Object.keys(r.availability_ranges)) {
      allDates.add(date);
    }
  }

  const timeSlots: TimeSlot[] = [];
  // Map: user_id → set of virtual slot ids they're available at
  const userSlots = new Map<string, Set<string>>();
  for (const r of rangeResponses) {
    userSlots.set(r.user_id, new Set());
  }

  for (const date of allDates) {
    // 1. Collect all ranges for this date + compute the overall window
    let dayEarliest = 1440;
    let dayLatest = 0;

    const userRanges = new Map<string, { start: number; end: number }[]>();
    for (const r of rangeResponses) {
      const ranges = r.availability_ranges[date];
      if (!ranges || ranges.length === 0) continue;

      const parsed = ranges.map(rng => ({
        start: timeToMinutes(rng.start),
        end: timeToMinutes(rng.end),
      })).filter(rng => rng.end > rng.start);  // skip invalid ranges

      if (parsed.length === 0) continue;
      userRanges.set(r.user_id, parsed);

      for (const rng of parsed) {
        if (rng.start < dayEarliest) dayEarliest = rng.start;
        if (rng.end > dayLatest) dayLatest = rng.end;
      }
    }

    if (dayLatest - dayEarliest < MIN_MATCH_DURATION) continue;

    // 2. Generate candidate start times at 30-min intervals
    const starts = candidateStarts(dayEarliest, dayLatest, MIN_MATCH_DURATION, SLOT_INTERVAL);

    // 3. For each candidate, find who can play in [start, start+60)
    for (const start of starts) {
      const end = start + MIN_MATCH_DURATION;
      const available: string[] = [];

      for (const [userId, ranges] of userRanges) {
        // Player is available if ANY of their ranges covers [start, end)
        const covers = ranges.some(rng =>
          rng.start <= start && rng.end >= end
        );
        if (covers) available.push(userId);
      }

      // 4. Only create a virtual slot if 4+ players can play
      if (available.length >= 4) {
        const slotId = `${date}_${minutesToHHMM(start)}`;
        // Derive day name from date for the TimeSlot interface
        const dayOfWeek = new Date(date + "T12:00:00Z");
        const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        const dayName = dayNames[dayOfWeek.getUTCDay()];

        timeSlots.push({
          id: slotId,
          day: dayName,
          start_time: minutesToHHMM(start),
          end_time: minutesToHHMM(end),
        });

        for (const uid of available) {
          userSlots.get(uid)!.add(slotId);
        }
      }
    }
  }

  // Build PollResponse objects with selected_slots pointing to virtual slots
  const responses: PollResponse[] = rangeResponses.map(r => ({
    user_id: r.user_id,
    selected_slots: Array.from(userSlots.get(r.user_id) ?? []),
    flexible_times: null,
    can_play_twice: r.can_play_twice,
  }));

  return { timeSlots, responses };
}

/**
 * Determine if a set of responses uses range-based availability.
 * If ANY response has availability_ranges, the poll is range-based.
 * No mixing: all responses in a range-based poll use ranges.
 */
export function isRangePoll(responses: any[]): boolean {
  return responses.some(r =>
    r.availability_ranges &&
    typeof r.availability_ranges === "object" &&
    Object.keys(r.availability_ranges).length > 0
  );
}

/**
 * Range-aware benched definition (locked):
 * A responder is benched if they had a range on a date where a match
 * FORMED in an overlapping window AND they weren't placed.
 *
 * If their ranges never overlapped any formed match's window on any
 * date, they get NO row (lack-of-numbers on all their dates).
 */
export function computeRangeBenched(
  rangeResponses: RangeResponse[],
  scheduledSet: Set<string>,
  formedMatches: { date: string; start: number; end: number }[],
): Set<string> {
  const benched = new Set<string>();

  for (const r of rangeResponses) {
    if (scheduledSet.has(r.user_id)) continue;

    // Check if any of this responder's ranges overlap any formed match
    let overlapsAnyMatch = false;
    for (const match of formedMatches) {
      const ranges = r.availability_ranges[match.date];
      if (!ranges) continue;
      for (const rng of ranges) {
        const rStart = timeToMinutes(rng.start);
        const rEnd = timeToMinutes(rng.end);
        if (overlaps(rStart, rEnd, match.start, match.end)) {
          overlapsAnyMatch = true;
          break;
        }
      }
      if (overlapsAnyMatch) break;
    }

    if (overlapsAnyMatch) benched.add(r.user_id);
  }

  return benched;
}
