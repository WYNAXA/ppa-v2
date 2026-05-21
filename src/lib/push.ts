import { supabase } from '@/lib/supabase'
import * as Sentry from '@sentry/react'

/**
 * Checks if the current browser/device supports Web Push.
 */
export function isPushSupported(): boolean {
  return (
    typeof Notification !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  )
}

/**
 * Checks if the user is on iOS Safari but NOT running as installed PWA.
 * iOS Safari only supports push when installed to home screen.
 */
export function isIosNonPwa(): boolean {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  return isIOS && !isStandalone
}

/**
 * Requests push permission, subscribes via the service worker,
 * and stores the subscription token in the user's profile.
 *
 * Returns { success: true } if the user granted permission and we subscribed,
 * or { success: false, reason: string } if anything failed.
 */
export async function subscribeToPush(userId: string): Promise<
  { success: true } | { success: false; reason: 'unsupported' | 'ios-non-pwa' | 'denied' | 'no-vapid-key' | 'error'; message: string }
> {
  if (!isPushSupported()) {
    return { success: false, reason: 'unsupported', message: 'Push notifications are not supported on this device.' }
  }

  if (isIosNonPwa()) {
    return {
      success: false,
      reason: 'ios-non-pwa',
      message: 'To enable notifications on iPhone, first add this app to your home screen: tap the Share button → Add to Home Screen.',
    }
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    return { success: false, reason: 'denied', message: 'Notification permission was denied.' }
  }

  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
  if (!vapidKey) {
    Sentry.captureMessage('VITE_VAPID_PUBLIC_KEY not configured', 'error')
    return {
      success: false,
      reason: 'no-vapid-key',
      message: 'Push notifications are not configured. Please contact support.',
    }
  }

  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: vapidKey,
    })
    await supabase
      .from('profiles')
      .update({ push_token: JSON.stringify(sub) })
      .eq('id', userId)
    return { success: true }
  } catch (err) {
    Sentry.captureException(err)
    return { success: false, reason: 'error', message: 'Failed to subscribe to push notifications.' }
  }
}

/**
 * Unsubscribes from push and clears the token from the user's profile.
 */
export async function unsubscribeFromPush(userId: string): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (sub) await sub.unsubscribe()
  } catch { /* best effort */ }
  await supabase.from('profiles').update({ push_token: null }).eq('id', userId)
}
