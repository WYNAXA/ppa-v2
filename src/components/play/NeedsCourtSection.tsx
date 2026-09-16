// §3.1 — Home: the thing that needs you
//
// Above everything else on Home, when booking_status <> 'booked' on any future
// match the viewer is in. One card per unbooked future game, nearest deadline first.

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { MapPin } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { useDateLocale } from '@/lib/dateLocale'
import { supabase } from '@/lib/supabase'
import { WhoseTurnSheet } from '@/components/play/WhoseTurnSheet'
import { SelfReportBookingSheet } from '@/components/play/SelfReportBookingSheet'

interface UnbookedMatch {
  id: string
  match_date: string
  match_time: string | null
  booking_status: string
  booking_claimed_by: string | null
  booking_claimed_at: string | null
  player_ids: string[]
  group_id: string | null
  booked_venue_name: string | null
  preferred_venue_name?: string | null
  claimant_name: string | null
  player_count: number
  group_name: string | null
}

function useUnbookedMatches(userId: string) {
  return useQuery<UnbookedMatch[]>({
    queryKey: ['unbooked-matches', userId],
    enabled: !!userId,
    staleTime: 30_000,
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0]

      const { data: rawData, error } = await (supabase
        .from('matches')
        .select('id, match_date, match_time, booking_status, booking_claimed_by, booking_claimed_at, player_ids, group_id, booked_venue_name, preferred_venue_name')
        .contains('player_ids', [userId])
        .gte('match_date', today)
        .neq('booking_status', 'booked')
        .eq('court_requirement', 'needed')
        .not('status', 'in', '("completed","cancelled","open")')
        .order('match_date', { ascending: true })
        .order('match_time', { ascending: true, nullsFirst: false }) as any)

      if (error || !rawData) return []
      const data = rawData as Array<Record<string, unknown>>

      // C3: A 1-player match is a stub, not a real game that needs a court.
      // Minimum 2 players: at that point someone committed to play and a court
      // is a reasonable ask. 1 player is the creator alone — no game to book for.
      const filtered = data.filter(m => ((m.player_ids as string[]) ?? []).length >= 2)

      // Resolve claimant names and group names
      const claimantIds = [...new Set(filtered.filter(m => m.booking_claimed_by).map(m => m.booking_claimed_by as string))]
      const groupIds = [...new Set(filtered.filter(m => m.group_id).map(m => m.group_id as string))]

      const [claimants, groups] = await Promise.all([
        claimantIds.length > 0
          ? supabase.from('profiles').select('id, name').in('id', claimantIds).then(r => r.data ?? [])
          : [],
        groupIds.length > 0
          ? supabase.from('groups').select('id, name').in('id', groupIds).then(r => r.data ?? [])
          : [],
      ])

      const claimantMap = new Map(claimants.map(c => [c.id, c.name]))
      const groupMap = new Map(groups.map(g => [g.id, g.name]))

      return filtered.map(m => ({
        id: m.id as string,
        match_date: m.match_date as string,
        match_time: m.match_time as string | null,
        booking_status: (m.booking_status as string) ?? 'not_booked',
        booking_claimed_by: m.booking_claimed_by as string | null,
        booking_claimed_at: m.booking_claimed_at as string | null,
        player_ids: m.player_ids as string[],
        group_id: m.group_id as string | null,
        booked_venue_name: (m.booked_venue_name ?? m.preferred_venue_name) as string | null,
        claimant_name: m.booking_claimed_by ? (claimantMap.get(m.booking_claimed_by as string) ?? 'Someone') : null,
        player_count: ((m.player_ids as string[]) ?? []).length,
        group_name: m.group_id ? (groupMap.get(m.group_id as string) ?? null) : null,
      }))
    },
  })
}

export function NeedsCourtSection({ userId }: { userId: string }) {
  const { data: matches = [], isLoading } = useUnbookedMatches(userId)
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const locale = useDateLocale()
  const [whoseTurnMatch, setWhoseTurnMatch] = useState<UnbookedMatch | null>(null)
  const [selfReportMatch, setSelfReportMatch] = useState<UnbookedMatch | null>(null)

  if (isLoading || matches.length === 0) return null

  function bookingUrl(match: UnbookedMatch) {
    return `/play/book-court?match_id=${match.id}&date=${match.match_date}`
  }

  async function handleClaim(matchId: string) {
    const match = matches.find(m => m.id === matchId)
    const { data, error } = await supabase.rpc('claim_match_booking', { p_match_id: matchId })
    if (error) {
      console.error('claim_match_booking error:', error)
      return
    }
    const result = data as { success?: boolean; error?: string } | null
    if (result && !result.success && result.error === 'already_claimed') {
      queryClient.invalidateQueries({ queryKey: ['unbooked-matches'] })
      return
    }
    queryClient.invalidateQueries({ queryKey: ['unbooked-matches'] })
    if (match) navigate(bookingUrl(match))
  }

  async function handleTakeOver(matchId: string) {
    const match = matches.find(m => m.id === matchId)
    const { error } = await supabase.rpc('take_over_match_booking', { p_match_id: matchId })
    if (error) {
      console.error('take_over_match_booking error:', error)
      return
    }
    queryClient.invalidateQueries({ queryKey: ['unbooked-matches'] })
    if (match) navigate(bookingUrl(match))
  }

  return (
    <>
      <section className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-2">
            {t('home.needs_court', { defaultValue: 'Needs a court' })}
          </h2>
          <span className="num rounded-pill bg-ball px-[7px] py-0.5 text-[11px] font-bold leading-[14px] text-ink">
            {matches.length}
          </span>
        </div>

        {matches.map((match, i) => {
          const dateLine = (() => {
            try { return format(parseISO(match.match_date), 'EEE d MMM', { locale }) }
            catch { return match.match_date }
          })()
          const timeLine = match.match_time?.slice(0, 5) ?? ''
          const isClaimed = match.booking_status === 'claimed' && match.booking_claimed_by
          const isMyClaimk = match.booking_claimed_by === userId

          return (
            <motion.div
              key={match.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="rounded-[14px] border border-ball/30 bg-ball/[0.06] px-3.5 py-3"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex flex-col gap-px min-w-0">
                  <span className="num text-[15px] font-bold leading-5 text-ink">
                    {dateLine}{timeLine ? ` · ${timeLine}` : ''}
                  </span>
                  <span className="text-[13px] leading-[18px] text-ink-2">
                    {match.player_count} {t('home.players', { defaultValue: 'players' })}
                    {match.group_name ? ` · ${match.group_name}` : ''}
                  </span>
                </div>
                <MapPin className="h-4 w-4 flex-shrink-0 text-ink-3 mt-0.5" strokeWidth={2} />
              </div>

              {isClaimed && !isMyClaimk ? (
                // Someone else claimed it — show who + option to take over or self-report
                <div className="flex flex-col gap-2">
                  <span className="text-[13px] font-medium text-ink-2">
                    {match.claimant_name} {t('home.is_booking', { defaultValue: 'is booking this' })}
                  </span>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => setSelfReportMatch(match)}
                      className="rounded-control border border-hairline bg-card px-3 py-2 text-[12px] font-semibold text-ink-2"
                    >
                      {t('home.already_booked', { defaultValue: 'Already booked' })}
                    </button>
                    <button
                      onClick={() => handleTakeOver(match.id)}
                      className="rounded-control border border-hairline bg-card px-3 py-2 text-[12px] font-semibold text-ink-2"
                    >
                      {t('home.take_over', { defaultValue: 'Take over' })}
                    </button>
                  </div>
                </div>
              ) : isClaimed && isMyClaimk ? (
                // I claimed it — go book, or self-report if already done outside the app
                <div className="flex flex-col gap-2">
                  <span className="text-[13px] font-medium text-ink-2">
                    {t('home.you_claimed', { defaultValue: "You're booking this" })}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => navigate(bookingUrl(match))}
                      className="rounded-control bg-ball px-3.5 py-2.5 text-[13px] font-semibold text-ink"
                    >
                      {t('home.find_court', { defaultValue: 'Find a court' })}
                    </button>
                    <button
                      onClick={() => setSelfReportMatch(match)}
                      className="rounded-control border border-hairline bg-card px-3 py-2.5 text-[12px] font-semibold text-ink-2"
                    >
                      {t('home.already_booked', { defaultValue: 'Already booked' })}
                    </button>
                  </div>
                </div>
              ) : (
                // Unclaimed
                <div className="flex flex-col gap-1.5">
                  <span className="text-[13px] text-ink-3">
                    {t('home.no_one_booked', { defaultValue: 'No one has booked this yet' })}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleClaim(match.id)}
                      className="rounded-control bg-ball px-3.5 py-2.5 text-[13px] font-semibold text-ink"
                    >
                      {t('home.ill_book_it', { defaultValue: "I'll book it" })}
                    </button>
                    <button
                      onClick={() => setSelfReportMatch(match)}
                      className="rounded-control border border-hairline bg-card px-3 py-2.5 text-[12px] font-semibold text-ink-2"
                    >
                      {t('home.already_booked', { defaultValue: 'Already booked' })}
                    </button>
                    {match.group_id && (
                      <button
                        onClick={() => setWhoseTurnMatch(match)}
                        className="rounded-control border border-hairline bg-card px-3 py-2.5 text-[12px] font-semibold text-ink-2"
                      >
                        {t('home.whose_turn', { defaultValue: 'Whose turn?' })}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          )
        })}
      </section>

      {whoseTurnMatch && (
        <WhoseTurnSheet
          matchId={whoseTurnMatch.id}
          open={!!whoseTurnMatch}
          onClose={() => setWhoseTurnMatch(null)}
          onClaim={() => {
            setWhoseTurnMatch(null)
            handleClaim(whoseTurnMatch.id)
          }}
        />
      )}

      {selfReportMatch && (
        <SelfReportBookingSheet
          open={!!selfReportMatch}
          onClose={() => setSelfReportMatch(null)}
          matchId={selfReportMatch.id}
          playerCount={selfReportMatch.player_count}
          onSuccess={() => {
            setSelfReportMatch(null)
            queryClient.invalidateQueries({ queryKey: ['unbooked-matches'] })
            queryClient.invalidateQueries({ queryKey: ['home-next-match'] })
          }}
        />
      )}
    </>
  )
}
