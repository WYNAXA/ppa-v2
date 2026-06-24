import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Calendar, AlertTriangle } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { useDateLocale } from '@/lib/dateLocale'
import { supabase } from '@/lib/supabase'
import { sendNotification } from '@/lib/notifications'
import { useAuth } from '@/hooks/useAuth'
import { checkSelfConflict } from '@/lib/conflictCheck'

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
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[55] bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-[60] bg-white rounded-t-3xl"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1 w-10 rounded-full bg-gray-200" />
            </div>
            <div className="flex items-center justify-between px-5 py-3">
              <button onClick={onClose} className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center">
                <X className="h-4 w-4 text-gray-600" />
              </button>
              <h2 className="text-[15px] font-bold text-gray-900">Invite {playerName.split(' ')[0]}</h2>
              <div className="w-9" />
            </div>
            <div className="px-5 pb-6 overflow-y-auto" style={{ maxHeight: '60vh', paddingBottom: 'calc(32px + env(safe-area-inset-bottom))' }}>
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#009688] border-t-transparent" />
                </div>
              ) : matches.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-[13px] text-gray-500">No upcoming matches with open slots</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-[11px] text-gray-400 mb-2">Select a match to invite {playerName.split(' ')[0]} to:</p>
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
                        className="w-full flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-left active:scale-[0.98] transition-transform disabled:opacity-50"
                      >
                        <div className="h-9 w-9 rounded-full bg-teal-50 flex items-center justify-center flex-shrink-0">
                          <Calendar className="h-4 w-4 text-[#009688]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold text-gray-800">{dateStr}{timeStr && ` · ${timeStr}`}</p>
                          <p className="text-[11px] text-gray-400">
                            {m.booked_venue_name ?? 'Venue TBC'} · {slots} slot{slots !== 1 ? 's' : ''} open
                          </p>
                        </div>
                      </button>
                    )
                  })}
                  {/* Conflict warning dialog */}
                  {conflictWarn && (
                    <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 p-3">
                      <div className="flex items-start gap-2 mb-2">
                        <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                        <p className="text-[13px] font-semibold text-amber-800">
                          {playerName.split(' ')[0]} already has a match{conflictWarn.time ? ` at ${conflictWarn.time.slice(0, 5)}` : ' that day'}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setConflictWarn(null)}
                          className="flex-1 rounded-xl border border-gray-200 py-2 text-[12px] font-semibold text-gray-600"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => { inviteMutation.mutate(conflictWarn.match); setConflictWarn(null) }}
                          className="flex-1 rounded-xl bg-amber-500 py-2 text-[12px] font-bold text-white"
                        >
                          Invite anyway
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {inviteMutation.isError && (
                <p className="text-[12px] text-red-500 text-center mt-3">Failed to send invitation. Try again.</p>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
