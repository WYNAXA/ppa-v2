import { supabase } from '@/lib/supabase'

/**
 * Narrowing helpers for rows read from the `discoverable_venues` VIEW.
 *
 * Postgres does not propagate NOT NULL through a view, so every column of
 * `discoverable_venues` arrives in the generated types as nullable — including
 * `venue_id`, which is the base table's primary key and is never actually null.
 *
 * That mismatch is not cosmetic. Before the Supabase client was typed, view rows
 * were assigned straight into local `Venue` interfaces that declared
 * `venue_id: string` / `venue_name: string`, and nothing checked it. A row that
 * genuinely did have a null name would render "undefined" in a picker, and a
 * null id would navigate to `/venues/null`.
 *
 * The fix is to narrow once, here, rather than sprinkle `!` assertions at each
 * call site. An assertion would silence the compiler and keep the bug; this
 * drops rows that cannot be used and gives the caller a properly typed list.
 */

/** The two fields every venue picker needs in order to be useful. */
export interface VenueRowLike {
  venue_id: string | null
  venue_name: string | null
}

/** The same row, once we know it is usable. */
export type UsableVenue<T extends VenueRowLike> = T & {
  venue_id: string
  venue_name: string
}

/**
 * Keep only the rows that can actually be displayed and navigated to.
 *
 * In practice this filters nothing — `venue_id` is a primary key and
 * `venue_name` is populated on every row — but it is the honest way to satisfy
 * the view's nullable typing, and it means a future null genuinely cannot reach
 * the UI.
 */
export function usableVenues<T extends VenueRowLike>(
  rows: T[] | null | undefined,
): UsableVenue<T>[] {
  return (rows ?? []).filter(
    (r): r is UsableVenue<T> => !!r.venue_id && !!r.venue_name,
  )
}

/**
 * The confirmed court count for a venue, or null if no column carries data.
 *
 * `number_of_courts` is the authoritative total (Rocket Padel Bristol: 14).
 * The indoor/outdoor/covered breakdown is often partial (same venue: indoor 4,
 * the other 10 unclassified). `Math.max` picks whichever is larger, so a
 * partial breakdown never understates the total, and a venue with nothing
 * returns null rather than 0 — "0 courts" reads as "this venue has none"
 * rather than "we don't know".
 */
export function confirmedCourtCount(v: {
  indoor_courts?: number | null
  outdoor_courts?: number | null
  covered_courts?: number | null
  number_of_courts?: number | null
}): number | null {
  const breakdown =
    (v.indoor_courts ?? 0) + (v.outdoor_courts ?? 0) + (v.covered_courts ?? 0)
  const total = Math.max(breakdown, v.number_of_courts ?? 0)
  return total > 0 ? total : null
}

/**
 * Resolve a venue id from EITHER id space to a padel_venues row.
 *
 * Four call sites need this: self_report_booking (DB), venue-manager
 * Bookings.tsx (twice), and BookCourt.tsx. The id may be a
 * `padel_venues.venue_id` or a `venues.id` (the Hub anchor stored in
 * `padel_venues.venues_id`). Tries venue_id first (cheaper, indexed),
 * then venues_id.
 *
 * Returns the selected columns or null if the id resolves to nothing in
 * either space.
 */
export async function resolveVenue<T extends string>(
  id: string,
  select: T,
): Promise<Record<string, unknown> | null> {
  // Try padel_venues.venue_id first (the common case for player-app links).
  const { data: byVenueId } = await supabase
    .from('padel_venues')
    .select(select)
    .eq('venue_id', id)
    .maybeSingle()
  if (byVenueId) return byVenueId as Record<string, unknown>

  // Fall back to venues_id (the Hub anchor, used by the embed widget).
  const { data: byVenuesId } = await supabase
    .from('padel_venues')
    .select(select)
    .eq('venues_id', id)
    .maybeSingle()
  return (byVenuesId as Record<string, unknown>) ?? null
}
