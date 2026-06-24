import { supabase } from './supabase'

interface NotificationPayload {
  user_id: string
  type: string
  title: string
  message: string
  related_id?: string
  read?: boolean
}

/**
 * Fire-and-forget notification insert. Logs failures but never throws —
 * courtesy notifications must not block the primary action.
 */
export async function sendNotification(payload: NotificationPayload): Promise<boolean> {
  try {
    const { error } = await supabase.from('notifications').insert({ ...payload, read: payload.read ?? false })
    if (error) {
      console.warn('[notification] insert failed:', error.message)
      return false
    }
    return true
  } catch (e) {
    console.warn('[notification] insert error:', e)
    return false
  }
}

/**
 * Bulk fire-and-forget notification insert.
 */
export async function sendNotifications(payloads: NotificationPayload[]): Promise<boolean> {
  if (payloads.length === 0) return true
  try {
    const rows = payloads.map((p) => ({ ...p, read: p.read ?? false }))
    const { error } = await supabase.from('notifications').insert(rows)
    if (error) {
      console.warn(`[notification] bulk insert failed (${payloads.length} rows):`, error.message)
      return false
    }
    return true
  } catch (e) {
    console.warn('[notification] bulk insert error:', e)
    return false
  }
}
