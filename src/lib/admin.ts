// Super-admin gate for platform-owner-only tooling (e.g. the venue-claim QR code
// shown to venue owners during business development).
//
// Configure the allow-list via VITE_SUPERADMIN_EMAILS (comma-separated). If unset,
// falls back to the founder email so the in-venue tooling works out of the box.
const FALLBACK_SUPERADMINS = ['christianshanahan@gmail.com']

function configuredSuperAdmins(): string[] {
  const raw = (import.meta.env.VITE_SUPERADMIN_EMAILS as string | undefined) ?? ''
  const list = raw.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
  return list.length ? list : FALLBACK_SUPERADMINS.map((e) => e.toLowerCase())
}

export function isSuperAdmin(email?: string | null): boolean {
  if (!email) return false
  return configuredSuperAdmins().includes(email.toLowerCase())
}

// Base URL of the Wynaxa Hub (venue manager). Overridable for staging via VITE_HUB_URL.
export const HUB_URL = ((import.meta.env.VITE_HUB_URL as string | undefined) ?? 'https://hub.wynaxa.com').replace(/\/$/, '')

// Deep link a venue owner scans to claim / sign in / add their venue in the Hub.
export function venueClaimUrl(venueId: string): string {
  return `${HUB_URL}/claim?venue=${encodeURIComponent(venueId)}`
}
