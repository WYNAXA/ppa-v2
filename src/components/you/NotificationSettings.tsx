import type { TableInsert } from '@/lib/types'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { Toggle } from '@/components/shared/Toggle'

/**
 * The six notification categories, finally reachable.
 *
 * `notification_preferences` has existed with a row per player since May and
 * nothing in the app ever read or wrote it — and until migration
 * 20260910000008 nothing in the database read it either. The switches are real
 * now: `wants_push(user_id, type)` is the single gate the push pipeline asks,
 * and it combines the master switch below with the category chosen here.
 *
 * WHY THE CATEGORIES ARE DISABLED WHEN PUSH IS OFF
 *   The master switch wins in `wants_push`, so with push off these change
 *   nothing. Showing six live-looking switches that have no effect is the same
 *   class of lie this whole piece of work exists to remove. They stay visible
 *   so a player can see what they will get back, and stay disabled so they
 *   cannot be fiddled with pointlessly.
 *
 * WHY OPTIMISTIC
 *   A switch that waits for a round trip before moving feels broken. The write
 *   is a single boolean; on failure the cache is rolled back to exactly what
 *   the server last returned and the player is told.
 */

interface Prefs {
  open_matches: boolean
  match_reminders: boolean
  match_results: boolean
  poll_reminders: boolean
  chat_notifications: boolean
  connection_requests: boolean
}

const DEFAULTS: Prefs = {
  open_matches: true,
  match_reminders: true,
  match_results: true,
  poll_reminders: true,
  chat_notifications: true,
  connection_requests: true,
}

// Ordered loudest first. `open_matches` reaches every accepted connection at
// once, so it is the one a player is most likely to come here to find.
const CATEGORIES: { key: keyof Prefs; labelKey: string; hintKey: string }[] = [
  { key: 'open_matches',        labelKey: 'you.notif_open_matches',        hintKey: 'you.notif_open_matches_hint' },
  { key: 'match_reminders',     labelKey: 'you.notif_match_reminders',     hintKey: 'you.notif_match_reminders_hint' },
  { key: 'match_results',       labelKey: 'you.notif_match_results',       hintKey: 'you.notif_match_results_hint' },
  { key: 'poll_reminders',      labelKey: 'you.notif_poll_reminders',      hintKey: 'you.notif_poll_reminders_hint' },
  { key: 'chat_notifications',  labelKey: 'you.notif_chat',                hintKey: 'you.notif_chat_hint' },
  { key: 'connection_requests', labelKey: 'you.notif_connections',         hintKey: 'you.notif_connections_hint' },
]

export function NotificationSettings({ userId, pushEnabled }: { userId: string; pushEnabled: boolean }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const queryKey = ['notification-preferences', userId]

  const { data: prefs, isLoading } = useQuery<Prefs>({
    queryKey,
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notification_preferences')
        .select('open_matches, match_reminders, match_results, poll_reminders, chat_notifications, connection_requests')
        .eq('user_id', userId)
        .maybeSingle()
      // No row is not an error: a player who has never had one gets the
      // defaults, which is exactly what wants_push assumes for them.
      if (error) throw error
      return { ...DEFAULTS, ...(data ?? {}) } as Prefs
    },
  })

  const save = useMutation({
    mutationFn: async ({ key, value }: { key: keyof Prefs; value: boolean }) => {
      // Upsert rather than update: the row is created by a trigger on signup,
      // but a player predating that trigger has none and an update would
      // silently affect zero rows and report success.
      // `key` is `keyof Prefs`, so this payload is valid by construction —
      // TypeScript cannot narrow a computed key inside an object literal. The
      // cast is on the payload only; the column types stay strict.
      const patch = { user_id: userId, [key]: value } as TableInsert<'notification_preferences'>
      const { error } = await supabase
        .from('notification_preferences')
        .upsert(patch, { onConflict: 'user_id' })
      if (error) throw error
    },
    onMutate: async ({ key, value }) => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<Prefs>(queryKey)
      queryClient.setQueryData<Prefs>(queryKey, (old) => ({ ...(old ?? DEFAULTS), [key]: value }))
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous)
      toast.error(t('you.notif_save_failed'))
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey })
    },
  })

  if (isLoading || !prefs) return null

  return (
    <div className={pushEnabled ? undefined : 'opacity-60'}>
      <div className="px-4 pt-3.5 pb-1">
        <p className="text-[12px] font-bold text-ink-2 uppercase tracking-wide">
          {t('you.notif_what_you_get')}
        </p>
        {!pushEnabled && (
          <p className="text-[11px] text-ink-3 mt-1">{t('you.notif_push_off_hint')}</p>
        )}
      </div>

      {CATEGORIES.map(({ key, labelKey, hintKey }) => {
        const label = t(labelKey)
        return (
          <div key={key} className="flex items-start justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
              <span className="text-[13px] font-medium text-ink-2 block">{label}</span>
              <span className="text-[11px] text-ink-3 block mt-0.5">{t(hintKey)}</span>
            </div>
            <div className="pt-0.5">
              <Toggle
                checked={prefs[key]}
                disabled={!pushEnabled || save.isPending}
                label={label}
                onChange={() => save.mutate({ key, value: !prefs[key] })}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
