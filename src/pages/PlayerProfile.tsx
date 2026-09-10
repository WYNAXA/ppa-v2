import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { ChevronLeft, Trophy, BarChart2, Calendar, UserPlus, Lock } from 'lucide-react'
import { ReportButton } from '@/components/shared/ReportButton'
import { format, parseISO } from 'date-fns'
import { getDateLocale } from '@/lib/dateLocale'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PlayerAvatar } from '@/components/shared/PlayerAvatar'
import { cn } from '@/lib/utils'
import { goBack } from '@/lib/navigation'
import { PEER_VOTE_CATEGORIES } from '@/lib/achievements'
import { fetchSetStats } from '@/lib/setStats'
import { experienceTier } from '@/lib/eloPreview'
import { sendNotification } from '@/lib/notifications'
import { toast } from 'sonner'

// ── Types ────────────────────────────────────────────────────────────────────

interface PlayerProfileData {
  id: string
  name: string
  avatar_url?: string | null
  internal_ranking?: number | null
  playtomic_level?: number | null
  matches_played?: number | null
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
      .select('id, name, avatar_url, internal_ranking, playtomic_level, matches_played, city, can_drive')
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

  // Read driver flag from profiles.can_drive (set in Edit Profile → Travel Preferences)
  const canDrive = !!(player as any)?.can_drive

  return {
    player: player as PlayerProfileData,
    myElo: (myProfile as any)?.internal_ranking ?? 1300,
    h2h,
    commonMatches: commonMatches.slice(0, 10),
    canDrive,
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

  const { data: voteCounts = [] } = useQuery<{ vote_category: string; vote_count: number }[]>({
    queryKey: ['peer-vote-totals', playerId],
    enabled: !!playerId,
    queryFn: async () => {
      const { data: rows, error } = await supabase.rpc('get_verified_peer_vote_counts', { p_user_id: playerId })
      if (error) return []
      return (rows ?? []).map((r: Record<string, unknown>) => ({
        vote_category: r.vote_category as string,
        vote_count: Number(r.vote_count),
      }))
    },
  })

  const { data: entertainerTitleCount = 0 } = useQuery<number>({
    queryKey: ['entertainer-titles', playerId],
    enabled: !!playerId,
    queryFn: async () => {
      const { count } = await supabase
        .from('entertainer_jersey_history')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', playerId!)
      return count ?? 0
    },
  })

  const { data: isPlayerCurrentEntertainer = false } = useQuery<boolean>({
    queryKey: ['current-entertainer', playerId],
    enabled: !!playerId,
    queryFn: async () => {
      const { count } = await supabase
        .from('league_jerseys')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', playerId!)
        .eq('jersey_color', 'blue')
      return (count ?? 0) > 0
    },
  })

  const { data: isConnected = false } = useQuery<boolean>({
    queryKey: ['connection-status', currentUserId, playerId],
    enabled: !!currentUserId && !!playerId && playerId !== currentUserId,
    queryFn: async () => {
      const { count } = await supabase
        .from('player_connections')
        .select('id', { count: 'exact', head: true })
        .or(`and(user_id.eq.${currentUserId},connected_user_id.eq.${playerId}),and(user_id.eq.${playerId},connected_user_id.eq.${currentUserId})`)
        .eq('status', 'accepted')
      return (count ?? 0) > 0
    },
    staleTime: 60_000,
  })

  const { data: playerSetStats } = useQuery({
    queryKey: ['player-set-stats', playerId],
    enabled: !!playerId && isConnected,
    queryFn: () => fetchSetStats(playerId!),
    staleTime: 5 * 60 * 1000,
  })

  const queryClient = useQueryClient()
  const connectMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('player_connections').insert({ user_id: currentUserId, connected_user_id: playerId, status: 'pending' })
      if (error) throw error
      sendNotification({
        user_id: playerId!, type: 'connection_request', title: t('people.notif_connection_request'),
        message: `${profile?.name ?? 'A player'} wants to connect with you.`, related_id: currentUserId,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connection-status', currentUserId, playerId] })
      toast.success(t('people.toast_connection_sent'))
    },
    onError: () => toast.error(t('people.toast_connection_failed')),
  })

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-court border-t-transparent" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
        <p className="text-[14px] text-ink-2">{t('player_profile.not_found')}</p>
        <button onClick={() => goBack(navigate, '/people')} className="text-[13px] text-court font-semibold">{t('common.go_back')}</button>
      </div>
    )
  }

  const { player, myElo, h2h, commonMatches } = data
  const theirElo = player.internal_ranking ?? 1300
  const myWinProb = calcWinProb(myElo, theirElo)
  const theirWinProb = 1 - myWinProb

  return (
    <div className="min-h-full bg-card pb-12">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-14 pb-4">
        <button
          onClick={() => goBack(navigate, '/people')}
          className="h-9 w-9 rounded-full bg-hairline flex items-center justify-center flex-shrink-0"
        >
          <ChevronLeft className="h-5 w-5 text-ink-2" />
        </button>
        <h1 className="text-[18px] font-bold text-ink leading-tight truncate">{player.name}</h1>
      </div>

      {/* Player card */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-5 mb-5 rounded-2xl border border-hairline bg-surface p-5"
      >
        <div className="flex items-center gap-4">
          <PlayerAvatar name={player.name} avatarUrl={player.avatar_url} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="text-[17px] font-bold text-ink truncate">{player.name}</p>
            {player.city && <p className="text-[13px] text-ink-2 mt-0.5">{player.city}</p>}
            <div className="flex items-center gap-2 mt-2">
              {player.internal_ranking != null && (
                <span className="rounded-full bg-court/10 px-2.5 py-1 text-[12px] font-bold text-court">
                  {player.internal_ranking} ELO
                </span>
              )}
              {player.playtomic_level != null && (
                <span className="rounded-full bg-hairline px-2.5 py-1 text-[12px] font-semibold text-ink-2">
                  Level {player.playtomic_level}
                </span>
              )}
              {data?.canDrive && (
                <span className="rounded-full bg-surface px-2.5 py-1 text-[12px] font-semibold text-ink-2" title="Has a car">
                  🚗 Has a car
                </span>
              )}
            </div>
            {player.matches_played != null && (
              <div className="mt-2">
                <p className="text-[12px] text-ink-2">
                  {t(experienceTier(player.matches_played).nameKey)}
                  {' · '}
                  {t('ranking.tier_matches', { count: player.matches_played })}
                </p>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Head-to-head */}
      {h2h.total > 0 && (
        <div className="mx-5 mb-5">
          <div className="flex items-center gap-2 mb-3">
            <Trophy className="h-4 w-4 text-ink-2" />
            <p className="text-[11px] font-bold text-ink-2 uppercase tracking-wide">{t('player_profile.head_to_head')}</p>
          </div>
          <div className="rounded-2xl border border-hairline bg-surface p-4">
            <div className="flex items-center justify-around">
              <div className="text-center">
                <p className="text-[28px] font-black text-court">{h2h.wins}</p>
                <p className="text-[11px] text-ink-2">{t('compete.wins')}</p>
              </div>
              <div className="text-center">
                <p className="text-[28px] font-black text-ink-3">{h2h.draws}</p>
                <p className="text-[11px] text-ink-2">{t('compete.draws')}</p>
              </div>
              <div className="text-center">
                <p className="text-[28px] font-black text-alert">{h2h.losses}</p>
                <p className="text-[11px] text-ink-2">{t('compete.losses')}</p>
              </div>
            </div>
            {/* Win rate bar */}
            {h2h.total > 0 && (
              <div className="mt-3">
                <div className="h-2 rounded-full bg-hairline overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-court to-court"
                    style={{ width: `${Math.round((h2h.wins / h2h.total) * 100)}%` }}
                  />
                </div>
                <p className="text-[11px] text-ink-2 mt-1 text-center">
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
          <BarChart2 className="h-4 w-4 text-ink-2" />
          <p className="text-[11px] font-bold text-ink-2 uppercase tracking-wide">{t('player_profile.if_played_now')}</p>
        </div>
        <div className="rounded-2xl border border-hairline bg-surface p-4">
          <div className="flex items-center gap-3">
            <div className="flex-1 text-center">
              <p className="text-[24px] font-black text-court">{Math.round(myWinProb * 100)}%</p>
              <p className="text-[11px] text-ink-2">{t('player_profile.your_win_chance')}</p>
              <p className="text-[11px] text-ink-2 mt-0.5">{myElo} ELO</p>
            </div>
            <div className="text-center px-1">
              <p className="text-[12px] text-ink-3 font-bold">vs</p>
            </div>
            <div className="flex-1 text-center">
              <p className="text-[24px] font-black text-warn">{Math.round(theirWinProb * 100)}%</p>
              <p className="text-[11px] text-ink-2">{player.name.split(' ')[0]}'s chance</p>
              <p className="text-[11px] text-ink-2 mt-0.5">{theirElo} ELO</p>
            </div>
          </div>
          <div className="mt-3 h-2 rounded-full bg-hairline overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-court to-warn"
              style={{ width: `${Math.round(myWinProb * 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Set stats — connection gated */}
      <div className="mx-5 mb-5">
        <div className="flex items-center gap-2 mb-3">
          <BarChart2 className="h-4 w-4 text-ink-2" />
          <p className="text-[11px] font-bold text-ink-2 uppercase tracking-wide">{t('you.win_rate')}</p>
        </div>
        {isConnected && playerSetStats ? (
          <div className="rounded-2xl border border-hairline bg-surface p-4">
            <div className="flex items-center justify-around">
              <div className="text-center">
                <p className="text-[28px] font-black text-court">{playerSetStats.winRate}%</p>
                <p className="text-[11px] text-ink-2">{t('you.win_rate')}</p>
              </div>
              <div className="text-center">
                <p className="text-[28px] font-black text-ink-2">{playerSetStats.totalSets}</p>
                <p className="text-[11px] text-ink-2">Sets</p>
              </div>
            </div>
            <div className="flex items-center justify-center gap-4 mt-3">
              <span className="text-[12px] text-ink-2">W <span className="font-bold text-ink-2">{playerSetStats.wins}</span></span>
              <span className="text-[12px] text-ink-2">D <span className="font-bold text-ink-2">{playerSetStats.draws}</span></span>
              <span className="text-[12px] text-ink-2">L <span className="font-bold text-ink-2">{playerSetStats.losses}</span></span>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-hairline bg-surface/50 p-5 text-center">
            <Lock className="h-5 w-5 text-ink-3 mx-auto mb-2" />
            <p className="text-[13px] text-ink-2">Connect with {player.name.split(' ')[0]} to see their full stats</p>
            <button
              onClick={() => connectMutation.mutate()}
              disabled={connectMutation.isPending}
              className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-court px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-50"
            >
              <UserPlus className="h-3.5 w-3.5" />
              {connectMutation.isPending ? t('people.sending') : t('people.connect')}
            </button>
          </div>
        )}
      </div>

      {/* Common matches */}
      {commonMatches.length > 0 && (
        <div className="mx-5">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="h-4 w-4 text-ink-2" />
            <p className="text-[11px] font-bold text-ink-2 uppercase tracking-wide">
              {t('player_profile.matches_together', { count: commonMatches.length })}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            {commonMatches.map((m) => {
              const won = (m.currentUserTeam === 1 && m.result_type === 'team1_win') ||
                          (m.currentUserTeam === 2 && m.result_type === 'team2_win')
              const draw = m.result_type === 'draw'
              const scoreStr = m.currentUserTeam === 1
                ? `${m.team1_score}–${m.team2_score}`
                : `${m.team2_score}–${m.team1_score}`
              let dateLabel = m.match_date
              try { dateLabel = format(parseISO(m.match_date), 'EEE d MMM yyyy', { locale: getDateLocale() }) } catch {}

              return (
                <button
                  key={m.id}
                  onClick={() => navigate(`/matches/${m.id}`)}
                  className="w-full flex items-center justify-between rounded-xl border border-hairline px-4 py-3 hover:border-court-100 hover:bg-court-50/20 transition-colors"
                >
                  <div className="text-left">
                    <p className="text-[13px] font-semibold text-ink">{dateLabel}</p>
                    <p className="text-[11px] text-ink-2 mt-0.5 capitalize">{m.match_type ?? 'Match'}</p>
                  </div>
                  <div className="text-right flex items-center gap-2">
                    <span className="text-[14px] font-black text-ink-2">{scoreStr}</span>
                    <span className={cn(
                      'text-[11px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5',
                      draw
                        ? 'bg-hairline text-ink-2'
                        : won
                        ? 'bg-court-50 text-court'
                        : 'bg-alert-50 text-alert'
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
        <div className="mx-5 rounded-2xl bg-surface border border-hairline px-5 py-8 text-center">
          <p className="text-[14px] font-semibold text-ink-2">{t('player_profile.no_matches_together')}</p>
          <p className="text-[12px] text-ink-2 mt-1">{t('player_profile.no_matches_together_sub', { name: player.name.split(' ')[0] })}</p>
        </div>
      )}

      {/* Peer vote totals */}
      {voteCounts.length > 0 && (
        <div className="mx-5 mt-6">
          <h3 className="text-[14px] font-bold text-ink mb-3">Peer votes received</h3>
          <div className="grid grid-cols-3 gap-2">
            {PEER_VOTE_CATEGORIES.map((cat) => {
              const count = voteCounts.find(v => v.vote_category === cat.id)?.vote_count ?? 0
              if (count === 0) return null
              const tier = count >= 40 ? 'gold' : count >= 15 ? 'silver' : count >= 5 ? 'bronze' : null
              const tierColors: Record<string, string> = {
                gold: 'border-warn bg-warn-50',
                silver: 'border-hairline bg-surface',
                bronze: 'border-warn bg-warn-50',
              }
              return (
                <div key={cat.id} className={`rounded-xl border p-2.5 text-center ${tier ? tierColors[tier] : 'border-hairline bg-surface'}`}>
                  <p className="text-[18px] leading-none mb-0.5">{cat.emoji}</p>
                  <p className="text-[16px] font-extrabold text-ink">{count}</p>
                  <p className="text-[11px] font-semibold text-ink-2 leading-tight mt-0.5">{cat.name}</p>
                  {tier && (
                    <p className={`text-[11px] font-bold mt-0.5 uppercase tracking-wide ${
                      tier === 'gold' ? 'text-warn' : tier === 'silver' ? 'text-ink-2' : 'text-warn'
                    }`}>{tier}</p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Entertainer jersey */}
      {(isPlayerCurrentEntertainer || entertainerTitleCount > 0) && (
        <div className="mx-5 mt-6">
          <div className="rounded-xl border border-hairline bg-surface/40 px-3 py-2.5 flex items-center gap-2.5">
            <span className="text-[18px]">🔵</span>
            <div className="flex-1 min-w-0">
              {isPlayerCurrentEntertainer ? (
                <p className="text-[12px] font-bold text-ink-2">Current Entertainer</p>
              ) : (
                <p className="text-[12px] font-semibold text-ink-2">Past Entertainer</p>
              )}
              <p className="text-[11px] text-ink-2">
                {entertainerTitleCount} {entertainerTitleCount === 1 ? 'title' : 'titles'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Report */}
      <div className="mx-5 mt-8 flex justify-center">
        <ReportButton context="user-profile" contextId={player.id} />
      </div>
    </div>
  )
}
