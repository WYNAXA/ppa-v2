import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { ChevronLeft, MapPin, Calendar, Users } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { useDateLocale } from '@/lib/dateLocale'
import { supabase } from '@/lib/supabase'
import { attachGuestPlayers } from '@/lib/guestPlayers'
import { useAuth } from '@/hooks/useAuth'
import { PlayerAvatar } from '@/components/shared/PlayerAvatar'
import { cn } from '@/lib/utils'
import { goBack } from '@/lib/navigation'

export function OpenMatchesPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { t } = useTranslation()
  const userId = profile?.id ?? ''
  const userElo = (profile as any)?.internal_ranking ?? null
  const locale = useDateLocale()
  const [filterMyElo, setFilterMyElo] = useState(true)

  const { data: matches = [], isLoading, isError } = useQuery({
    queryKey: ['open-matches', filterMyElo, userElo],
    enabled: !!userId,
    queryFn: async () => {
      let q = supabase
        .from('matches')
        .select('id, match_date, match_time, player_ids, booked_venue_name, group_id, open_elo_min, open_elo_max, is_open')
        .eq('is_open', true)
        .gte('match_date', new Date().toISOString().split('T')[0])
        .order('match_date', { ascending: true })
        .order('match_time', { ascending: true })
        .limit(30)

      if (filterMyElo && userElo != null) {
        q = q.lte('open_elo_min', userElo).gte('open_elo_max', userElo)
      }

      const { data } = await q
      if (!data?.length) return []

      // Resolve player profiles
      const allPlayerIds = [...new Set(data.flatMap((m: any) => m.player_ids ?? []))]
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name, avatar_url, internal_ranking')
        .in('id', allPlayerIds)
      const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]))

      // Resolve group names
      const groupIds = [...new Set(data.filter((m: any) => m.group_id).map((m: any) => m.group_id))]
      let groupMap = new Map<string, string>()
      if (groupIds.length > 0) {
        const { data: groups } = await supabase.from('groups').select('id, name').in('id', groupIds)
        groupMap = new Map((groups ?? []).map((g: any) => [g.id, g.name]))
      }

      return attachGuestPlayers(data.map((m: any) => ({
        ...m,
        players: (m.player_ids ?? []).map((id: string) => profileMap.get(id)).filter(Boolean),
        groupName: m.group_id ? groupMap.get(m.group_id) ?? null : null,
      })))
    },
  })

  return (
    <div className="min-h-full bg-card pb-32">
      <div className="px-4 pt-12 pb-4 bg-card border-b border-hairline">
        <div className="flex items-center gap-3">
          <button onClick={() => goBack(navigate, '/play')} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-hairline -ml-1">
            <ChevronLeft className="w-5 h-5 text-ink-2" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-ink">{t('open_matches.page_title')}</h1>
            <p className="text-[12px] text-ink-2">{t('open_matches.page_subtitle')}</p>
          </div>
        </div>
      </div>

      <div className="px-5 pt-4">
        {/* Filter */}
        {userElo != null && (
          <button
            onClick={() => setFilterMyElo(v => !v)}
            className={cn(
              'rounded-full px-3 py-1.5 text-[12px] font-semibold border transition-colors mb-4',
              filterMyElo ? 'bg-court text-white border-court' : 'bg-card text-ink-2 border-hairline'
            )}
          >
            {t('open_matches.filter_match_my_elo')} ({userElo})
          </button>
        )}

        {isError ? (
          <div className="rounded-2xl border border-dashed border-hairline p-6 text-center mt-4">
            <p className="text-[14px] font-semibold text-ink-2">{t('open_matches.load_failed', "Couldn't load open matches")}</p>
            <p className="text-[12px] text-ink-2 mt-1">{t('common.try_again_later')}</p>
          </div>
        ) : isLoading ? (
          <div className="space-y-3">{[0, 1, 2].map(i => <div key={i} className="h-24 rounded-2xl bg-hairline animate-pulse" />)}</div>
        ) : matches.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-hairline p-6 text-center mt-4">
            <p className="text-[14px] font-semibold text-ink-2">{t('open_matches.empty_title')}</p>
            <p className="text-[12px] text-ink-2 mt-1">{t('open_matches.empty_subtitle')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {matches.map((m: any, i: number) => {
              const dateStr = (() => { try { return format(parseISO(m.match_date), 'EEE d MMM', { locale }) } catch { return m.match_date } })()
              const timeStr = m.match_time?.slice(0, 5) ?? ''
              const slots = 4 - (m.player_ids?.length ?? 0)

              return (
                <motion.button
                  key={m.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  onClick={() => navigate(`/matches/${m.id}`)}
                  className="w-full text-left rounded-2xl border border-hairline bg-card px-4 py-3.5 active:scale-[0.98] transition-transform"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Calendar className="h-3.5 w-3.5 text-ink-2" />
                        <p className="text-[13px] font-semibold text-ink">{dateStr}{timeStr && ` \u00B7 ${timeStr}`}</p>
                      </div>
                      {m.booked_venue_name && (
                        <div className="flex items-center gap-1 mb-1">
                          <MapPin className="h-3 w-3 text-ink-2" />
                          <p className="text-[12px] text-ink-2 truncate">{m.booked_venue_name}</p>
                        </div>
                      )}
                      {m.groupName && (
                        <div className="flex items-center gap-1 mb-1">
                          <Users className="h-3 w-3 text-ink-2" />
                          <p className="text-[12px] text-ink-2">{m.groupName}</p>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 mt-2">
                        <div className="flex -space-x-1">
                          {m.players.slice(0, 3).map((p: any) => (
                            <PlayerAvatar key={p.id} name={p.name} avatarUrl={p.avatar_url} size="sm" />
                          ))}
                        </div>
                        <span className="text-[11px] text-ink-2">{t('open_matches.match_players_count', { count: m.player_ids?.length ?? 0 })}</span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className="text-[11px] font-bold text-court-700 bg-court-50 border border-court-100 rounded-full px-2 py-0.5">
                        {slots} open
                      </span>
                      <p className="text-[11px] text-ink-2 mt-1">
                        {t('open_matches.match_elo_range', { min: m.open_elo_min, max: m.open_elo_max })}
                      </p>
                    </div>
                  </div>
                </motion.button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
