import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Calendar, AlertTriangle, Plus, ChevronRight } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { useDateLocale } from '@/lib/dateLocale'
import { supabase } from '@/lib/supabase'
import { sendNotification } from '@/lib/notifications'
import { useAuth } from '@/hooks/useAuth'
import { checkSelfConflict } from '@/lib/conflictCheck'
import { CreateMatchSheet, type MatchPlayer } from '@/components/play/CreateMatchSheet'

/**
 * "Play with <someone>" — reached from a connection, a player card or the
 * connections list.
 *
 * WHY IT OFFERS TWO ROUTES
 *   UAT: *"when i click on my connections and then a player it gives me no
 *   upcoming matches with open slots. this is fine but can we have the option to
 *   create a match with this person?"*
 *
 *   Root cause is not a missing button in the empty state. The sheet only knew
 *   how to *add someone to a match that already exists*, so the action it named
 *   was impossible for any player without a half-empty fixture in their diary —
 *   and "no upcoming matches with open slots" was a dead end rather than an
 *   answer. Starting a new match is not a fallback for that case; it is the
 *   other half of what "play with this person" means, and it is offered first
 *   whether or not there is anything to add them to. A player with three open
 *   fixtures may still want a fourth with only this person in it.
 *
 *   Fix class: root-cause. Showing the create button only when the list came
 *   back empty would have been the patch — it would have made the more common
 *   intent reachable only by accident.
 */

interface InviteToMatchSheetProps {
  open: boolean
  onClose: () => void
  playerId: string
  playerName: string
}

export function InviteToMatchSheet({ open, onClose, playerId, playerName }: InviteToMatchSheetProps) {
  const { profile } = useAuth()
  const userId = profile?.id ?? ''
  const queryClient = useQueryClient()
  const locale = useDateLocale()
  const today = new Date().toISOString().split('T')[0]
  const [conflictWarn, setConflictWarn] = useState<{ match: any; time: string | null } | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const firstName = playerName.split(' ')[0]

  /**
   * The invited player's own row, so the new match seats them with their real
   * avatar and level rather than a name-only placeholder. Callers reach this
   * sheet from three places and only one of them has the full profile to hand,
   * so it is fetched here rather than threaded through every caller.
   */
  const { data: invitee } = useQuery<MatchPlayer | null>({
    queryKey: ['invite-player-profile', playerId],
    enabled: open && !!playerId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, name, avatar_url, playtomic_level')
        .eq('id', playerId)
        .maybeSingle()
      return (data as MatchPlayer) ?? { id: playerId, name: playerName }
    },
  })

  const { data: matches = [], isLoading } = useQuery({
    queryKey: ['invite-to-match-options', userId],
    enabled: open && !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from('matches')
        .select('id, match_date, match_time, player_ids, status, booked_venue_name, group_id')
        .contains('player_ids', [userId])
        .gte('match_date', today)
        .not('status', 'in', '("completed","cancelled")')
        .order('match_date', { ascending: true })
        .limit(20)
      return (data ?? []).filter((m: any) => (m.player_ids?.length ?? 0) < 4 && !m.player_ids?.includes(playerId))
    },
  })

  const inviteMutation = useMutation({
    mutationFn: async (match: any) => {
      const { error } = await supabase
        .from('matches')
        .update({ player_ids: [...(match.player_ids ?? []), playerId] })
        .eq('id', match.id)
      if (error) throw error

      const dateStr = (() => { try { return format(parseISO(match.match_date), 'EEE d MMM', { locale }) } catch { return match.match_date } })()
      sendNotification({
        user_id: playerId,
        type: 'match_created',
        title: 'Match invitation',
        message: `${profile?.name ?? 'A player'} invited you to play on ${dateStr}`,
        related_id: match.id,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['matches'] })
      queryClient.invalidateQueries({ queryKey: ['invite-to-match-options'] })
      onClose()
    },
  })

  return (
    <>
    <AnimatePresence>
      {/* Hidden — not unmounted — while the create flow is up. Two stacked
          sheets at the same depth read as a mistake, and both carry the same
          z-index, so which one wins would otherwise depend on DOM order. The
          component stays mounted so the invitee query keeps its result. */}
      {open && !createOpen && (
        <>
          <motion.div
            className="fixed inset-0 z-[55] bg-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-[60] bg-card rounded-t-3xl"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1 w-10 rounded-full bg-hairline" />
            </div>
            <div className="flex items-center justify-between px-5 py-3">
              <button onClick={onClose} className="h-9 w-9 rounded-full bg-hairline flex items-center justify-center">
                <X className="h-4 w-4 text-ink-2" />
              </button>
              <h2 className="text-[15px] font-bold text-ink">Play with {firstName}</h2>
              <div className="w-9" />
            </div>
            <div className="px-5 pb-6 overflow-y-auto" style={{ maxHeight: '70vh', paddingBottom: 'calc(32px + env(safe-area-inset-bottom))' }}>
              {/* Route one: a brand-new match, with them already seated. Always
                  present — see the note at the top of this file. */}
              <button
                onClick={() => setCreateOpen(true)}
                className="mb-4 flex w-full items-center gap-3 rounded-2xl bg-court p-4 text-left transition-transform active:scale-[0.99]"
              >
                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-ball">
                  <Plus className="h-5 w-5 text-ink" strokeWidth={2.4} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-bold leading-5 text-white">
                    New match with {firstName}
                  </span>
                  <span className="block text-[12px] leading-4 text-court-100">
                    Pick a date, court and the other two
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 flex-shrink-0 text-court-100" />
              </button>

              {isLoading ? (
                <div className="flex justify-center py-8">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-court border-t-transparent" />
                </div>
              ) : matches.length === 0 ? (
                <p className="pb-2 text-center text-[13px] text-ink-2">
                  You have no upcoming matches with a free slot to add {firstName} to.
                </p>
              ) : (
                <div className="space-y-2">
                  <p className="text-[11px] text-ink-2 mb-2">Or add {firstName} to a match you already have:</p>
                  {matches.map((m: any) => {
                    const dateStr = (() => { try { return format(parseISO(m.match_date), 'EEE d MMM', { locale }) } catch { return m.match_date } })()
                    const timeStr = m.match_time?.slice(0, 5) ?? ''
                    const slots = 4 - (m.player_ids?.length ?? 0)
                    return (
                      <button
                        key={m.id}
                        onClick={async () => {
                          // Soft-warn: check if invited player has a conflict
                          const conflicts = await checkSelfConflict(playerId, m.match_date, m.match_time ?? null, m.id)
                          if (conflicts.length > 0) {
                            setConflictWarn({ match: m, time: conflicts[0].conflicting_time ?? null })
                            return
                          }
                          inviteMutation.mutate(m)
                        }}
                        disabled={inviteMutation.isPending}
                        className="w-full flex items-center gap-3 rounded-xl border border-hairline bg-surface px-4 py-3 text-left active:scale-[0.98] transition-transform disabled:opacity-50"
                      >
                        <div className="h-9 w-9 rounded-full bg-court-50 flex items-center justify-center flex-shrink-0">
                          <Calendar className="h-4 w-4 text-court" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold text-ink">{dateStr}{timeStr && ` · ${timeStr}`}</p>
                          <p className="text-[11px] text-ink-2">
                            {m.booked_venue_name ?? 'Venue TBC'} · {slots} slot{slots !== 1 ? 's' : ''} open
                          </p>
                        </div>
                      </button>
                    )
                  })}
                  {/* Conflict warning dialog */}
                  {conflictWarn && (
                    <div className="mt-3 rounded-xl bg-warn-50 border border-warn p-3">
                      <div className="flex items-start gap-2 mb-2">
                        <AlertTriangle className="h-4 w-4 text-warn flex-shrink-0 mt-0.5" />
                        <p className="text-[13px] font-semibold text-warn">
                          {firstName} already has a match{conflictWarn.time ? ` at ${conflictWarn.time.slice(0, 5)}` : ' that day'}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setConflictWarn(null)}
                          className="flex-1 rounded-xl border border-hairline py-2 text-[12px] font-semibold text-ink-2"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => { inviteMutation.mutate(conflictWarn.match); setConflictWarn(null) }}
                          className="flex-1 rounded-xl bg-warn py-2 text-[12px] font-bold text-white"
                        >
                          Invite anyway
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {inviteMutation.isError && (
                <p className="text-[12px] text-alert text-center mt-3">Failed to send invitation. Try again.</p>
              )}
            </div>
          </motion.div>
        </>
      )}

    </AnimatePresence>

    {/* A sibling of the AnimatePresence, not a child: it must survive this
        sheet closing behind it, and AnimatePresence only tracks its own
        keyed motion children. */}
    <CreateMatchSheet
      open={createOpen}
      onClose={() => { setCreateOpen(false); onClose() }}
      defaultPlayers={invitee ? [invitee] : undefined}
    />
    </>
  )
}
