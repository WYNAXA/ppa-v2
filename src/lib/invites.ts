// Guest-invite helpers: build the deep link, share it via the native share sheet
// (WhatsApp / Messages / etc.), and optionally pull a name from device contacts.

export interface MatchInviteContext {
  token: string
  guestName?: string
  inviterName?: string
  matchDate?: string   // ISO date
  venue?: string | null
}

/** The tokenised deep link a new player taps to install/open PPA and join the match. */
export function buildMatchInviteLink(token: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://v2.padelplayersapp.com'
  return `${origin}/join/match/${token}`
}

function inviteMessage(ctx: MatchInviteContext): string {
  const who = ctx.guestName ? `Hi ${ctx.guestName}! ` : ''
  const by = ctx.inviterName ? `${ctx.inviterName} invited you` : 'You\'re invited'
  let when = ''
  if (ctx.matchDate) {
    try {
      const d = new Date(ctx.matchDate + 'T00:00:00')
      when = ` on ${d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}`
    } catch { /* ignore */ }
  }
  const where = ctx.venue ? ` at ${ctx.venue}` : ''
  return `${who}${by} to a padel match${when}${where}. Tap to join on Padel Players App 🎾`
}

export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'unavailable'

/**
 * Share the invite. Prefers the native share sheet (so the sender picks the
 * recipient in WhatsApp / Messages — no phone number needed). Falls back to
 * copying the link to the clipboard.
 */
export async function shareMatchInvite(ctx: MatchInviteContext): Promise<ShareResult> {
  const url = buildMatchInviteLink(ctx.token)
  const text = inviteMessage(ctx)

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: 'Padel Players App', text, url })
      return 'shared'
    } catch (e: unknown) {
      // AbortError = user dismissed the sheet; treat as cancelled, not an error.
      if (e && typeof e === 'object' && (e as { name?: string }).name === 'AbortError') return 'cancelled'
      // fall through to clipboard
    }
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`)
      return 'copied'
    } catch { /* ignore */ }
  }
  return 'unavailable'
}

/** Direct WhatsApp link, for an explicit "Share on WhatsApp" affordance. */
export function whatsappInviteUrl(ctx: MatchInviteContext): string {
  const url = buildMatchInviteLink(ctx.token)
  return `https://wa.me/?text=${encodeURIComponent(`${inviteMessage(ctx)}\n${url}`)}`
}

// ── Device contacts (progressive enhancement) ──────────────────────────────
// Web Contacts Picker API — supported in Android Chrome; absent on iOS WKWebView.

interface ContactsManagerLike {
  select: (props: string[], opts?: { multiple?: boolean }) => Promise<Array<{ name?: string[]; tel?: string[]; email?: string[] }>>
}
function contactsApi(): ContactsManagerLike | null {
  const n = navigator as unknown as { contacts?: ContactsManagerLike }
  return n.contacts && typeof n.contacts.select === 'function' ? n.contacts : null
}

export function isContactPickerSupported(): boolean {
  return typeof navigator !== 'undefined' && !!contactsApi()
}

export interface PickedContact { name?: string; tel?: string; email?: string }

/** Opens the OS contact picker (where supported) and returns the chosen contact. */
export async function pickContact(): Promise<PickedContact | null> {
  const api = contactsApi()
  if (!api) return null
  try {
    const results = await api.select(['name', 'tel', 'email'], { multiple: false })
    if (!results || results.length === 0) return null
    const c = results[0]
    return { name: c.name?.[0], tel: c.tel?.[0], email: c.email?.[0] }
  } catch {
    return null
  }
}
