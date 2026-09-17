// Asking a venue to come onto Padel Players — the message, and the ways to send it.
//
// UAT asked what "Ask them" does, and whether it should be "a qr code or a pop
// up with a ready made message to forward to the venue". It was neither: the
// button navigated to the venue's detail page, which is exactly what tapping
// the venue's name already did. A control that names an action and performs a
// navigation is the thing to fix, not the label.
//
// The message is the answer, and the QR is not, for a reason worth writing down:
// a QR code only works while you are standing at the desk with your phone out.
// A player who has just noticed their local club is missing is usually at home.
// A message they can forward into WhatsApp reaches the club either way — and if
// they *are* at the desk, they can still hold up the phone and let the person
// read it. So: message first, everywhere; QR is a venue-desk optimisation that
// can come later if the message route proves not to convert.

/** Where a venue lands when they follow the link — the ForVenues page. */
export function venuesLandingUrl(): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://v2.padelplayersapp.com'
  return `${origin}/venues`
}

export interface VenueOutreachContext {
  venueName: string
  /** The asking player's name, so the club sees a person rather than a robot. */
  playerName?: string | null
  city?: string | null
}

/**
 * The message the player forwards. Written to be read by a club manager who has
 * never heard of us: it says who is asking, what it is, and what it costs them
 * to look. No exclamation marks, no emoji — this is a message a player sends to
 * a business, and the tone should let them send it without editing.
 */
/**
 * S4/R2: rewritten as a player asking their club a question, not our sales pitch
 * under their name. Short, first-person, no feature list.
 */
export function venueOutreachMessage(ctx: VenueOutreachContext): string {
  const name = ctx.playerName?.trim() || ''
  return [
    `Hi ${ctx.venueName},`,
    ``,
    `I play padel at your club and use the Padel Players App to organise games with my group. It would be great if we could book courts through it — would you be open to listing?`,
    ``,
    `${venuesLandingUrl()}`,
    ``,
    name,
  ].filter(Boolean).join('\n')
}

export type OutreachResult = 'shared' | 'copied' | 'cancelled' | 'unavailable'

/**
 * Hand the message to the player's own share sheet, so they pick the club's
 * WhatsApp / email / Instagram themselves. We never send on their behalf: this
 * is their relationship with their club, and a message that arrives from the
 * app rather than from them is spam.
 */
export async function shareVenueOutreach(ctx: VenueOutreachContext): Promise<OutreachResult> {
  const text = venueOutreachMessage(ctx)

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: `Padel Players — ${ctx.venueName}`, text })
      return 'shared'
    } catch (e: unknown) {
      // AbortError = the player dismissed the sheet. Not a failure, and not a
      // reason to fall through to the clipboard behind their back.
      if (e && typeof e === 'object' && (e as { name?: string }).name === 'AbortError') return 'cancelled'
    }
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return 'copied'
    } catch { /* fall through */ }
  }
  return 'unavailable'
}

/** Direct WhatsApp compose, for the explicit affordance. */
export function whatsappOutreachUrl(ctx: VenueOutreachContext): string {
  return `https://wa.me/?text=${encodeURIComponent(venueOutreachMessage(ctx))}`
}

/** Direct mail compose, when the player has the club's address. */
export function mailtoOutreachUrl(ctx: VenueOutreachContext, to?: string | null): string {
  const subject = `Padel Players App — listing ${ctx.venueName}`
  return `mailto:${to?.trim() ?? ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(venueOutreachMessage(ctx))}`
}
