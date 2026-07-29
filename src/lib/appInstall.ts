// Helpers for the "Get the app" nudge — shown only to people using the web/PWA
// in a plain mobile browser, never inside the native app or an installed PWA.

export function isRunningInNativeOrInstalled(): boolean {
  if (typeof window === 'undefined') return false
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window.navigator as any).standalone === true
  // iOS native wrapper exposes the OneSignal message handler bridge.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nativeBridge = !!(window as any)?.webkit?.messageHandlers?.onesignal
  return !!standalone || nativeBridge
}

/** Show the "Get the app" prompt only in a normal browser (web onboarding route). */
export function shouldShowGetTheApp(): boolean {
  return !isRunningInNativeOrInstalled()
}

export type MobilePlatform = 'ios' | 'android' | 'other'
export function mobilePlatform(): MobilePlatform {
  if (typeof navigator === 'undefined') return 'other'
  const ua = navigator.userAgent
  if (/iPad|iPhone|iPod/.test(ua)) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return 'other'
}

export const APP_STORE_URL = 'https://apps.apple.com/app/id6762192246'
// TODO: confirm the real Play Store package id (placeholder below).
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.padelplayersapp'
