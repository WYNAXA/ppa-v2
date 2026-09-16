// Single source of truth for venue tier derivation.
// §1: A venue sits in exactly one tier.
//   tier 1 = ppa_bookable true (book in the app, pay, split)
//   tier 2 = booking_url or booking_platform present (hand off)
//   tier 3 = neither (phone, website, directions)
// One function, one definition. Grep S2-G6 proves there is only one.

export type VenueTier = 1 | 2 | 3

/**
 * P1: Named platforms the user has heard of. 'Own' and 'Custom' are internal
 * categories, not brands. Anything not on this list is treated as a website.
 * Add new platforms here — this is the ONLY place the list lives.
 */
const NAMED_PLATFORMS = new Set(['Playtomic', 'EasyCancha', 'Matchi', 'Padel Mates', 'Court Booking'])

/** True if booking_platform is a real named platform a player recognises. */
export function isNamedPlatform(platform: string | null | undefined): boolean {
  return !!platform && NAMED_PLATFORMS.has(platform)
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

export function getTierLabel(tier: VenueTier, platform?: string | null): string {
  switch (tier) {
    case 1: return 'Book in the app'
    case 2: return isNamedPlatform(platform) ? `Book on ${platform}` : 'Visit their website'
    case 3: return 'Call or visit'
  }
}
