/**
 * Navigate to a URL via a real anchor click.
 *
 * iOS standalone (home-screen PWA / wrapped app) honours this where it
 * swallows `window.open()`. Extracted from AddToCalendarSheet where it was
 * first written, so every external-link site uses the one implementation.
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
