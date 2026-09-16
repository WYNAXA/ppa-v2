// Single source of truth for venue tier derivation.
// §1: A venue sits in exactly one tier.
//   tier 1 = ppa_bookable true (book in the app, pay, split)
//   tier 2 = booking_url or booking_platform present (hand off)
//   tier 3 = neither (phone, website, directions)
// One function, one definition. Grep S2-G6 proves there is only one.

export type VenueTier = 1 | 2 | 3

/**
 * P1/P5a: Named platforms seeded from the data. Only values that exist in
 * padel_venues.booking_platform AND whose booking_url host matches. 'Own' and
 * 'Custom' are internal categories, not brands. Matchi, Padel Mates, Court
 * Booking were removed — zero venues carry them.
 *
 * "Book on <name>" requires BOTH the name here AND the URL host containing the
 * platform token — the same pairing check_booking_platform_url enforces in the
 * DB. Where they disagree: "Visit their website".
 *
 * Add new platforms here — this is the ONLY place the list lives.
 */
const NAMED_PLATFORMS: Record<string, string> = {
  'Playtomic':  'playtomic',   // 177 venues, all URLs match
  'EasyCancha': 'easycancha',  // 1 venue, URL matches
}

/** True if booking_platform is a real named platform AND the URL host matches. */
export function isNamedPlatform(platform: string | null | undefined, bookingUrl?: string | null): boolean {
  if (!platform || !(platform in NAMED_PLATFORMS)) return false
  if (!bookingUrl) return true
  const token = NAMED_PLATFORMS[platform]
  try {
    const host = new URL(bookingUrl).hostname.toLowerCase()
    return host.includes(token)
  } catch {
    return false
  }
}

/**
 * P6b: the display name for a named platform — the domain, not the brand.
 * "Book on playtomic.com" says where it goes. "Book on Playtomic" implies an app.
 * On iOS, club URLs always open Safari (AASA does not list /clubs/ — G4).
 */
export function platformDisplayName(bookingUrl: string | null | undefined): string {
  if (!bookingUrl) return 'their website'
  try {
    return new URL(bookingUrl).hostname.replace(/^www\./, '')
  } catch {
    return 'their website'
  }
}

export function getVenueTier(venue: {
  ppa_bookable?: boolean | null
  booking_url?: string | null
  booking_platform?: string | null
}): VenueTier {
  if (venue.ppa_bookable === true) return 1
  if (venue.booking_url || venue.booking_platform) return 2
  return 3
}

