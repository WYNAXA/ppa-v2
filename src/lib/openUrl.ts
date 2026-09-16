/**
 * Navigate to a URL via a real anchor click.
 *
 * iOS standalone (home-screen PWA / wrapped app) honours this where it
 * swallows `window.open()`. Extracted from AddToCalendarSheet where it was
 * first written, so every external-link site uses the one implementation.
 *
 * Q3 (2026-09-16): Playtomic club URLs (playtomic.com/clubs/*) CANNOT open
 * the Playtomic app on iOS. Their AASA at app.playtomic.com lists /groups
 * and /leagues but NOT /clubs. This anchor click opens Safari for club URLs.
 * On Android, assetlinks.json is present and should open the app (untested
 * on a handset). This finding can change if Playtomic edits their AASA.
 * EasyCancha AASA lists /redirectTo/* — our URL shape does not match either.
 */
export function openUrl(url: string) {
  const a = document.createElement('a')
  a.href = url
  a.target = '_blank'
  a.rel = 'noopener noreferrer'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}
