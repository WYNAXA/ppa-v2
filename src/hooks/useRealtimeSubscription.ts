/**
 * Centralized Supabase Realtime subscription hooks.
 *
 * WHY: Eliminates stale-cache bugs by pushing database changes to connected
 * clients in real time. Manual invalidateQueries calls in mutations are kept
 * for instant local feedback; realtime handles eventual consistency for other
 * clients and tabs.
 *
 * HOW TO ADD A NEW SUBSCRIPTION:
 *   1. Ensure the table is in the supabase_realtime publication (see migration
 *      20260511000006_enable_realtime_for_app_tables.sql).
 *   2. Use one of the hooks below, or follow the same pattern:
 *      - Create a channel with a unique name (component + id)
 *      - Chain .on('postgres_changes', ...) handlers
 *      - Call .subscribe()
 *      - Clean up via supabase.removeChannel(channel) on unmount
 *   3. Invalidate React Query cache keys on change — don't set state directly.
 */

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * Subscribe to changes on a specific match and its results/votes.
 * Invalidates the ['match', matchId] query on any change.
 */
export function useMatchSubscription(matchId: string | null | undefined) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!matchId) return

    const channel = supabase
      .channel(`match-detail-${matchId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'matches',
        filter: `id=eq.${matchId}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['match', matchId] })
      })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'match_results',
        filter: `match_id=eq.${matchId}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['match', matchId] })
      })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'match_result_votes',
      }, () => {
        // No filter on match_result_votes (no match_id column) — RLS scopes it
        queryClient.invalidateQueries({ queryKey: ['match', matchId] })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [matchId, queryClient])
}

/**
 * Subscribe to changes affecting a user's matches.
 * Invalidates home, play, and matches list queries.
 */
export function useUserMatchesSubscription(userId: string | null | undefined) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!userId) return

    const channel = supabase
      .channel(`user-matches-${userId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'matches',
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['home-next-match', userId] })
        queryClient.invalidateQueries({ queryKey: ['home-quick-stats', userId] })
        queryClient.invalidateQueries({ queryKey: ['home-activity', userId] })
        queryClient.invalidateQueries({ queryKey: ['matches'] })
        queryClient.invalidateQueries({ queryKey: ['play-matches'] })
      })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'match_results',
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['home-next-match', userId] })
        queryClient.invalidateQueries({ queryKey: ['home-quick-stats', userId] })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId, queryClient])
}

/**
 * Subscribe to new/changed notifications for a user.
 * Invalidates the notifications and unread-count queries.
 */
export function useNotificationsSubscription(userId: string | null | undefined) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!userId) return

    const channel = supabase
      .channel(`notif-sub-${userId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'notifications',
        filter: `user_id=eq.${userId}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['notifications', userId] })
        queryClient.invalidateQueries({ queryKey: ['unread-count', userId] })
        queryClient.invalidateQueries({ queryKey: ['home-activity', userId] })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId, queryClient])
}

/**
 * Subscribe to group membership changes.
 * Invalidates group detail and member list queries.
 */
export function useGroupSubscription(groupId: string | null | undefined) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!groupId) return

    const channel = supabase
      .channel(`group-sub-${groupId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'group_members',
        filter: `group_id=eq.${groupId}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['group', groupId] })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [groupId, queryClient])
}
