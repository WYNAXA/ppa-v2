/**
 * Single source of truth for "is this venue open at this time?"
 *
 * Three states, never two:
 *   'open'    — hours are trustworthy and cover the requested time
 *   'closed'  — hours are trustworthy and exclude the requested time
 *   'unknown' — no hours, partial scrape, or seed-default hours
 *
 * OPEN and UNKNOWN appear in search results. CLOSED does not.
 * UNKNOWN is labelled as such — never styled to look confirmed.
 *
 * Resolution order:
 *   1. court_availability_settings (the venue's own declaration in the Hub)
 *      — if present, authoritative. Full stop.
 *   2. opening_hours jsonb, if trustworthy (not seed default, covers that weekday)
 *   3. otherwise 'unknown'
 *
 * Rules (CLAUDE.md / BOOKING_V1_BUILD.md §4):
 *   - Missing day in a partial scrape → unknown (not closed)
 *   - Seed default (Mon-Fri 07:00-22:00 / Sat-Sun 08:00-21:00) → unknown
 *   - Wrap-around (open 16:00 / close 02:00) is handled correctly
 *   - 00:00 close means midnight
 *
 * This function is the ONLY place these rules live. VenueDetail and the
 * §4 time filter both call it. Do not duplicate.
 */

type DayKey = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'
type DayHours = { open: string; close: string }
type OpeningHours = Partial<Record<DayKey, DayHours>>

const ALL_DAYS: DayKey[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const WEEKDAYS: DayKey[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
const WEEKEND: DayKey[] = ['saturday', 'sunday']

/** The exact pattern assigned by the data pipeline to ~289 venues worldwide. */
function isSeedDefault(oh: OpeningHours): boolean {
  const wk = WEEKDAYS.every(d => oh[d]?.open === '07:00' && oh[d]?.close === '22:00')
  const we = WEEKEND.every(d => oh[d]?.open === '08:00' && oh[d]?.close === '21:00')
  return wk && we
}

/** Parse "HH:MM" or "HH:MM:SS" to minutes since midnight. */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + (m || 0)
}

/** Check whether a query time falls within an open/close window. */
function timeInRange(openHHMM: string, closeHHMM: string, queryHHMM: string): boolean {
  const openMin = toMinutes(openHHMM)
  const closeMin = toMinutes(closeHHMM)
  const queryMin = toMinutes(queryHHMM)

  // Wrap-around: close is after midnight (close <= open)
  if (closeMin <= openMin) {
    return queryMin >= openMin || queryMin < closeMin
  }
  // Normal: open < close
  return queryMin >= openMin && queryMin < closeMin
}

/** Map JS Date.getDay() (0=Sun) to our day key. */
const JS_DAY_TO_KEY: DayKey[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

export type VenueOpenState = 'open' | 'closed' | 'unknown'

/**
 * court_availability_settings from the Hub. When present, authoritative.
 *
 * indoor_open_time / indoor_close_time and outdoor_* are optional overrides
 * that narrow the window for that court type. When NULL, open_time/close_time
 * applies to all courts. If BOTH indoor and outdoor overrides are set, the
 * venue is open if EITHER range covers the query time (a player can book
 * whichever type is available).
 */
export interface AvailabilitySettings {
  open_time: string       // "HH:MM:SS", NOT NULL
  close_time: string      // "HH:MM:SS", NOT NULL
  indoor_open_time?: string | null
  indoor_close_time?: string | null
  outdoor_open_time?: string | null
  outdoor_close_time?: string | null
}

/**
 * Determine whether a venue is open at a specific day and time.
 *
 * @param oh    The venue's opening_hours jsonb (nullable)
 * @param day   The weekday key, or a Date from which we derive it
 * @param timeHHMM  "HH:MM" in the venue's local time
 * @param avail court_availability_settings, if the venue has them
 */
export function venueOpenState(
  oh: OpeningHours | null | undefined,
  day: DayKey | Date,
  timeHHMM: string,
  avail?: AvailabilitySettings | null,
): VenueOpenState {

  // ── Priority 1: court_availability_settings (Hub-declared) ────────────
  if (avail) {
    // If both indoor and outdoor overrides are set, open if EITHER covers the time
    const hasIndoor = avail.indoor_open_time != null && avail.indoor_close_time != null
    const hasOutdoor = avail.outdoor_open_time != null && avail.outdoor_close_time != null

    if (hasIndoor || hasOutdoor) {
      const indoorOpen = hasIndoor && timeInRange(avail.indoor_open_time!, avail.indoor_close_time!, timeHHMM)
      const outdoorOpen = hasOutdoor && timeInRange(avail.outdoor_open_time!, avail.outdoor_close_time!, timeHHMM)
      // If only one type has overrides, the other falls back to the base window
      if (hasIndoor && hasOutdoor) {
        return (indoorOpen || outdoorOpen) ? 'open' : 'closed'
      }
      // One override + base window
      const baseOpen = timeInRange(avail.open_time, avail.close_time, timeHHMM)
      return (hasIndoor ? indoorOpen : baseOpen) || (hasOutdoor ? outdoorOpen : baseOpen)
        ? 'open' : 'closed'
    }

    // No indoor/outdoor overrides — just base window
    return timeInRange(avail.open_time, avail.close_time, timeHHMM) ? 'open' : 'closed'
  }

  // ── Priority 2: opening_hours jsonb ───────────────────────────────────

  // No hours at all → unknown
  if (!oh || Object.keys(oh).length === 0) return 'unknown'

  // Seed default → unknown
  if (isSeedDefault(oh)) return 'unknown'

  const dayKey: DayKey = day instanceof Date ? JS_DAY_TO_KEY[day.getDay()] : day
  const presentDays = ALL_DAYS.filter(d => oh[d] != null)

  // Partial scrape: if this day is missing, we can't say closed
  if (!oh[dayKey]) {
    return presentDays.length === 7 ? 'closed' : 'unknown'
  }

  const { open, close } = oh[dayKey]!
  return timeInRange(open, close, timeHHMM) ? 'open' : 'closed'
}

/**
 * Are these hours trustworthy enough to display as confirmed?
 * Used by VenueDetail to decide whether to show hours.
 */
export function hoursAreTrustworthy(
  oh: OpeningHours | null | undefined,
  avail?: AvailabilitySettings | null,
): boolean {
  if (avail) return true
  if (!oh || Object.keys(oh).length === 0) return false
  if (isSeedDefault(oh)) return false
  return true
}
