import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { ChevronLeft, Trophy, BarChart2, Calendar } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { getDateLocale } from '@/lib/dateLocale'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PlayerAvatar } from '@/components/shared/PlayerAvatar'
import { cn } from '@/lib/utils'
import { goBack } from '@/lib/navigation'

// ── Types ────────────────────────────────────────────────────────────────────

interface PlayerProfileData {
  id: string
  name: string
  email: string
  avatar_url?: string | null
  internal_ranking?: number | null
  ranking_points?: number | null
  playtomic_level?: number | null
  city?: string | null
}

interface HeadToHead {
  wins: number
  losses: number
  draws: number
  total: number
}

interface CommonMatch {
  id: string
  match_date: string
  match_type: string | null
  team1_score: number
  team2_score: number
  result_type: string
  currentUserTeam: 1 | 2
}

// ── ELO helpers ───────────────────────────────────────────────────────────────

function calcWinProb(eloA: number, eloB: number): number {
  return 1 / (1 + Math.pow(10, (eloB - eloA) / 400))
}

// ── Data fetching ─────────────────────────────────────────────────────────────

async function fetchPlayerProfile(playerId: string, currentUserId: string) {
  const [{ data: player }, { data: myProfile }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, name, email, avatar_url, internal_ranking, ranking_points, playtomic_level, city')
      .eq('id', playerId)
      .single(),
    supabase
      .from('profiles')
      .select('id, internal_ranking')
      .eq('id', currentUserId)
      .single(),
  ])

  if (!player) throw new Error('Player not found')

  // Fetch matches where both players participated
  const { data: matches } = await supabase
    .from('matches')
    .select('id, match_date, match_type, status')
    .contains('player_ids', [currentUserId])
    .contains('player_ids', [playerId])
    .eq('status', 'completed')
    .order('match_date', { ascending: false })
    .limit(30)

  let h2h: HeadToHead = { wins: 0, losses: 0, draws: 0, total: 0 }
  let commonMatches: CommonMatch[] = []

  if (matches && matches.length > 0) {
    const matchIds = matches.map((m) => m.id)
    const { data: results } = await supabase
      .from('match_results')
      .select('match_id, team1_players, team2_players, team1_score, team2_score, result_type')
      .in('match_id', matchIds)

    const resultsMap: Record<string, typeof results extends (infer T)[] | null ? T : never> = {}
    if (results) {
      for (const r of results) resultsMap[r.match_id] = r
    }

    for (const match of matches) {
      const result = resultsMap[match.id]
      if (!result) continue

      const myTeam = result.team1_players?.includes(currentUserId) ? 1 : 2
      const opponentTeam = result.team1_players?.includes(playerId) ? 1 : 2

      // Only count head-to-head when they were on opposite teams
      if (myTeam !== opponentTeam) {
        h2h.total++
        const myTeamWon = (myTeam === 1 && result.result_type === 'team1_win') ||
                          (myTeam === 2 && result.result_type === 'team2_win')
        const draw = result.result_type === 'draw'
        if (draw) h2h.draws++
        else if (myTeamWon) h2h.wins++
        else h2h.losses++
      }

      commonMatches.push({
        id: match.id,
        match_date: match.match_date,
        match_type: match.match_type,
        team1_score: result.team1_score,
        team2_score: result.team2_score,
        result_type: result.result_type,
        currentUserTeam: myTeam,
      })
    }
  }

  return {
    player: player as PlayerProfileData,
    myElo: (myProfile as any)?.internal_ranking ?? 1300,
    h2h,
    commonMatches: commonMatches.slice(0, 10),
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PlayerProfilePage() {
  const { playerId } = useParams<{ playerId: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { t } = useTranslation()
  const currentUserId = profile?.id ?? ''

  const { data, isLoading } = useQuery({
    queryKey: ['player-profile', playerId, currentUserId],
    queryFn: () => fetchPlayerProfile(playerId!, currentUserId),
    enabled: !!playerId && !!currentUserId && playerId !== currentUserId,
    staleTime: 5 * 60 * 1000,
  })

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#009688] border-t-transparent" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
        <p className="text-[14px] text-gray-500">{t('player_profile.not_found')}</p>
        <button onClick={() => goBack(navigate, '/community')} className="text-[13px] text-[#009688] font-semibold">{t('common.go_back')}</button>
      </div>
    )
  }

  const { player, myElo, h2h, commonMatches } = data
  const theirElo = player.internal_ranking ?? 1300
  const myWinProb = calcWinProb(myElo, theirElo)
  const theirWinProb = 1 - myWinProb

  return (
    <div className="min-h-full bg-white pb-12">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-14 pb-4">
        <button
          onClick={() => goBack(navigate, '/community')}
          className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0"
        >
          <ChevronLeft className="h-5 w-5 text-gray-600" />
        </button>
        <h1 className="text-[18px] font-bold text-gray-900 leading-tight truncate">{player.name}</h1>
      </div>

      {/* Player card */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-5 mb-5 rounded-2xl border border-gray-100 bg-gray-50 p-5"
      >
        <div className="flex items-center gap-4">
          <PlayerAvatar name={player.name} avatarUrl={player.avatar_url} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="text-[17px] font-bold text-gray-900 truncate">{player.name}</p>
            {player.city && <p className="text-[13px] text-gray-400 mt-0.5">{player.city}</p>}
            <div className="flex items-center gap-2 mt-2">
              {player.internal_ranking != null && (
                <span className="rounded-full bg-[#009688]/10 px-2.5 py-1 text-[12px] font-bold text-[#009688]">
                  {player.internal_ranking} ELO
                </span>
              )}
              {player.playtomic_level != null && (
                <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[12px] font-semibold text-gray-600">
                  Level {player.playtomic_level}
                </span>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Head-to-head */}
      {h2h.total > 0 && (
        <div className="mx-5 mb-5">
          <div className="flex items-center gap-2 mb-3">
            <Trophy className="h-4 w-4 text-gray-400" />
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">{t('player_profile.head_to_head')}</p>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
            <div className="flex items-center justify-around">
              <div className="text-center">
                <p className="text-[28px] font-black text-teal-600">{h2h.wins}</p>
                <p className="text-[11px] text-gray-400">{t('compete.wins')}</p>
              </div>
              <div className="text-center">
                <p className="text-[28px] font-black text-gray-300">{h2h.draws}</p>
                <p className="text-[11px] text-gray-400">{t('compete.draws')}</p>
              </div>
              <div className="text-center">
                <p className="text-[28px] font-black text-red-400">{h2h.losses}</p>
                <p className="text-[11px] text-gray-400">{t('compete.losses')}</p>
              </div>
            </div>
            {/* Win rate bar */}
            {h2h.total > 0 && (
              <div className="mt-3">
                <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-teal-500 to-teal-400"
                    style={{ width: `${Math.round((h2h.wins / h2h.total) * 100)}%` }}
                  />
                </div>
                <p className="text-[11px] text-gray-400 mt-1 text-center">
                  {Math.round((h2h.wins / h2h.total) * 100)}% win rate in {h2h.total} head-to-head {h2h.total === 1 ? 'match' : 'matches'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ELO prediction */}
      <div className="mx-5 mb-5">
        <div className="flex items-center gap-2 mb-3">
          <BarChart2 className="h-4 w-4 text-gray-400" />
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">{t('player_profile.if_played_now')}</p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
          <div className="flex items-center gap-3">
            <div className="flex-1 text-center">
              <p className="text-[24px] font-black text-teal-600">{Math.round(myWinProb * 100)}%</p>
              <p className="text-[11px] text-gray-500">{t('player_profile.your_win_chance')}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{myElo} ELO</p>
            </div>
            <div className="text-center px-1">
              <p className="text-[12px] text-gray-300 font-bold">vs</p>
            </div>
            <div className="flex-1 text-center">
              <p className="text-[24px] font-black text-orange-500">{Math.round(theirWinProb * 100)}%</p>
              <p className="text-[11px] text-gray-500">{player.name.split(' ')[0]}'s chance</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{theirElo} ELO</p>
            </div>
          </div>
          <div className="mt-3 h-2 rounded-full bg-gray-200 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-teal-500 to-orange-400"
              style={{ width: `${Math.round(myWinProb * 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Common matches */}
      {commonMatches.length > 0 && (
        <div className="mx-5">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="h-4 w-4 text-gray-400" />
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">
              {t('player_profile.matches_together', { count: commonMatches.length })}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            {commonMatches.map((m) => {
              const won = (m.currentUserTeam === 1 && m.result_type === 'team1_win') ||
                          (m.currentUserTeam === 2 && m.result_type === 'team2_win')
              const draw = m.result_type === 'draw'
              const scoreStr = `${m.team1_score}–${m.team2_score}`
              let dateLabel = m.match_date
              try { dateLabel = format(parseISO(m.match_date), 'EEE d MMM yyyy', { locale: getDateLocale() }) } catch {}

              return (
                <button
                  key={m.id}
                  onClick={() => navigate(`/matches/${m.id}`)}
                  className="w-full flex items-center justify-between rounded-xl border border-gray-100 px-4 py-3 hover:border-teal-200 hover:bg-teal-50/20 transition-colors"
                >
                  <div className="text-left">
                    <p className="text-[13px] font-semibold text-gray-800">{dateLabel}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5 capitalize">{m.match_type ?? 'Match'}</p>
                  </div>
                  <div className="text-right flex items-center gap-2">
                    <span className="text-[14px] font-black text-gray-700">{scoreStr}</span>
                    <span className={cn(
                      'text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5',
                      draw
                        ? 'bg-gray-100 text-gray-500'
                        : won
                        ? 'bg-teal-50 text-teal-600'
                        : 'bg-red-50 text-red-500'
                    )}>
                      {draw ? 'Draw' : won ? 'W' : 'L'}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {h2h.total === 0 && commonMatches.length === 0 && (
        <div className="mx-5 rounded-2xl bg-gray-50 border border-gray-100 px-5 py-8 text-center">
          <p className="text-[14px] font-semibold text-gray-500">{t('player_profile.no_matches_together')}</p>
          <p className="text-[12px] text-gray-400 mt-1">{t('player_profile.no_matches_together_sub', { name: player.name.split(' ')[0] })}</p>
        </div>
      )}
    </div>
  )
}
