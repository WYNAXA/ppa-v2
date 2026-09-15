// §3.2 — Whose turn to book
//
// Whose turn = the player in this game who has booked fewest times for this
// group in the last 10 games, ties broken by longest since they last booked.
// Random was deliberately dropped. Visible, countable, slightly competitive.

import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { formatDistanceToNow } from 'date-fns'
import { useDateLocale } from '@/lib/dateLocale'
import { supabase } from '@/lib/supabase'
import { PlayerAvatar } from '@/components/shared/PlayerAvatar'
import { cn } from '@/lib/utils'

interface WhoseTurnPlayer {
  user_id: string
  name: string
  avatar_url: string | null
  bookings_count: number
  last_booked_at: string | null
}

interface WhoseTurnSheetProps {
  matchId: string
  open: boolean
  onClose: () => void
  onClaim: () => void
}

function useWhoseTurn(matchId: string) {
  return useQuery<WhoseTurnPlayer[]>({
    queryKey: ['whose-turn', matchId],
    enabled: !!matchId,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)('whose_turn_to_book', {
        p_match_id: matchId,
      })
      if (error) throw error
      return (data ?? []) as WhoseTurnPlayer[]
    },
  })
}

export function WhoseTurnSheet({ matchId, open, onClose, onClaim }: WhoseTurnSheetProps) {
  const { data: players = [], isLoading } = useWhoseTurn(matchId)
  const { t } = useTranslation()
  const locale = useDateLocale()

  if (!open) return null

  // §3.2: fewest bookings first — the first player is the one who should book
  const suggestedIdx = 0

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-ink/40" />
      <div
        className="relative w-full max-w-lg rounded-t-[20px] bg-card px-5 pb-10 pt-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[18px] font-bold text-ink">
            {t('home.whose_turn_title', { defaultValue: 'Whose turn?' })}
          </h2>
          <button onClick={onClose} className="text-[15px] font-semibold text-ink-2">
            {t('common.close', { defaultValue: 'Close' })}
          </button>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map(i => (
              <div key={i} className="h-14 rounded-card bg-hairline animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-1.5">
            {players.map((player, i) => {
              const isSuggested = i <= suggestedIdx && player.bookings_count === players[suggestedIdx]?.bookings_count
              const lastBooked = player.last_booked_at
                ? formatDistanceToNow(new Date(player.last_booked_at), { addSuffix: true, locale })
                : t('home.never_booked', { defaultValue: 'never' })

              return (
                <div
                  key={player.user_id}
                  className={cn(
                    'flex items-center gap-3 rounded-card px-3 py-2.5',
                    isSuggested ? 'bg-ball/10 ring-1 ring-ball/30' : 'bg-surface',
                  )}
                >
                  <PlayerAvatar name={player.name} avatarUrl={player.avatar_url} size="sm" />
                  <div className="flex-1 min-w-0">
                    <span className="text-[15px] font-semibold text-ink">{player.name}</span>
                    <div className="flex gap-3 text-[12px] text-ink-2">
                      <span className="num">
                        {player.bookings_count} {t('home.bookings', { defaultValue: 'bookings' })}
                      </span>
                      <span>
                        {t('home.last', { defaultValue: 'last:' })} {lastBooked}
                      </span>
                    </div>
                  </div>
                  {isSuggested && (
                    <span className="rounded-pill bg-ball px-2 py-0.5 text-[11px] font-bold text-ink">
                      {t('home.suggested', { defaultValue: 'Suggested' })}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div className="mt-5 flex gap-2">
          <button
            onClick={onClaim}
            className="flex-1 rounded-control bg-ball py-3.5 text-center text-[15px] font-bold text-ink"
          >
            {t('home.ill_do_it', { defaultValue: "I'll do it" })}
          </button>
        </div>
      </div>
    </div>
  )
}
