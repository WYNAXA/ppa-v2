// §3.5 — "Did you get the court?"
//
// Shown when the viewer is booking_claimed_by on a match that has
// booking_status='claimed' and a handoff exists (booking_handoff_venue_id).
// Persisted in the DB — survives app kill and device switch.

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { format, parseISO } from 'date-fns'
import { useDateLocale } from '@/lib/dateLocale'
import { supabase } from '@/lib/supabase'
import { SelfReportBookingSheet } from '@/components/play/SelfReportBookingSheet'

interface HandoffMatch {
  id: string
  match_date: string
  match_time: string | null
  player_ids: string[]
  booking_handoff_venue_id: string
  booking_handoff_ask_count: number
  venue_name: string | null
}

function useHandoffMatches(userId: string) {
  return useQuery<HandoffMatch[]>({
    queryKey: ['handoff-matches', userId],
    enabled: !!userId,
    staleTime: 30_000,
    queryFn: async () => {
      // booking_handoff_* columns are new, not yet in generated types
      const { data } = await supabase
        .from('matches')
        .select('id, match_date, match_time, player_ids, booking_handoff_venue_id, booking_handoff_ask_count')
        .eq('booking_claimed_by', userId)
        .eq('booking_status', 'claimed')
        .not('booking_handoff_venue_id', 'is', null)
        .lt('booking_handoff_ask_count', 3) // F4: cap at 3 asks
        .gte('match_date', new Date().toISOString().split('T')[0])

      if (!data || data.length === 0) return []

      const rows = data as Array<Record<string, unknown>>
      const venueIds = [...new Set(rows.map(m => m.booking_handoff_venue_id as string))]
      const { data: venues } = await supabase
        .from('padel_venues')
        .select('venue_id, venue_name')
        .in('venue_id', venueIds)
      const venueMap = new Map((venues ?? []).map(v => [v.venue_id, v.venue_name]))

      return rows.map(m => ({
        id: m.id as string,
        match_date: m.match_date as string,
        match_time: m.match_time as string | null,
        player_ids: m.player_ids as string[],
        booking_handoff_venue_id: m.booking_handoff_venue_id as string,
        booking_handoff_ask_count: (m.booking_handoff_ask_count as number) ?? 0,
        venue_name: venueMap.get(m.booking_handoff_venue_id as string) ?? null,
      }))
    },
  })
}

export function DidYouBookPrompt({ userId }: { userId: string }) {
  const { data: handoffs = [] } = useHandoffMatches(userId)
  const { t } = useTranslation()
  const locale = useDateLocale()
  const queryClient = useQueryClient()
  const [selfReportMatch, setSelfReportMatch] = useState<HandoffMatch | null>(null)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  const visible = handoffs.filter(h => !dismissed.has(h.id))
  if (visible.length === 0 && !selfReportMatch) return null

  async function handleNotYet(matchId: string) {
    // F4: "Not yet" — claim stays alive, group is told nothing.
    // Increment ask_count in the DB (survives device switch). Capped at 3:
    // the query filters booking_handoff_ask_count < 3, so after 3 dismissals
    // the prompt stops. Why 3: one "not yet" is normal (still on the phone),
    // two is busy, three means they aren't going to answer and a human should
    // check. The handoff row stays for manual inspection.
    setDismissed(prev => new Set(prev).add(matchId))
    await supabase
      .from('matches')
      .update({ booking_handoff_ask_count: (handoffs.find(h => h.id === matchId)?.booking_handoff_ask_count ?? 0) + 1 })
      .eq('id', matchId)
  }

  return (
    <>
      {visible.map(match => {
        const dateLine = (() => {
          try { return format(parseISO(match.match_date), 'EEE d MMM', { locale }) }
          catch { return match.match_date }
        })()
        const timeLine = match.match_time?.slice(0, 5) ?? ''

        return (
          <div
            key={match.id}
            className="rounded-[14px] border border-court/30 bg-court/[0.06] px-3.5 py-3"
          >
            <p className="text-[15px] font-bold text-ink mb-1">
              {t('home.did_you_book', { defaultValue: 'Did you get the court?' })}
            </p>
            <p className="text-[13px] text-ink-2 mb-3">
              {match.venue_name ?? t('home.the_venue', { defaultValue: 'The venue' })}
              {' · '}
              {dateLine}{timeLine ? ` · ${timeLine}` : ''}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setSelfReportMatch(match)}
                className="rounded-control bg-court px-3.5 py-2.5 text-[13px] font-semibold text-white"
              >
                {t('home.yes_booked', { defaultValue: 'Yes, booked' })}
              </button>
              <button
                onClick={() => handleNotYet(match.id)}
                className="rounded-control border border-hairline bg-card px-3.5 py-2.5 text-[13px] font-semibold text-ink-2"
              >
                {t('home.not_yet', { defaultValue: 'Not yet' })}
              </button>
            </div>
          </div>
        )
      })}

      {selfReportMatch && (
        <SelfReportBookingSheet
          open={!!selfReportMatch}
          onClose={() => setSelfReportMatch(null)}
          matchId={selfReportMatch.id}
          playerCount={(selfReportMatch.player_ids as string[]).length}
          prefillVenueId={selfReportMatch.booking_handoff_venue_id}
          prefillVenueName={selfReportMatch.venue_name ?? undefined}
          onSuccess={() => {
            setSelfReportMatch(null)
            queryClient.invalidateQueries({ queryKey: ['handoff-matches'] })
            queryClient.invalidateQueries({ queryKey: ['unbooked-matches'] })
            queryClient.invalidateQueries({ queryKey: ['home-next-match'] })
          }}
        />
      )}
    </>
  )
}
