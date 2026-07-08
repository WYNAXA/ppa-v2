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

  // Dedup: skip windows with identical available-player sets on the same date
  const seenPlayerSets = new Set<string>();

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

    // 2. Sweep-line: collect ALL range boundary points (starts + ends).
    // Between consecutive boundaries, the set of available players is
    // constant. This generates every maximal window where >=4 players
    // share >=60 min — no grid-alignment gaps.
    //
    // Complexity: O(B) boundaries where B = 2 * total_ranges (tens at
    // padel scale). Windows = O(B^2) worst case — trivial.
    const boundarySet = new Set<number>();
    for (const [, ranges] of userRanges) {
      for (const rng of ranges) {
        boundarySet.add(rng.start);
        boundarySet.add(rng.end);
      }
    }
    const boundaries = Array.from(boundarySet).sort((a, b) => a - b);

    // 3. For each pair of boundaries (start, end) where end - start >= 60,
    // check which players have a range fully covering [start, end).
    const dayOfWeek = new Date(date + "T12:00:00Z");
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const dayName = dayNames[dayOfWeek.getUTCDay()];

    for (let i = 0; i < boundaries.length; i++) {
      for (let j = i + 1; j < boundaries.length; j++) {
        const wStart = boundaries[i];
        const wEnd = boundaries[j];
        if (wEnd - wStart < MIN_MATCH_DURATION) continue;

        const available: string[] = [];
        for (const [userId, ranges] of userRanges) {
          const covers = ranges.some(rng =>
            rng.start <= wStart && rng.end >= wEnd
          );
          if (covers) available.push(userId);
        }

        if (available.length < 4) continue;

        // Dedup: only create a slot if this exact player set hasn't been seen
        // on this date (different windows with the same available players
        // are redundant for the ILP — same assignment options).
        const playerKey = [...available].sort().join(",");
        const dedupKey = `${date}:${playerKey}`;
        if (seenPlayerSets.has(dedupKey)) continue;
        seenPlayerSets.add(dedupKey);

        const slotId = `${date}_${minutesToHHMM(wStart)}_${minutesToHHMM(wEnd)}`;

        timeSlots.push({
          id: slotId,
          day: dayName,
          start_time: minutesToHHMM(wStart),
          end_time: minutesToHHMM(wEnd),
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

// ── Window computation ──────────────────────────────────────────────────────

export interface MatchWindow {
  window_start: string;  // "HH:MM"
  window_end: string;    // "HH:MM"
}

/**
 * Compute the maximal shared bookable window for a group of players on a date.
 *
 * For each player, find their single range that covers the match's sweep-line
 * window [slotStart, slotEnd). Then intersect all covering ranges:
 *   window_start = max(all covering range starts)
 *   window_end   = min(all covering range ends)
 *
 * This uses the players' REAL ranges, not the sweep-line sub-window.
 * The result is the widest contiguous window all players share.
 *
 * Returns null if any player lacks a covering range or intersection < 60 min.
 */
export function computeMatchWindow(
  playerIds: string[],
  date: string,
  slotStart: number,  // minutes: the sweep-line window start
  slotEnd: number,    // minutes: the sweep-line window end
  rangesByUser: Map<string, Record<string, TimeRange[]>>,
): MatchWindow | null {
  let maxStart = 0;
  let minEnd = 1440;

  for (const pid of playerIds) {
    const userRanges = rangesByUser.get(pid);
    if (!userRanges) return null;
    const dayRanges = userRanges[date];
    if (!dayRanges || dayRanges.length === 0) return null;

    // Find the single range that covers [slotStart, slotEnd)
    let covering: { start: number; end: number } | null = null;
    for (const rng of dayRanges) {
      const rStart = timeToMinutes(rng.start);
      const rEnd = timeToMinutes(rng.end);
      if (rStart <= slotStart && rEnd >= slotEnd) {
        covering = { start: rStart, end: rEnd };
        break;
      }
    }
    if (!covering) return null;

    if (covering.start > maxStart) maxStart = covering.start;
    if (covering.end < minEnd) minEnd = covering.end;
  }

  if (minEnd - maxStart < 60) return null;

  return {
    window_start: minutesToHHMM(maxStart),
    window_end: minutesToHHMM(minEnd),
  };
}
