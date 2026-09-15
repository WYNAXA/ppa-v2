// Single source of truth for venue tier derivation.
// §1: A venue sits in exactly one tier.
//   tier 1 = ppa_bookable true (book in the app, pay, split)
//   tier 2 = booking_url or booking_platform present (hand off)
//   tier 3 = neither (phone, website, directions)
// One function, one definition. Grep S2-G6 proves there is only one.

export type VenueTier = 1 | 2 | 3

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
    case 2: return platform ? `Book with ${platform}` : 'Book with their platform'
    case 3: return 'Call or visit'
  }
}
