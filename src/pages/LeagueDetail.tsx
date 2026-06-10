import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, Zap, Share2, Plus, X, AlertTriangle } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { useDateLocale } from '@/lib/dateLocale'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PlayerAvatar } from '@/components/shared/PlayerAvatar'
import { PairAvatar } from '@/components/shared/PairAvatar'
import { PairAssignmentSheet } from '@/components/compete/PairAssignmentSheet'
import { cn } from '@/lib/utils'
import { goBack } from '@/lib/navigation'
import { generateRoundRobinRound } from '@/lib/roundRobin'
import { validateSetScores } from '@/lib/scoreValidation'

// ── Types ─────────────────────────────────────────────────────────────────────

interface LeagueInfo {
  id: string
  name: string
  status: string
  match_type: string | null
  format: string | null
  scoring_format: string | null
  visibility: string | null
  season_start: string | null
  season_end: string | null
  max_participants: number | null
  min_elo: number | null
  max_elo: number | null
  linked_group_ids: string[] | null
  created_by: string | null
  city: string | null
  prizes: string | null
  max_rounds: number | null
  min_sets_per_fixture: number | null
}

interface Standing {
  id: string
  user_id: string
  rank: number
  played: number
  won: number
  lost: number
  drawn: number
  points: number
  game_difference: number
  season_elo?: number
  profile?: { name: string; avatar_url: string | null }
}

interface FixtureMatch {
  id: string
  match_date: string
  match_time: string | null
  status: string
  booked_venue_name: string | null
  player_ids: string[]
  players?: Array<{ id: string; name: string; avatar_url: string | null }>
}

interface ResultMatch {
  id: string
  match_date: string
  result: {
    team1_players: string[]
    team2_players: string[]
    team1_score: number
    team2_score: number
    result_type: string
    verification_status: string
  } | null
  profiles: Record<string, { name: string; avatar_url: string | null }>
}

interface TeamStanding {
  team_id: string
  team_name: string | null
  player1_id: string
  player2_id: string
  player1?: { name: string; avatar_url: string | null }
  player2?: { name: string; avatar_url: string | null }
  rank: number
  played: number
  won: number
  lost: number
  drawn: number
  points: number
  game_difference: number
}

type Tab = 'standings' | 'fixtures' | 'results' | 'mexicano' | 'admin'

// ── Data hooks ────────────────────────────────────────────────────────────────

function useLeague(id: string) {
  return useQuery({
    queryKey: ['league', id],
    enabled: !!id,
    queryFn: async (): Promise<LeagueInfo | null> => {
      const { data, error } = await supabase
        .from('leagues')
        .select('id, name, status, match_type, format, scoring_format, visibility, season_start, season_end, max_participants, min_elo, max_elo, linked_group_ids, created_by, city, prizes, max_rounds, min_sets_per_fixture')
        .eq('id', id)
        .single()
      if (error) throw error
      return data
    },
  })
}

function useStandings(leagueId: string) {
  return useQuery({
    queryKey: ['league-standings', leagueId],
    enabled: !!leagueId,
    queryFn: async (): Promise<Standing[]> => {
      // Select defensively — rank/won/lost/drawn may not exist
      // Fetch match IDs for this league first, then results
      const [{ data: rows, error }, { data: leagueMatches }] = await Promise.all([
        supabase.from('league_standings').select('*').eq('league_id', leagueId),
        supabase.from('matches').select('id').eq('league_id', leagueId).eq('status', 'completed'),
      ])
      const matchIds = (leagueMatches ?? []).map((m: any) => m.id)
      const { data: results } = matchIds.length > 0
        ? await supabase.from('match_results').select('team1_players, team2_players, sets_data')
            .in('match_id', matchIds).not('sets_data', 'is', null)
        : { data: [] }

      if (error) { console.error('[League] standings error:', error); return [] }
      if (!rows || rows.length === 0) return []

      const userIds = rows.map((r) => r.user_id)
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name, avatar_url')
        .in('id', userIds)

      const profileMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]))

      // Compute game difference per player from match_results.sets_data
      const gdMap: Record<string, { won: number; lost: number }> = {}
      for (const r of results ?? []) {
        const t1Players = (r.team1_players ?? []) as string[]
        const t2Players = (r.team2_players ?? []) as string[]
        const setsData = (r.sets_data ?? []) as Array<{ team1: number; team2: number }>
        let t1Games = 0, t2Games = 0
        for (const s of setsData) { t1Games += s.team1 ?? 0; t2Games += s.team2 ?? 0 }
        for (const pid of t1Players) {
          if (!gdMap[pid]) gdMap[pid] = { won: 0, lost: 0 }
          gdMap[pid].won += t1Games; gdMap[pid].lost += t2Games
        }
        for (const pid of t2Players) {
          if (!gdMap[pid]) gdMap[pid] = { won: 0, lost: 0 }
          gdMap[pid].won += t2Games; gdMap[pid].lost += t1Games
        }
      }

      // Sort by ranking_points desc, then game_difference desc
      const sorted = [...rows].sort((a, b) => {
        const ptsDiff = ((b.ranking_points ?? b.points ?? 0) as number) - ((a.ranking_points ?? a.points ?? 0) as number)
        if (ptsDiff !== 0) return ptsDiff
        const aGd = (gdMap[a.user_id]?.won ?? 0) - (gdMap[a.user_id]?.lost ?? 0)
        const bGd = (gdMap[b.user_id]?.won ?? 0) - (gdMap[b.user_id]?.lost ?? 0)
        return bGd - aGd
      })

      return sorted.map((r, i) => {
        const gd = gdMap[r.user_id]
        return {
          id:      r.id,
          user_id: r.user_id,
          rank:    i + 1,
          played:  (r.matches_played ?? r.played ?? 0) as number,
          won:     (r.wins ?? r.won ?? 0) as number,
          lost:    (r.losses ?? r.lost ?? 0) as number,
          drawn:   (r.draws ?? r.drawn ?? 0) as number,
          points:  (r.ranking_points ?? r.points ?? 0) as number,
          game_difference: gd ? gd.won - gd.lost : 0,
          season_elo: r.season_elo as number | undefined,
          profile: profileMap[r.user_id],
        }
      })
    },
  })
}

function useTeamStandings(leagueId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['league-team-standings', leagueId],
    enabled: !!leagueId && enabled,
    queryFn: async (): Promise<TeamStanding[]> => {
      const { data: rows, error } = await supabase
        .from('league_team_standings')
        .select('*')
        .eq('league_id', leagueId)

      if (error) { console.error('[League] team standings error:', error); return [] }
      if (!rows || rows.length === 0) return []

      const playerIds = rows.flatMap((r: any) => [r.player1_id, r.player2_id])
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name, avatar_url')
        .in('id', playerIds)

      const profileMap = Object.fromEntries((profiles ?? []).map((p: any) => [p.id, p]))

      const sorted = [...rows].sort((a: any, b: any) => {
        const ptsDiff = ((b.ranking_points ?? 0) as number) - ((a.ranking_points ?? 0) as number)
        if (ptsDiff !== 0) return ptsDiff
        return ((b.game_difference ?? 0) as number) - ((a.game_difference ?? 0) as number)
      })

      return sorted.map((r: any, i: number) => ({
        team_id: r.team_id,
        team_name: r.team_name,
        player1_id: r.player1_id,
        player2_id: r.player2_id,
        player1: profileMap[r.player1_id],
        player2: profileMap[r.player2_id],
        rank: i + 1,
        played: (r.matches_played ?? 0) as number,
        won: (r.wins ?? 0) as number,
        lost: (r.losses ?? 0) as number,
        drawn: (r.draws ?? 0) as number,
        points: (r.ranking_points ?? 0) as number,
        game_difference: (r.game_difference ?? 0) as number,
      }))
    },
  })
}

function useLeagueMembers(leagueId: string) {
  return useQuery({
    queryKey: ['league-members-profiles', leagueId],
    enabled: !!leagueId,
    queryFn: async () => {
      const { data: members } = await supabase
        .from('league_members')
        .select('user_id')
        .eq('league_id', leagueId)
        .eq('status', 'active')
      if (!members || members.length === 0) return []
      const ids = members.map((m: any) => m.user_id)
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name, avatar_url, internal_ranking')
        .in('id', ids)
      return (profiles ?? []).map((p: any) => ({
        id: p.id,
        name: p.name ?? 'Unknown',
        avatar_url: p.avatar_url,
        internal_ranking: (p.internal_ranking as number) ?? 1230,
      }))
    },
  })
}

function useCurrentRound(leagueId: string) {
  return useQuery({
    queryKey: ['league-current-round', leagueId],
    enabled: !!leagueId,
    queryFn: async (): Promise<number> => {
      const { data } = await supabase
        .from('matches')
        .select('round_number')
        .eq('league_id', leagueId)
        .not('round_number', 'is', null)
        .order('round_number', { ascending: false })
        .limit(1)
      return data?.[0]?.round_number != null ? (data[0].round_number as number) + 1 : 0
    },
  })
}

function useLeagueTeams(leagueId: string) {
  return useQuery({
    queryKey: ['league-teams', leagueId],
    enabled: !!leagueId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('league_teams')
        .select('*')
        .eq('league_id', leagueId)
      if (error) return []
      return data ?? []
    },
  })
}

interface JerseyEntry {
  user_id: string
  jersey_type: string
}

const JERSEY_EMOJI: Record<string, string> = {
  yellow: '\u{1F7E1}',
  green:  '\u{1F7E2}',
  red:    '\u{1F534}',
  blue:   '\u{1F535}',
  black:  '\u26AB',
}
const JERSEY_LABEL: Record<string, string> = {
  yellow: 'Leader',
  green:  'Most Improved',
  red:    'Most Competitive',
  blue:   'Most Active',
  black:  'Veteran',
}

function useLeagueJerseys(leagueId: string) {
  return useQuery<JerseyEntry[]>({
    queryKey: ['league-jerseys', leagueId],
    enabled: !!leagueId,
    queryFn: async () => {
      const { data } = await supabase
        .from('league_jerseys')
        .select('user_id, jersey_type')
        .eq('league_id', leagueId)
      return data ?? []
    },
    staleTime: 60_000,
  })
}

function useEntertainerRace(leagueId: string) {
  return useQuery<{ user_id: string; vote_count: number }[]>({
    queryKey: ['entertainer-race', leagueId],
    enabled: !!leagueId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_weekly_league_vote_standings', {
        p_league_id: leagueId,
        p_week_start: null,
      })
      if (error) return []
      return (data ?? []).map((r: Record<string, unknown>) => ({
        user_id: r.user_id as string,
        vote_count: Number(r.vote_count),
      }))
    },
    staleTime: 30_000,
  })
}

function useEntertainerHistory(leagueId: string) {
  return useQuery<{ user_id: string; week_start: string; vote_count: number }[]>({
    queryKey: ['entertainer-history', leagueId],
    enabled: !!leagueId,
    queryFn: async () => {
      const { data } = await supabase
        .from('entertainer_jersey_history')
        .select('user_id, week_start, vote_count')
        .eq('league_id', leagueId)
        .order('week_start', { ascending: false })
        .limit(8)
      return (data ?? []).map((r: Record<string, unknown>) => ({
        user_id: r.user_id as string,
        week_start: r.week_start as string,
        vote_count: Number(r.vote_count),
      }))
    },
    staleTime: 60_000,
  })
}

function useFixtures(leagueId: string, _groupIds: string[]) {
  return useQuery({
    queryKey: ['league-fixtures', leagueId],
    enabled: !!leagueId,
    queryFn: async (): Promise<FixtureMatch[]> => {
      let matches: FixtureMatch[] | null = null

      // Try league_id column first
      const { data: byLeague } = await supabase
        .from('matches')
        .select('id, match_date, match_time, status, booked_venue_name, player_ids')
        .eq('league_id', leagueId)
        .not('status', 'in', '("completed","cancelled")')
        .order('match_date', { ascending: true })
        .limit(20)

      if (byLeague && byLeague.length > 0) {
        matches = byLeague
      }

      if (!matches || matches.length === 0) return []

      const allIds = [...new Set(matches.flatMap((m) => m.player_ids ?? []))]
      const { data: profiles } = allIds.length > 0
        ? await supabase.from('profiles').select('id, name, avatar_url').in('id', allIds)
        : { data: [] }

      return matches.map((m) => ({
        ...m,
        players: (profiles ?? []).filter((p) => (m.player_ids ?? []).includes(p.id)),
      }))
    },
  })
}

function useResults(leagueId: string, groupIds: string[]) {
  return useQuery({
    queryKey: ['league-results', leagueId],
    enabled: !!leagueId,
    queryFn: async (): Promise<ResultMatch[]> => {
      let matchData: Array<{ id: string; match_date: string; player_ids: string[] }> | null = null

      const { data: byLeague } = await supabase
        .from('matches')
        .select('id, match_date, player_ids')
        .eq('league_id', leagueId)
        .eq('status', 'completed')
        .order('match_date', { ascending: false })
        .limit(20)

      if (byLeague && byLeague.length > 0) {
        matchData = byLeague
      } else if (groupIds.length > 0) {
        const { data: byGroup } = await supabase
          .from('matches')
          .select('id, match_date, player_ids')
          .in('group_id', groupIds)
          .eq('status', 'completed')
          .order('match_date', { ascending: false })
          .limit(20)
        matchData = byGroup
      }

      if (!matchData || matchData.length === 0) return []

      const matchIds = matchData.map((m) => m.id)
      const [{ data: resultRows }, { data: profiles }] = await Promise.all([
        supabase
          .from('match_results')
          .select('id, match_id, team1_players, team2_players, team1_score, team2_score, result_type, verification_status')
          .in('match_id', matchIds),
        supabase
          .from('profiles')
          .select('id, name, avatar_url')
          .in('id', [...new Set(matchData.flatMap((m) => m.player_ids ?? []))]),
      ])

      const resultMap = Object.fromEntries((resultRows ?? []).map((r) => [r.match_id, r]))
      const profileMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]))

      return matchData.map((m) => ({
        id:         m.id,
        match_date: m.match_date,
        result:     resultMap[m.id] ?? null,
        profiles:   profileMap,
      }))
    },
  })
}

// ── Mexicano tab ──────────────────────────────────────────────────────────────

function MexicanoTab({
  standings,
  leagueId,
  isAdmin,
}: {
  standings: Standing[]
  leagueId: string
  isAdmin: boolean
}) {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const sorted      = [...standings].sort((a, b) => b.points - a.points)

  // Pair top 2 vs next 2, etc.
  const rounds: Array<{ pair1: Standing[]; pair2: Standing[] }> = []
  for (let i = 0; i + 3 < sorted.length; i += 4) {
    rounds.push({
      pair1: [sorted[i], sorted[i + 1]],
      pair2: [sorted[i + 2], sorted[i + 3]],
    })
  }

  const generateMutation = useMutation({
    mutationFn: async () => {
      const today = new Date().toISOString().split('T')[0]
      const insertions = rounds.map((r) => ({
        match_date:  today,
        match_type:  'competitive',
        status:      'scheduled',
        player_ids:  [...r.pair1.map((p) => p.user_id), ...r.pair2.map((p) => p.user_id)],
        league_id:   leagueId,
        notes:       'Mexicano round — auto-generated',
        created_by:  profile?.id,
      }))
      const { error } = await supabase.from('matches').insert(insertions)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['league-fixtures', leagueId] })
    },
  })

  if (standings.length < 4) {
    return <EmptyTab message="Need at least 4 players to generate Mexicano pairings" />
  }

  return (
    <div>
      <div className="rounded-2xl border border-teal-100 bg-teal-50 p-4 mb-4">
        <div className="flex items-center gap-2 mb-1">
          <Zap className="h-4 w-4 text-teal-600" />
          <p className="text-[13px] font-bold text-teal-800">Next Round Pairings</p>
        </div>
        <p className="text-[12px] text-teal-600">Based on current standings — top players face each other</p>
      </div>

      <div className="space-y-3 mb-5">
        {rounds.map((round, i) => (
          <div key={i} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Court {i + 1}</p>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                {round.pair1.map((p) => (
                  <div key={p.user_id} className="flex items-center gap-1.5 mb-1">
                    <PlayerAvatar name={p.profile?.name} avatarUrl={p.profile?.avatar_url} size="sm" />
                    <span className="text-[12px] font-semibold text-gray-800 truncate">{p.profile?.name ?? 'Unknown'}</span>
                    <span className="text-[10px] text-gray-400">{p.points}pts</span>
                  </div>
                ))}
              </div>
              <span className="text-[11px] font-bold text-gray-400">vs</span>
              <div className="flex-1">
                {round.pair2.map((p) => (
                  <div key={p.user_id} className="flex items-center gap-1.5 mb-1">
                    <PlayerAvatar name={p.profile?.name} avatarUrl={p.profile?.avatar_url} size="sm" />
                    <span className="text-[12px] font-semibold text-gray-800 truncate">{p.profile?.name ?? 'Unknown'}</span>
                    <span className="text-[10px] text-gray-400">{p.points}pts</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {isAdmin && (
        <button
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
          className="w-full rounded-2xl bg-[#009688] py-3.5 text-[14px] font-bold text-white disabled:opacity-50"
        >
          {generateMutation.isPending ? 'Generating…' : 'Generate Next Round Matches'}
        </button>
      )}
      {generateMutation.isError && (
        <p className="mt-2 text-[12px] text-red-500 text-center">Failed to generate matches. Try again.</p>
      )}
      {generateMutation.isSuccess && (
        <p className="mt-2 text-[12px] text-green-600 text-center font-semibold">Matches created!</p>
      )}
    </div>
  )
}

// ── Invite from group ─────────────────────────────────────────────────────────

function InviteFromGroupSection({ league, standings }: { league: LeagueInfo; standings: Standing[] }) {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [invitedIds, setInvitedIds] = useState<string[]>([])
  const groupId = league.linked_group_ids?.[0]

  const { data: groupMembers = [] } = useQuery({
    queryKey: ['league-group-members', groupId],
    enabled: !!groupId,
    queryFn: async () => {
      const { data } = await supabase
        .from('group_members')
        .select('user_id')
        .eq('group_id', groupId!)
        .eq('status', 'approved')
      if (!data || data.length === 0) return []
      const ids = data.map(m => m.user_id)
      const { data: profiles } = await supabase
        .from('profiles').select('id, name, avatar_url, internal_ranking').in('id', ids)
      return profiles ?? []
    },
  })

  const leagueMemberIds = new Set(standings.map(s => s.user_id))
  const notInLeague = groupMembers.filter(p => !leagueMemberIds.has(p.id) && p.id !== profile?.id)

  async function handleInvite(userId: string) {
    const { error } = await supabase.from('league_invitations').insert({
      league_id: league.id, invited_user_id: userId, invited_by: profile?.id, status: 'pending',
    })
    if (error) { console.error('[LeagueInvite]', error); return }
    await supabase.from('notifications').insert({
      user_id: userId, type: 'league_invite', title: 'League invitation',
      message: `${profile?.name ?? 'Someone'} invited you to join ${league.name}`,
      related_id: league.id, read: false,
    })
    setInvitedIds(prev => [...prev, userId])
    queryClient.invalidateQueries({ queryKey: ['league-invite'] })
  }

  async function handleShare() {
    const url = `${window.location.origin}/leagues/${league.id}/join`
    if (navigator.share) {
      try { await navigator.share({ title: league.name, text: `Join ${league.name} on Padel Players`, url }) } catch { /* cancelled */ }
    } else {
      await navigator.clipboard.writeText(url)
    }
  }

  if (!groupId) return null

  return (
    <div className="rounded-2xl border border-gray-100 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-bold text-gray-400 uppercase tracking-wide">Invite Players</p>
        <span className="text-[11px] text-gray-400">{standings.length} members</span>
      </div>

      <button onClick={handleShare} className="w-full rounded-xl border border-teal-200 bg-teal-50 py-2.5 text-[13px] font-semibold text-teal-700 mb-2">
        Share league link
      </button>

      {notInLeague.length > 0 && (
        <>
          <p className="text-[11px] text-gray-500">{notInLeague.length} group members not yet in league:</p>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {notInLeague.map(p => (
              <div key={p.id} className="flex items-center gap-2.5 rounded-xl bg-gray-50 px-3 py-2">
                <PlayerAvatar name={p.name} avatarUrl={p.avatar_url} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold text-gray-800 truncate">{p.name}</p>
                  {p.internal_ranking != null && <p className="text-[10px] text-gray-400">{(p.internal_ranking as number).toLocaleString()} ELO</p>}
                </div>
                <button
                  onClick={() => handleInvite(p.id)}
                  disabled={invitedIds.includes(p.id)}
                  className={cn(
                    'rounded-lg px-3 py-1 text-[11px] font-bold flex-shrink-0',
                    invitedIds.includes(p.id) ? 'bg-gray-100 text-gray-400' : 'bg-[#009688] text-white'
                  )}
                >
                  {invitedIds.includes(p.id) ? 'Invited ✓' : 'Invite'}
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {notInLeague.length === 0 && groupId && (
        <p className="text-[12px] text-gray-400 text-center py-2">All group members are in this league</p>
      )}
    </div>
  )
}

// ── Admin tab ─────────────────────────────────────────────────────────────────

function AdminTab({ league, standings, onNavigate, onResetPairs, hasTeams, hasMatches }: { league: LeagueInfo; standings: Standing[]; onNavigate: (path: string) => void; onResetPairs?: () => void; hasTeams?: boolean; hasMatches?: boolean }) {
  const queryClient = useQueryClient()
  const [selectedUserId, setSelectedUserId] = useState('')
  const [pointsDelta, setPointsDelta] = useState('')
  const [reason, setReason] = useState('')
  const [adjusting, setAdjusting] = useState(false)
  const [adjustSaved, setAdjustSaved] = useState(false)

  const [jerseyUserId, setJerseyUserId] = useState('')
  const [jerseyNumber, setJerseyNumber] = useState('')
  const [savingJersey, setSavingJersey] = useState(false)

  const [newEndDate, setNewEndDate] = useState(league.season_end ?? '')
  const [savingDate, setSavingDate] = useState(false)
  const [dateSaved, setDateSaved] = useState(false)

  const [minSets, setMinSets] = useState(league.min_sets_per_fixture ?? 2)
  const [savingMinSets, setSavingMinSets] = useState(false)
  const [minSetsSaved, setMinSetsSaved] = useState(false)

  const [editingName, setEditingName] = useState(false)
  const [newName, setNewName] = useState(league.name)
  const [savingName, setSavingName] = useState(false)

  async function saveAdjustment() {
    if (!selectedUserId || !pointsDelta) return
    setAdjusting(true)
    const delta = parseInt(pointsDelta, 10)
    const { data: { user } } = await supabase.auth.getUser()
    await Promise.all([
      supabase.from('league_adjustments').insert({
        league_id: league.id, user_id: selectedUserId,
        points_delta: delta, reason: reason.trim() || null, created_by: user?.id,
      }),
      supabase.from('league_standings')
        .update({ ranking_points: (standings.find(s => s.user_id === selectedUserId)?.points ?? 0) + delta })
        .eq('league_id', league.id).eq('user_id', selectedUserId),
    ])
    await queryClient.invalidateQueries({ queryKey: ['league-standings', league.id] })
    setAdjusting(false)
    setAdjustSaved(true)
    setSelectedUserId('')
    setPointsDelta('')
    setReason('')
    setTimeout(() => setAdjustSaved(false), 2000)
  }

  const JERSEY_COLOURS = [
    { id: 'yellow', emoji: '\u{1F7E1}', label: 'Leader', desc: 'Currently leading the league' },
    { id: 'green', emoji: '\u{1F7E2}', label: 'Most Improved', desc: 'Most improved this season' },
    { id: 'red', emoji: '\u{1F534}', label: 'Most Competitive', desc: 'Most competitive player' },
    { id: 'blue', emoji: '\u{1F535}', label: 'Most Active', desc: 'Most matches played' },
    { id: 'black', emoji: '\u26AB', label: 'Veteran', desc: 'Most experienced player' },
  ]

  async function saveJersey() {
    if (!jerseyUserId || !jerseyNumber) return
    setSavingJersey(true)

    // Find who currently holds this jersey type so we can set previous_holder
    const { data: existing } = await supabase
      .from('league_jerseys')
      .select('user_id')
      .eq('league_id', league.id)
      .eq('jersey_type', jerseyNumber)
      .maybeSingle()
    const previousHolder = existing?.user_id && existing.user_id !== jerseyUserId ? existing.user_id : null

    const { error } = await supabase.from('league_jerseys').upsert(
      {
        league_id: league.id,
        user_id: jerseyUserId,
        jersey_type: jerseyNumber,
        awarded_week: new Date().toISOString().split('T')[0],
        previous_holder: previousHolder,
      },
      { onConflict: 'league_id,jersey_type' }
    )
    setSavingJersey(false)
    if (error) {
      console.error('[Jersey] upsert error:', error)
      toast.error(error.message ?? 'Failed to assign jersey')
      return
    }
    toast.success('Jersey assigned!')
    queryClient.invalidateQueries({ queryKey: ['league-jerseys', league.id] })
    setJerseyUserId('')
    setJerseyNumber('')
  }

  async function saveEndDate() {
    if (!newEndDate) return
    setSavingDate(true)
    const { error } = await supabase.from('leagues').update({ season_end: newEndDate }).eq('id', league.id)
    if (error) console.error('[League] end date update error:', error)
    await queryClient.invalidateQueries({ queryKey: ['league', league.id] })
    setSavingDate(false)
    setDateSaved(true)
    setTimeout(() => setDateSaved(false), 2000)
  }

  async function saveMinSets(value: number) {
    setSavingMinSets(true)
    setMinSets(value)
    const { error } = await supabase.from('leagues').update({ min_sets_per_fixture: value }).eq('id', league.id)
    if (error) console.warn('[League] min_sets_per_fixture update error:', error)
    await queryClient.invalidateQueries({ queryKey: ['league', league.id] })
    setSavingMinSets(false)
    setMinSetsSaved(true)
    setTimeout(() => setMinSetsSaved(false), 2000)
  }

  const playerOptions = standings.map(s => ({ id: s.user_id, name: s.profile?.name ?? s.user_id }))

  return (
    <div className="space-y-4">
      {/* Edit league name */}
      <div className="rounded-2xl border border-gray-100 p-4 space-y-3">
        <p className="text-[12px] font-bold text-gray-400 uppercase tracking-wide">League Name</p>
        {editingName ? (
          <>
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-[13px] text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#009688]"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setEditingName(false); setNewName(league.name) }}
                className="flex-1 rounded-xl border border-gray-200 py-2 text-[12px] font-semibold text-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!newName.trim()) return
                  setSavingName(true)
                  const { error } = await supabase.from('leagues').update({ name: newName.trim() }).eq('id', league.id)
                  setSavingName(false)
                  if (error) { toast.error(error.message ?? 'Failed to update name'); return }
                  toast.success('League name updated')
                  queryClient.invalidateQueries({ queryKey: ['league', league.id] })
                  queryClient.invalidateQueries({ queryKey: ['my-leagues-compete'] })
                  queryClient.invalidateQueries({ queryKey: ['my-leagues-discovery'] })
                  setEditingName(false)
                }}
                disabled={savingName || !newName.trim()}
                className="flex-1 rounded-xl bg-[#009688] py-2 text-[12px] font-bold text-white disabled:opacity-40"
              >
                {savingName ? 'Saving…' : 'Save'}
              </button>
            </div>
          </>
        ) : (
          <button
            onClick={() => setEditingName(true)}
            className="w-full flex items-center justify-between rounded-xl border border-gray-200 px-3 py-2.5 text-left"
          >
            <span className="text-[13px] text-gray-900 truncate">{league.name}</span>
            <span className="text-[11px] text-[#009688] font-semibold ml-2">Edit</span>
          </button>
        )}
      </div>

      {/* Points adjustment */}
      <div className="rounded-2xl border border-gray-100 p-4 space-y-3">
        <p className="text-[12px] font-bold text-gray-400 uppercase tracking-wide">Manual Points Adjustment</p>
        <select
          value={selectedUserId}
          onChange={e => setSelectedUserId(e.target.value)}
          className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-[13px] text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#009688]"
        >
          <option value="">Select player…</option>
          {playerOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {selectedUserId && (
          <p className="text-[12px] text-gray-500">
            Current: <span className="font-bold text-gray-900">{standings.find(s => s.user_id === selectedUserId)?.points ?? 0}</span> points
            {pointsDelta && (
              <span className="ml-2">&rarr; <span className="font-bold text-[#009688]">{(standings.find(s => s.user_id === selectedUserId)?.points ?? 0) + parseInt(pointsDelta, 10)}</span> points</span>
            )}
          </p>
        )}
        <input
          type="number"
          value={pointsDelta}
          onChange={e => setPointsDelta(e.target.value.replace(/[^0-9-]/g, ''))}
          placeholder="Points change (e.g. 5 or -3)"
          className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-[13px] text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#009688]"
        />
        <input
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Reason (optional)"
          className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-[13px] text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#009688]"
        />
        <button
          onClick={saveAdjustment}
          disabled={adjusting || !selectedUserId || !pointsDelta}
          className="w-full rounded-xl bg-[#009688] py-2.5 text-[13px] font-bold text-white disabled:opacity-40"
        >
          {adjustSaved ? 'Saved!' : adjusting ? 'Saving…' : 'Apply Adjustment'}
        </button>
      </div>

      {/* Jersey assignment */}
      <div className="rounded-2xl border border-gray-100 p-4 space-y-3">
        <p className="text-[12px] font-bold text-gray-400 uppercase tracking-wide">Assign Jersey Number</p>
        <select
          value={jerseyUserId}
          onChange={e => setJerseyUserId(e.target.value)}
          className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-[13px] text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#009688]"
        >
          <option value="">Select player…</option>
          {playerOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <div className="grid grid-cols-5 gap-2">
          {JERSEY_COLOURS.map(c => (
            <button
              key={c.id}
              onClick={() => setJerseyNumber(c.id)}
              className={cn(
                'flex flex-col items-center gap-1 rounded-xl border-2 p-2 text-center transition-all',
                jerseyNumber === c.id ? 'border-[#009688] bg-teal-50' : 'border-gray-100'
              )}
            >
              <span className="text-[18px]">{c.emoji}</span>
              <span className="text-[9px] font-semibold text-gray-600 leading-tight">{c.label}</span>
            </button>
          ))}
        </div>
        <button
          onClick={saveJersey}
          disabled={savingJersey || !jerseyUserId || !jerseyNumber}
          className="w-full rounded-xl bg-[#009688] py-2.5 text-[13px] font-bold text-white disabled:opacity-40"
        >
          {savingJersey ? 'Saving…' : 'Assign Jersey'}
        </button>
      </div>

      {/* Amend end date */}
      <div className="rounded-2xl border border-gray-100 p-4 space-y-3">
        <p className="text-[12px] font-bold text-gray-400 uppercase tracking-wide">League End Date</p>
        <input
          type="date"
          value={newEndDate}
          onChange={e => setNewEndDate(e.target.value)}
          className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-[13px] text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#009688]"
        />
        <button
          onClick={saveEndDate}
          disabled={savingDate || !newEndDate}
          className="w-full rounded-xl bg-[#009688] py-2.5 text-[13px] font-bold text-white disabled:opacity-40"
        >
          {dateSaved ? 'Saved!' : savingDate ? 'Saving…' : 'Update End Date'}
        </button>
      </div>

      {/* Minimum sets per fixture */}
      <div className="rounded-2xl border border-gray-100 p-4 space-y-3">
        <p className="text-[12px] font-bold text-gray-400 uppercase tracking-wide">Minimum Sets Per Fixture</p>
        <div className="flex items-center justify-between">
          <span className="text-[13px] text-gray-600">How many sets must be entered before a result can be submitted</span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => { if (minSets > 1) saveMinSets(minSets - 1) }}
              disabled={minSets <= 1 || savingMinSets}
              className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center text-[15px] font-bold text-gray-600 disabled:opacity-30"
            >−</button>
            <span className="text-[15px] font-bold text-gray-900 w-6 text-center">{minSets}</span>
            <button
              onClick={() => { if (minSets < 5) saveMinSets(minSets + 1) }}
              disabled={minSets >= 5 || savingMinSets}
              className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center text-[15px] font-bold text-gray-600 disabled:opacity-30"
            >+</button>
          </div>
        </div>
        {minSetsSaved && <p className="text-[11px] text-teal-600 font-semibold">Saved!</p>}
      </div>

      {/* Invite from group */}
      <InviteFromGroupSection league={league} standings={standings} />

      {/* Reset pairs (only for pairs leagues with no matches played yet) */}
      {league.match_type === 'pairs' && hasTeams && !hasMatches && onResetPairs && (
        <div className="rounded-2xl border border-amber-100 p-4 space-y-3">
          <p className="text-[12px] font-bold text-gray-400 uppercase tracking-wide">Pairs</p>
          <button
            onClick={() => {
              if (!confirm('Reset all pairs? This deletes the current pair assignments. You can only do this before any matches are played.')) return
              onResetPairs()
            }}
            className="w-full rounded-xl border border-amber-200 py-2.5 text-[13px] font-semibold text-amber-600"
          >
            Reset Pairs
          </button>
        </div>
      )}

      {/* Delete league */}
      <div className="rounded-2xl border border-red-100 p-4 space-y-3">
        <p className="text-[12px] font-bold text-gray-400 uppercase tracking-wide">Danger Zone</p>
        <button
          onClick={async () => {
            if (!confirm('Delete this league? All fixtures and standings will be lost.')) return
            const { error, count } = await supabase.from('leagues').delete({ count: 'exact' }).eq('id', league.id)
            if (error || count === 0) {
              toast.error(error?.message ?? 'Failed to delete league. You may not have permission.')
              return
            }
            queryClient.invalidateQueries({ queryKey: ['my-leagues-compete'] })
            queryClient.invalidateQueries({ queryKey: ['my-leagues-discovery'] })
            queryClient.invalidateQueries({ queryKey: ['league', league.id] })
            queryClient.invalidateQueries({ queryKey: ['league-standings', league.id] })
            queryClient.invalidateQueries({ queryKey: ['league-teams', league.id] })
            onNavigate('/compete')
          }}
          className="w-full rounded-xl border border-red-200 py-2.5 text-[13px] font-semibold text-red-500"
        >
          Delete League
        </button>
      </div>
    </div>
  )
}

// ── About card (visible to all members) ──────────────────────────────────────

const SCORING_LABEL_KEY: Record<string, string> = {
  standard: 'scoring_standard_label',
  short_sets: 'scoring_short_sets_label',
  one_set: 'scoring_one_set_label',
  custom: 'scoring_custom_label',
}

function LeagueAboutCard({ league }: { league: LeagueInfo }) {
  const { t } = useTranslation('', { keyPrefix: 'create_league' })
  if (!league.format) return null

  const rows: Array<{ label: string; value: string }> = []

  rows.push({
    label: t('about_format'),
    value: t(`format_${league.format}_title`),
  })

  if (league.scoring_format) {
    rows.push({
      label: t('about_scoring'),
      value: t(SCORING_LABEL_KEY[league.scoring_format] ?? league.scoring_format),
    })
  }

  if (league.max_participants) {
    rows.push({ label: t('about_max_players'), value: String(league.max_participants) })
  }

  if (league.min_elo != null || league.max_elo != null) {
    const min = league.min_elo ?? 0
    const max = league.max_elo ?? 3000
    rows.push({ label: t('about_elo_range'), value: `${min} – ${max}` })
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
      <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2">{t('about_this_league')}</p>
      <p className="text-[13px] text-gray-600 mb-3">{t(`format_${league.format}_desc`)}</p>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline gap-2">
            <span className="text-[11px] font-bold text-teal-700 uppercase tracking-wide w-24 flex-shrink-0">{r.label}</span>
            <span className="text-[13px] text-gray-700">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── UI helpers ────────────────────────────────────────────────────────────────

function TabSkeleton() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-12 rounded-xl bg-gray-100 animate-pulse" />
      ))}
    </div>
  )
}

function EmptyTab({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-200 p-8 text-center">
      <p className="text-[13px] font-semibold text-gray-500">{message}</p>
    </div>
  )
}

const STATUS_BADGE: Record<string, string> = {
  scheduled: 'bg-green-50 text-green-700 border-green-100',
  pending:   'bg-yellow-50 text-yellow-700 border-yellow-100',
  completed: 'bg-gray-50 text-gray-500 border-gray-100',
  cancelled: 'bg-red-50 text-red-500 border-red-100',
  open:      'bg-orange-50 text-orange-600 border-orange-100',
}

const LEAGUE_STATUS_STYLE: Record<string, string> = {
  active:    'bg-green-50 text-green-600 border-green-100',
  upcoming:  'bg-blue-50 text-blue-600 border-blue-100',
  completed: 'bg-gray-100 text-gray-500 border-gray-200',
}

// ── QuickResultSheet ─────────────────────────────────────────────────────────

interface QuickSetScore {
  team1: number | ''
  team2: number | ''
}

const isCompletedSet = (a: number, b: number) =>
  (Math.max(a, b) >= 6 && Math.abs(a - b) >= 2) || (a === 7 && b === 6) || (a === 6 && b === 7)

const SCORING_MIN_SETS: Record<string, number> = {
  standard: 2,
  short_sets: 2,
  one_set: 1,
  custom: 0,
}

const SCORING_FORMAT_LABELS: Record<string, string> = {
  standard: 'Best of 3 sets',
  short_sets: 'Short sets (best of 3)',
  one_set: 'One set',
  custom: 'Custom',
}

function QuickResultSheet({ open, onClose, match, leagueId, currentUserId, scoringFormat, setAsMatch, minSetsPerFixture }: {
  open: boolean
  onClose: () => void
  match: { id: string; player_ids: string[]; players?: Array<{ id: string; name: string }> } | null
  leagueId: string
  currentUserId: string
  scoringFormat?: string | null
  setAsMatch?: boolean
  minSetsPerFixture?: number
}) {
  const [step, setStep] = useState(1)
  const [sets, setSets] = useState<QuickSetScore[]>([{ team1: '', team2: '' }])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showIncompleteConfirm, setShowIncompleteConfirm] = useState(false)
  const queryClient = useQueryClient()
  const quickInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  // Reset on open/close
  if (!open && (step !== 1 || sets.length !== 1)) {
    // Using this pattern to avoid effect — resets when sheet closes
  }

  const team1Names = match?.players?.filter((p) => match.player_ids.slice(0, 2).includes(p.id)).map((p) => p.name.split(' ')[0]) ?? ['Team 1']
  const team2Names = match?.players?.filter((p) => match.player_ids.slice(2, 4).includes(p.id)).map((p) => p.name.split(' ')[0]) ?? ['Team 2']

  function countWins(): [number, number] {
    let t1 = 0, t2 = 0
    for (const s of sets) {
      if (s.team1 === '' || s.team2 === '') continue
      if (Number(s.team1) > Number(s.team2)) t1++
      else if (Number(s.team2) > Number(s.team1)) t2++
    }
    return [t1, t2]
  }

  const [t1Wins, t2Wins] = countWins()
  const resultType = t1Wins > t2Wins ? 'team1_win' : t2Wins > t1Wins ? 'team2_win' : 'draw'
  const resultLabel = resultType === 'team1_win'
    ? `${team1Names.join(' & ')} win ${t1Wins}-${t2Wins}`
    : resultType === 'team2_win'
    ? `${team2Names.join(' & ')} win ${t2Wins}-${t1Wins}`
    : `Draw ${t1Wins}-${t2Wins}`
  const canAdvance = sets.some((s) => s.team1 !== '' && s.team2 !== '')

  function handleReset() {
    setStep(1)
    setSets([{ team1: '', team2: '' }])
    setError(null)
  }

  function handleClose() {
    handleReset()
    onClose()
  }

  async function handleSubmit() {
    if (!match) return
    setSubmitting(true)
    setError(null)
    try {
      const completedSets = sets.filter((s) => s.team1 !== '' && s.team2 !== '')
      if (completedSets.length === 0) return

      const team1Players = match.player_ids.slice(0, 2)
      const team2Players = match.player_ids.slice(2, 4)

      // Single aggregated result — count only completed sets as wins
      const setsData = completedSets.map((s) => ({ team1: Number(s.team1), team2: Number(s.team2) }))
      let t1Wins = 0, t2Wins = 0
      for (const s of setsData) {
        if (isCompletedSet(s.team1, s.team2)) {
          if (s.team1 > s.team2) t1Wins++
          else if (s.team2 > s.team1) t2Wins++
        }
      }
      const rt = t1Wins > t2Wins ? 'team1_win' : t2Wins > t1Wins ? 'team2_win' : 'draw'

      const { error: resultError } = await supabase.from('match_results').insert({
        match_id: match.id,
        team1_players: team1Players,
        team2_players: team2Players,
        team1_score: t1Wins,
        team2_score: t2Wins,
        result_type: rt,
        verification_status: 'verified',
        submitted_by: currentUserId,
        sets_data: setsData,
      })
      if (resultError) throw resultError

      const { error: matchError } = await supabase.from('matches')
        .update({ status: 'completed', is_open: false, open_elo_min: null, open_elo_max: null })
        .eq('id', match.id)
      if (matchError) throw matchError

      console.warn(`[QuickResult] submitted result (${t1Wins}-${t2Wins}, ${setsData.length} set(s)) for fixture ${match.id}`)

      // Invalidate and close
      queryClient.invalidateQueries({ queryKey: ['league-standings', leagueId] })
      queryClient.invalidateQueries({ queryKey: ['league-team-standings', leagueId] })
      queryClient.invalidateQueries({ queryKey: ['league-fixtures', leagueId] })
      queryClient.invalidateQueries({ queryKey: ['league-results', leagueId] })
      queryClient.invalidateQueries({ queryKey: ['tournament-standings', leagueId] })
      queryClient.invalidateQueries({ queryKey: ['match', match.id] })
      handleClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to submit result')
    } finally {
      setSubmitting(false)
    }
  }

  if (!match) return null

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[55] bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
          />
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-[60] bg-white rounded-t-3xl max-h-[80vh] flex flex-col"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="h-1 w-10 rounded-full bg-gray-200" />
            </div>
            <div className="flex items-center justify-between px-5 py-3 flex-shrink-0">
              <button onClick={handleClose} className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center">
                <X className="h-4 w-4 text-gray-600" />
              </button>
              <h2 className="text-[15px] font-bold text-gray-900">Enter Result</h2>
              <div className="w-9" />
            </div>

            <div className="overflow-y-auto flex-1 px-5 pb-8">
              {step === 1 && (
                <div>
                  {/* Team labels */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-center flex-1">
                      <p className="text-[11px] font-bold text-teal-700 uppercase tracking-wide">Team 1</p>
                      <p className="text-[12px] text-gray-600 truncate">{team1Names.join(' & ')}</p>
                    </div>
                    <span className="text-gray-300 text-sm px-2">vs</span>
                    <div className="text-center flex-1">
                      <p className="text-[11px] font-bold text-orange-600 uppercase tracking-wide">Team 2</p>
                      <p className="text-[12px] text-gray-600 truncate">{team2Names.join(' & ')}</p>
                    </div>
                  </div>

                  {/* Set inputs */}
                  {sets.map((s, i) => {
                    const hasBoth = s.team1 !== '' && s.team2 !== ''
                    const a = Number(s.team1), b = Number(s.team2), total = a + b
                    const completed = hasBoth && isCompletedSet(a, b)
                    const unfinished = hasBoth && !completed
                    return (
                      <div
                        key={i}
                        className={cn(
                          'flex items-center gap-2 mb-3 justify-center',
                          setAsMatch && unfinished && 'bg-amber-50 border border-amber-200 rounded-xl px-2 py-1',
                        )}
                      >
                        <span className="text-[12px] text-gray-400 w-12">Set {i + 1}</span>
                        <input
                          ref={(el) => { quickInputRefs.current[`${i}-team1`] = el }}
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={9}
                          value={s.team1}
                          onChange={(e) => {
                            const val = e.target.value === '' ? '' : Math.min(9, Math.max(0, parseInt(e.target.value, 10)))
                            setSets((prev) => prev.map((x, j) => j === i ? { ...x, team1: val } : x))
                            if (e.target.value !== '') setTimeout(() => quickInputRefs.current[`${i}-team2`]?.focus(), 0)
                          }}
                          className="w-[56px] rounded-xl border border-gray-200 bg-teal-50 py-2 text-center text-[16px] font-bold text-teal-700 focus:outline-none focus:border-teal-400"
                        />
                        <span className="text-gray-300">—</span>
                        <input
                          ref={(el) => { quickInputRefs.current[`${i}-team2`] = el }}
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={9}
                          value={s.team2}
                          onChange={(e) => {
                            const val = e.target.value === '' ? '' : Math.min(9, Math.max(0, parseInt(e.target.value, 10)))
                            setSets((prev) => prev.map((x, j) => j === i ? { ...x, team2: val } : x))
                            if (e.target.value !== '') setTimeout(() => quickInputRefs.current[`${i + 1}-team1`]?.focus(), 0)
                          }}
                          className="w-[56px] rounded-xl border border-gray-200 bg-orange-50 py-2 text-center text-[16px] font-bold text-orange-600 focus:outline-none focus:border-orange-300"
                        />
                        {sets.length > 1 && (
                          <button onClick={() => setSets((prev) => prev.filter((_, j) => j !== i))} className="text-[10px] text-gray-300 hover:text-red-400 ml-1">
                            x
                          </button>
                        )}
                        {setAsMatch && hasBoth && (
                          completed ? (
                            <span className="text-[11px] rounded-full px-2.5 py-1 border ml-1 whitespace-nowrap inline-flex items-center gap-1.5 bg-teal-50 text-teal-700 border-teal-200">
                              <span className="inline-block w-2.5 h-2.5 rounded-full bg-teal-500" />
                              Finished
                            </span>
                          ) : total >= 6 ? (
                            <span className="text-[11px] rounded-full px-2.5 py-1 border ml-1 whitespace-nowrap inline-flex items-center gap-1.5 bg-amber-100 text-amber-700 border-amber-300 font-semibold">
                              <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500" />
                              Couldn&apos;t finish
                            </span>
                          ) : (
                            <span className="text-[11px] rounded-full px-2.5 py-1 border ml-1 whitespace-nowrap inline-flex items-center gap-1.5 bg-amber-50 text-amber-600 border-amber-200">
                              <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500" />
                              Couldn&apos;t finish &middot; won&apos;t count
                            </span>
                          )
                        )}
                      </div>
                    )
                  })}
                  {setAsMatch && (
                    <p className="text-[11px] text-gray-400 text-center mt-1 mb-3">Each set is checked automatically — &lsquo;Finished&rsquo; means a complete set; &lsquo;Couldn&apos;t finish&rsquo; shows if you stopped early (it still counts, scored on games played).</p>
                  )}

                  {sets.length < 5 && (
                    <button
                      onClick={() => setSets((prev) => [...prev, { team1: '', team2: '' }])}
                      className="w-full rounded-xl border border-dashed border-gray-200 py-2 text-[12px] text-gray-400 hover:border-teal-300 hover:text-teal-600 transition-colors mb-3"
                    >
                      + Add set
                    </button>
                  )}

                  <button
                    onClick={() => setStep(2)}
                    disabled={!canAdvance}
                    className="mt-2 w-full rounded-2xl bg-[#009688] py-3.5 text-[14px] font-bold text-white disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              )}

              {step === 2 && (
                <div>
                  <div className="bg-gray-50 rounded-2xl p-4 mb-4 text-center">
                    <p className="text-[15px] font-bold text-gray-800 mb-2">{resultLabel}</p>
                    <div className="flex items-center justify-center gap-2 text-[13px] text-gray-500">
                      {sets.filter((s) => s.team1 !== '' && s.team2 !== '').map((s, i) => (
                        <span key={i}>{Number(s.team1)}-{Number(s.team2)}</span>
                      ))}
                    </div>
                  </div>

                  {error && (
                    <p className="text-[12px] text-red-500 text-center mb-3">{error}</p>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={() => setStep(1)}
                      className="flex-1 rounded-2xl border border-gray-200 py-3.5 text-[14px] font-semibold text-gray-700"
                    >
                      Back
                    </button>
                    <button
                      onClick={() => {
                        // Validate completed sets against scoring format (setAsMatch skips incomplete sets)
                        const filled = sets.filter((s) => s.team1 !== '' && s.team2 !== '')
                        const setsToValidate = filled
                          .filter((s) => !setAsMatch || isCompletedSet(Number(s.team1), Number(s.team2)))
                          .map((s) => ({ team1: Number(s.team1), team2: Number(s.team2) }))
                        const validationError = validateSetScores(setsToValidate, scoringFormat)
                        if (validationError) {
                          toast.error(validationError)
                          return
                        }
                        const fmt = scoringFormat ?? 'standard'
                        const minSets = minSetsPerFixture ?? SCORING_MIN_SETS[fmt] ?? 2
                        if (filled.length < minSets) {
                          setShowIncompleteConfirm(true)
                          return
                        }
                        // Warn if any entered set is incomplete (setAsMatch typo guard)
                        if (setAsMatch && filled.some((s) => !isCompletedSet(Number(s.team1), Number(s.team2)))) {
                          setShowIncompleteConfirm(true)
                          return
                        }
                        handleSubmit()
                      }}
                      disabled={submitting}
                      className="flex-1 rounded-2xl bg-[#009688] py-3.5 text-[14px] font-bold text-white disabled:opacity-40"
                    >
                      {submitting ? 'Submitting...' : 'Submit Result'}
                    </button>
                  </div>

                  {/* Incomplete match confirmation */}
                  {showIncompleteConfirm && (
                    <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 p-3">
                      <p className="text-[13px] font-semibold text-amber-800 mb-1">Match incomplete</p>
                      <p className="text-[12px] text-amber-700 mb-3">
                        This league uses {SCORING_FORMAT_LABELS[scoringFormat ?? 'standard'] ?? scoringFormat}. Submit with only {sets.filter((s) => s.team1 !== '' && s.team2 !== '').length} set{sets.filter((s) => s.team1 !== '' && s.team2 !== '').length !== 1 ? 's' : ''}?
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setShowIncompleteConfirm(false)}
                          className="flex-1 rounded-xl border border-gray-200 py-2 text-[12px] font-semibold text-gray-600"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => { setShowIncompleteConfirm(false); handleSubmit() }}
                          className="flex-1 rounded-xl bg-amber-500 py-2 text-[12px] font-bold text-white"
                        >
                          Submit incomplete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// ── FixturePickerSheet ───────────────────────────────────────────────────────

function FixturePickerSheet({ open, onClose, fixtures, onSelect }: {
  open: boolean
  onClose: () => void
  fixtures: FixtureMatch[]
  onSelect: (match: FixtureMatch) => void
}) {
  const locale = useDateLocale()
  const unplayed = fixtures.filter((m) => m.status !== 'completed' && m.status !== 'cancelled')

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
            className="fixed bottom-0 left-0 right-0 z-[60] bg-white rounded-t-3xl max-h-[70vh] flex flex-col"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="h-1 w-10 rounded-full bg-gray-200" />
            </div>
            <div className="flex items-center justify-between px-5 py-3 flex-shrink-0">
              <button onClick={onClose} className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center">
                <X className="h-4 w-4 text-gray-600" />
              </button>
              <h2 className="text-[15px] font-bold text-gray-900">Select Fixture</h2>
              <div className="w-9" />
            </div>
            <div className="overflow-y-auto flex-1 px-5 pb-8">
              {unplayed.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-[13px] text-gray-400">No unplayed fixtures</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {unplayed.map((match) => (
                    <button
                      key={match.id}
                      onClick={() => { onSelect(match); onClose() }}
                      className="w-full text-left rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 hover:border-teal-200 transition-colors"
                    >
                      <p className="text-[13px] font-semibold text-gray-900 mb-1">
                        {(() => { try { return format(parseISO(match.match_date), 'EEE d MMM', { locale }) } catch { return match.match_date } })()}
                        {match.match_time ? ` · ${match.match_time.slice(0, 5)}` : ''}
                      </p>
                      {match.players && match.players.length > 0 && (
                        <div className="flex -space-x-1">
                          {match.players.slice(0, 4).map((p) => (
                            <PlayerAvatar key={p.id} name={p.name} avatarUrl={p.avatar_url} size="sm" />
                          ))}
                          <span className="ml-2 text-[11px] text-gray-400 self-center">
                            {match.players.map((p) => p.name.split(' ')[0]).join(', ')}
                          </span>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// ── QuickSessionSheet ────────────────────────────────────────────────────────

function QuickSessionSheet({ open, onClose, standings, leagueId, linkedGroupId, currentUserId, queryClient }: {
  open: boolean
  onClose: () => void
  standings: Standing[]
  leagueId: string
  linkedGroupId: string | null
  currentUserId: string
  queryClient: ReturnType<typeof useQueryClient>
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [rounds, setRounds] = useState(3)
  const [generating, setGenerating] = useState(false)

  const selectedCount = selected.size
  const maxRounds = Math.max(1, selectedCount - 1)
  const effectiveRounds = Math.min(rounds, maxRounds)

  const toggle = (uid: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(uid)) next.delete(uid); else next.add(uid)
      return next
    })
  }

  const handleGenerate = async () => {
    const playerIds = standings.filter((s) => selected.has(s.user_id)).map((s) => s.user_id)
    if (playerIds.length < 4) return
    setGenerating(true)
    try {
      const today = format(new Date(), 'yyyy-MM-dd')
      const matchesToCreate: Array<Record<string, unknown>> = []

      for (let r = 0; r < effectiveRounds; r++) {
        const { pairings } = generateRoundRobinRound(playerIds, r)
        for (let i = 0; i + 1 < pairings.length; i += 2) {
          const [a1, a2] = pairings[i]
          const [b1, b2] = pairings[i + 1]
          matchesToCreate.push({
            match_date: today,
            match_time: '12:00:00',
            match_type: 'competitive',
            status: 'scheduled',
            player_ids: [a1, a2, b1, b2],
            group_id: linkedGroupId,
            league_id: leagueId,
            round_number: null,
            created_manually: false,
            created_by: currentUserId,
          })
        }
      }

      const { error } = await supabase.from('matches').insert(matchesToCreate)
      if (error) console.warn('[QuickSession] insert error:', error)
      else console.warn(`[QuickSession] created ${matchesToCreate.length} matches for ${playerIds.length} players × ${effectiveRounds} rounds`)
      queryClient.invalidateQueries({ queryKey: ['league-fixtures', leagueId] })
      onClose()
    } finally {
      setGenerating(false)
    }
  }

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
            className="fixed bottom-0 left-0 right-0 z-[60] bg-white rounded-t-3xl max-h-[80vh] flex flex-col"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="h-1 w-10 rounded-full bg-gray-200" />
            </div>
            <div className="flex items-center justify-between px-5 py-3 shrink-0">
              <button onClick={onClose} className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center">
                <X className="h-4 w-4 text-gray-600" />
              </button>
              <h2 className="text-[15px] font-bold text-gray-900">Quick Session</h2>
              <div className="w-9" />
            </div>

            {/* Player list */}
            <div className="overflow-y-auto flex-1 px-5 pb-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Who's here today?</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelected(new Set(standings.map((s) => s.user_id)))}
                    className="text-[11px] font-semibold text-teal-600"
                  >Select all</button>
                  <button
                    onClick={() => setSelected(new Set())}
                    className="text-[11px] font-semibold text-gray-400"
                  >Clear all</button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1">
                {standings.map((s) => (
                  <button
                    key={s.user_id}
                    onClick={() => toggle(s.user_id)}
                    className={cn(
                      'flex items-center gap-2 rounded-xl px-2.5 py-2 text-left transition-colors',
                      selected.has(s.user_id) ? 'bg-teal-50 border border-teal-200' : 'bg-gray-50 border border-gray-100 opacity-50',
                    )}
                  >
                    <PlayerAvatar name={s.profile?.name ?? '?'} avatarUrl={s.profile?.avatar_url ?? null} size="sm" />
                    <span className="text-[12px] font-semibold text-gray-900 flex-1 truncate">{s.profile?.name ?? 'Unknown'}</span>
                    <span className={cn(
                      'text-[11px] font-bold',
                      selected.has(s.user_id) ? 'text-teal-600' : 'text-gray-300',
                    )}>
                      {selected.has(s.user_id) ? '✓' : '—'}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Rounds stepper + generate */}
            <div className="shrink-0 border-t border-gray-100 px-5 py-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold text-gray-700">Rounds</span>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setRounds((r) => Math.max(1, r - 1))}
                    disabled={effectiveRounds <= 1}
                    className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center text-[15px] font-bold text-gray-600 disabled:opacity-30"
                  >−</button>
                  <span className="text-[15px] font-bold text-gray-900 w-6 text-center">{effectiveRounds}</span>
                  <button
                    onClick={() => setRounds((r) => Math.min(maxRounds, r + 1))}
                    disabled={effectiveRounds >= maxRounds}
                    className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center text-[15px] font-bold text-gray-600 disabled:opacity-30"
                  >+</button>
                </div>
              </div>
              <button
                onClick={handleGenerate}
                disabled={selectedCount < 4 || generating}
                className="w-full rounded-2xl bg-[#009688] py-3 text-[13px] font-bold text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {generating ? 'Generating…' : selectedCount < 4 ? 'Select at least 4 players' : `Generate session (${effectiveRounds} round${effectiveRounds > 1 ? 's' : ''})`}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function LeagueDetailPage() {
  const { id = '' }       = useParams<{ id: string }>()
  const navigate          = useNavigate()
  const { profile }       = useAuth()
  const queryClient       = useQueryClient()
  const currentUserId     = profile?.id ?? ''
  const [activeTab, setActiveTab] = useState<Tab>('standings')
  const [quickResultMatch, setQuickResultMatch] = useState<FixtureMatch | null>(null)
  const [showFixturePicker, setShowFixturePicker] = useState(false)
  const locale = useDateLocale()
  const [generatingRound, setGeneratingRound] = useState(false)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  const [quickSessionKey, setQuickSessionKey] = useState(0)
  const [showQuickSession, setShowQuickSession] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const { t: tPairs } = useTranslation('', { keyPrefix: 'pairs' })

  async function handleShare(leagueName: string) {
    const url = `${window.location.origin}/compete/leagues/${id}`
    if (navigator.share) {
      try { await navigator.share({ title: leagueName, url }) } catch { /* cancelled */ }
    } else {
      await navigator.clipboard.writeText(url)
    }
  }

  const { data: league, isLoading: loadingLeague } = useLeague(id)
  const groupIds = league?.linked_group_ids ?? []
  const isMexicano = league?.match_type === 'mexicano'
  const isPairs    = league?.match_type === 'pairs'
  const isAdmin    = league?.created_by === currentUserId
  const isEloLeague = league?.match_type === 'individual' && league?.format === 'round_robin'
  const [showPairSheet, setShowPairSheet] = useState(false)

  const TABS: Array<{ id: Tab; label: string }> = [
    { id: 'standings', label: 'Standings' },
    { id: 'fixtures',  label: 'Fixtures'  },
    { id: 'results',   label: 'Results'   },
    ...(isMexicano ? [{ id: 'mexicano' as Tab, label: 'Mexicano' }] : []),
    ...(isAdmin ? [{ id: 'admin' as Tab, label: 'Admin' }] : []),
  ]

  const { data: standings = [], isLoading: loadingStandings } = useStandings(id)
  const indStandings = isEloLeague
    ? [...standings].sort((a, b) => (b.season_elo ?? 1230) - (a.season_elo ?? 1230))
    : standings
  const { data: teamStandings = [] } = useTeamStandings(id, isPairs)
  const { data: leagueTeams = [] } = useLeagueTeams(id)
  const { data: jerseys = [] } = useLeagueJerseys(id)
  const jerseyByUser = Object.fromEntries(jerseys.map((j) => [j.user_id, j.jersey_type]))
  const { data: entertainerRace = [] } = useEntertainerRace(id)
  const { data: entertainerHistory = [] } = useEntertainerHistory(id)
  const currentEntertainer = jerseys.find((j) => j.jersey_type === 'entertainer' || j.jersey_type === 'blue')
  const { data: leagueMembers = [] } = useLeagueMembers(id)
  const { data: currentRound = 0 } = useCurrentRound(id)
  const isSeasonComplete = league?.max_rounds != null && currentRound >= league.max_rounds
  const { data: fixtures  = [], isLoading: loadingFixtures  } = useFixtures(id, groupIds)
  const { data: results   = [], isLoading: loadingResults   } = useResults(id, groupIds)

  // Check for pending invitation
  const { data: pendingInvite } = useQuery({
    queryKey: ['league-invite', id, currentUserId],
    enabled: !!id && !!currentUserId,
    queryFn: async () => {
      const { data } = await supabase
        .from('league_invitations')
        .select('id')
        .eq('league_id', id)
        .eq('invited_user_id', currentUserId)
        .eq('status', 'pending')
        .maybeSingle()
      return data
    },
  })

  const acceptInviteMutation = useMutation({
    mutationFn: async () => {
      await supabase.from('league_invitations')
        .update({ status: 'accepted' })
        .eq('league_id', id).eq('invited_user_id', currentUserId)
      await supabase.from('league_members').insert({
        league_id: id, user_id: currentUserId, role: 'member', status: 'active',
      })
      await supabase.from('league_standings').insert({
        league_id: id, user_id: currentUserId,
        wins: 0, losses: 0, draws: 0, matches_played: 0, ranking_points: 0, category: 'overall',
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['league-invite', id] })
      queryClient.invalidateQueries({ queryKey: ['league-standings', id] })
    },
  })

  const declineInviteMutation = useMutation({
    mutationFn: async () => {
      await supabase.from('league_invitations')
        .update({ status: 'declined' })
        .eq('league_id', id).eq('invited_user_id', currentUserId)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['league-invite', id] }),
  })

  // Realtime subscription for live standings + results
  useEffect(() => {
    if (!id) return
    const channel = supabase
      .channel(`league-live-${id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'league_standings',
        filter: `league_id=eq.${id}`
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['league-standings', id] })
      })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'match_results',
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['league-results', id] })
        queryClient.invalidateQueries({ queryKey: ['league-fixtures', id] })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [id, queryClient])

  async function handleGenerateRound() {
    setGeneratingRound(true)
    try {
      const today = format(new Date(), 'yyyy-MM-dd', { locale })

      // Determine next round number from existing matches
      const { data: existingMatches } = await supabase
        .from('matches')
        .select('round_number')
        .eq('league_id', id)
        .not('round_number', 'is', null)
        .order('round_number', { ascending: false })
        .limit(1)
      const nextRound = existingMatches?.[0]?.round_number != null
        ? (existingMatches[0].round_number as number) + 1
        : 0

      // Auto-set max_rounds on first round if not already set
      if (nextRound === 0 && league?.max_rounds == null) {
        const n = isPairs ? leagueTeams.length : standings.length
        if (n >= 2) {
          const autoMaxRounds = n % 2 === 0 ? n - 1 : n
          await supabase.from('leagues').update({ max_rounds: autoMaxRounds }).eq('id', id)
          queryClient.invalidateQueries({ queryKey: ['league', id] })
        }
      }

      // Season complete check
      if (league?.max_rounds != null && nextRound >= league.max_rounds) {
        toast.error(`Season complete. All ${league.max_rounds} rounds have been generated.`)
        return
      }

      const matchesToCreate: Record<string, unknown>[] = []

      if (isPairs) {
        if (leagueTeams.length < 2) {
          toast.error('Need at least 2 pairs to generate a round')
          return
        }
        const teamIds = leagueTeams.map((t) => t.id)
        const teamMap = Object.fromEntries(leagueTeams.map((t) => [t.id, t]))
        const { pairings, bye } = generateRoundRobinRound(teamIds, nextRound)

        for (const [aId, bId] of pairings) {
          const t1 = teamMap[aId]
          const t2 = teamMap[bId]
          matchesToCreate.push({
            match_date: today,
            match_time: '12:00:00',
            match_type: 'competitive',
            status: 'scheduled',
            player_ids: [t1.player1_id, t1.player2_id, t2.player1_id, t2.player2_id],
            team1_id: t1.id,
            team2_id: t2.id,
            group_id: league?.linked_group_ids?.[0] ?? null,
            league_id: id,
            round_number: nextRound,
            created_manually: false,
            created_by: currentUserId,
          })
        }

        const byeName = bye ? teamMap[bye]?.team_name ?? bye : null
        console.log(`[GenerateRound] Round ${nextRound}: ${matchesToCreate.length} matches, bye: ${byeName ?? 'none'}`)
      } else {
        // Individual mode: round-robin over players (groups of 4 = 2v2 padel)
        // Each "entity" in the round-robin is a player; pairings produce 2 players per side
        const playerIds = standings.map((s) => s.user_id)
        if (playerIds.length < 4) {
          toast.error('Need at least 4 players to generate a round')
          return
        }

        const { pairings, bye } = generateRoundRobinRound(playerIds, nextRound)

        // Each round-robin pairing is 1v1; for padel doubles we need to group
        // consecutive pairings into 4-player matches (pair[0] vs pair[1])
        for (let i = 0; i + 1 < pairings.length; i += 2) {
          const [a1, a2] = pairings[i]
          const [b1, b2] = pairings[i + 1]
          matchesToCreate.push({
            match_date: today,
            match_time: '12:00:00',
            match_type: 'competitive',
            status: 'scheduled',
            player_ids: [a1, a2, b1, b2],
            group_id: league?.linked_group_ids?.[0] ?? null,
            league_id: id,
            round_number: nextRound,
            created_manually: false,
            created_by: currentUserId,
          })
        }

        const byeName = bye ? standings.find((s) => s.user_id === bye)?.profile?.name ?? bye : null
        console.log(`[GenerateRound] Round ${nextRound}: ${matchesToCreate.length} matches, bye: ${byeName ?? 'none'}`)
      }

      const { error } = await supabase.from('matches').insert(matchesToCreate)
      if (error) console.error('[GenerateRound] insert error:', error)
      queryClient.invalidateQueries({ queryKey: ['league-fixtures', id] })
    } finally {
      setGeneratingRound(false)
    }
  }

  if (loadingLeague) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#009688] border-t-transparent" />
      </div>
    )
  }

  if (!league) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 text-center">
        <p className="text-[14px] text-gray-500">League not found</p>
        <button onClick={() => goBack(navigate, '/compete')} className="mt-4 text-[13px] text-teal-600 font-semibold">Go back</button>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-white">
      {/* Header */}
      <div className="px-5 pt-14 pb-4">
        <div className="flex items-center gap-3 mb-1">
          <button
            onClick={() => goBack(navigate, '/compete')}
            className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0"
          >
            <ChevronLeft className="h-5 w-5 text-gray-600" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-[20px] font-bold text-gray-900 truncate">{league.name}</h1>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {league.match_type && (
                <span className="text-[11px] text-gray-400 capitalize">{league.match_type.replace('_', ' ')}</span>
              )}
              {league.city && (
                <>
                  <span className="text-gray-300">·</span>
                  <span className="text-[11px] text-gray-400">{league.city}</span>
                </>
              )}
              <span className={cn(
                'rounded-full border px-2 py-0.5 text-[10px] font-bold capitalize',
                LEAGUE_STATUS_STYLE[league.status] ?? 'bg-gray-100 text-gray-500 border-gray-200'
              )}>
                {league.status}
              </span>
              {league.max_rounds && currentRound > 0 && (
                <>
                  <span className="text-gray-300">·</span>
                  <span className="text-[11px] font-semibold text-gray-500">
                    {isSeasonComplete ? 'Season complete' : `Round ${currentRound} of ${league.max_rounds}`}
                  </span>
                </>
              )}
            </div>
          </div>
          <button
            onClick={() => handleShare(league.name)}
            className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0"
          >
            <Share2 className="h-4 w-4 text-gray-600" />
          </button>
        </div>
        {(league.season_start || league.season_end) && (
          <p className="text-[12px] text-gray-400 ml-12">
            {league.season_start ? (() => { try { return format(parseISO(league.season_start), 'd MMM yyyy', { locale }) } catch { return league.season_start } })() : ''}
            {league.season_start && league.season_end ? ' – ' : ''}
            {league.season_end ? (() => { try { return format(parseISO(league.season_end), 'd MMM yyyy', { locale }) } catch { return league.season_end } })() : ''}
          </p>
        )}
      </div>

      {/* Invitation banner */}
      {pendingInvite && (
        <div className="mx-5 mb-3 rounded-2xl bg-teal-50 border border-teal-200 px-4 py-3">
          <p className="text-[13px] font-bold text-teal-800 mb-2">You've been invited to this league</p>
          <div className="flex gap-2">
            <button
              onClick={() => acceptInviteMutation.mutate()}
              disabled={acceptInviteMutation.isPending}
              className="flex-1 rounded-xl bg-[#009688] py-2 text-[13px] font-bold text-white disabled:opacity-50"
            >
              {acceptInviteMutation.isPending ? 'Joining…' : 'Accept & Join'}
            </button>
            <button
              onClick={() => declineInviteMutation.mutate()}
              disabled={declineInviteMutation.isPending}
              className="flex-1 rounded-xl border border-gray-200 py-2 text-[13px] font-semibold text-gray-600"
            >
              Decline
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="px-5 border-b border-gray-100 overflow-x-auto">
        <div className="flex gap-5 min-w-max">
          {TABS.map((tab) => {
            const active = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'relative pb-3 text-[13px] font-semibold flex-shrink-0 transition-colors',
                  active ? 'text-[#009688]' : 'text-gray-400'
                )}
              >
                {tab.label}
                {active && (
                  <motion.div
                    layoutId="league-tab-underline"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#009688] rounded-full"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* League summary — matches played count (leader shown in standings card) */}
      <div className="px-5 pt-3 pb-1">
        <p className="text-[12px] text-gray-500">
          {standings.reduce((s, r) => s + r.played, 0) / 2} matches played
        </p>
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="px-5 pt-4 pb-32"
        >

          {/* ── Standings ── */}
          {activeTab === 'standings' && (
            loadingStandings ? <TabSkeleton /> :
            standings.length === 0 && !isPairs ? <EmptyTab message="No standings yet" /> :
            isPairs && leagueTeams.length === 0 ? (
              <div className="space-y-3">
                {league && <LeagueAboutCard league={league} />}
                <div className="rounded-2xl border border-dashed border-gray-200 p-6 text-center">
                  <p className="text-[14px] font-semibold text-gray-600 mb-1">{tPairs('no_pairs_yet')}</p>
                  <p className="text-[12px] text-gray-400 mb-3">{tPairs('no_pairs_cta')}</p>
                  {isAdmin && (
                    <button
                      onClick={() => setShowPairSheet(true)}
                      className="rounded-xl bg-[#009688] px-5 py-2.5 text-[13px] font-bold text-white"
                    >
                      {tPairs('setup_title')}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-3">

              {/* Leader / Champion card */}
              {isSeasonComplete && (isPairs ? teamStandings : indStandings).length >= 3 ? (
                <div className="space-y-2">
                  {/* Podium */}
                  {(isPairs ? teamStandings : indStandings).slice(0, 3).map((row, i) => {
                    const name = isPairs
                      ? (row as TeamStanding).team_name ?? 'Unknown'
                      : (row as Standing).profile?.name ?? 'Unknown'
                    const indRow = row as Standing
                    const pts = isPairs ? row.points : isEloLeague ? Math.round(indRow.season_elo ?? 1230) : row.points
                    const gd = isPairs ? (row as TeamStanding).game_difference : (row as Standing).game_difference
                    const styles = [
                      { bg: 'bg-gradient-to-r from-amber-50 to-yellow-50', border: 'border-amber-100', text: 'text-amber-600', pts_text: 'text-amber-700', emoji: '🏆', label: 'Champion' },
                      { bg: 'bg-gradient-to-r from-gray-50 to-slate-50', border: 'border-gray-200', text: 'text-gray-500', pts_text: 'text-gray-700', emoji: '🥈', label: '2nd Place' },
                      { bg: 'bg-gradient-to-r from-orange-50 to-amber-50', border: 'border-orange-100', text: 'text-orange-500', pts_text: 'text-orange-700', emoji: '🥉', label: '3rd Place' },
                    ][i]
                    return (
                      <div key={i} className={cn('rounded-2xl border px-4 py-3 flex items-center gap-3', styles.bg, styles.border)}>
                        <p className="text-[28px] leading-none">{styles.emoji}</p>
                        <div className="flex-1 min-w-0">
                          <p className={cn('text-[10px] font-bold uppercase tracking-wide mb-0.5', styles.text)}>{styles.label}</p>
                          <p className="text-[15px] font-bold text-gray-900 truncate">{name}</p>
                        </div>
                        <div className="text-right">
                          <p className={cn('text-[20px] font-black', styles.pts_text)}>{pts}</p>
                          <p className={cn('text-[10px] font-semibold', styles.text)}>{!isPairs && isEloLeague ? 'ELO' : gd != null ? `GD ${gd >= 0 ? '+' : ''}${gd}` : 'pts'}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : isPairs && teamStandings[0] ? (
                <div className="rounded-2xl bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-100 px-4 py-3 flex items-center gap-3">
                  <p className="text-[28px] leading-none">🥇</p>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wide mb-0.5">Current Leader</p>
                    <p className="text-[15px] font-bold text-gray-900 truncate">{teamStandings[0].team_name ?? 'Unknown'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[20px] font-black text-amber-700">{teamStandings[0].points}</p>
                    <p className="text-[10px] text-amber-500 font-semibold">pts</p>
                  </div>
                </div>
              ) : indStandings[0] && !isPairs ? (
                <div className="rounded-2xl bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-100 px-4 py-3 flex items-center gap-3">
                  <p className="text-[28px] leading-none">🥇</p>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wide mb-0.5">Current Leader</p>
                    <p className="text-[15px] font-bold text-gray-900 truncate">{indStandings[0].profile?.name ?? 'Unknown'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[20px] font-black text-amber-700">{isEloLeague ? Math.round(indStandings[0].season_elo ?? 1230) : indStandings[0].points}</p>
                    <p className="text-[10px] text-amber-500 font-semibold">{isEloLeague ? 'ELO' : 'pts'}</p>
                  </div>
                </div>
              ) : null}

              {/* Progress bar */}
              {(() => {
                const rows = isPairs ? teamStandings : indStandings
                const n = rows.length
                const totalFixtures = n > 1 ? n * (n - 1) / 2 : 0
                const fixturesPlayed = rows.length > 0 ? Math.max(...rows.map((s) => s.played)) : 0
                const pct = league?.max_rounds
                  ? Math.min(100, Math.round((currentRound / league.max_rounds) * 100))
                  : totalFixtures > 0 ? Math.min(100, Math.round((fixturesPlayed / totalFixtures) * 100)) : 0
                return (totalFixtures > 0 || league?.max_rounds) ? (
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <p className="text-[11px] font-semibold text-gray-500">
                        {league?.max_rounds
                          ? `Round ${currentRound} of ${league.max_rounds}`
                          : `${fixturesPlayed} of ${totalFixtures} fixtures played`}
                      </p>
                      <p className="text-[11px] text-gray-400">{pct}% complete</p>
                    </div>
                    <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full rounded-full bg-[#009688] transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                ) : null
              })()}

              {/* About this league */}
              {league && <LeagueAboutCard league={league} />}

              {/* Prizes */}
              {league?.prizes && (
                <div className="rounded-2xl bg-purple-50 border border-purple-100 px-4 py-3">
                  <p className="text-[11px] font-bold text-purple-600 uppercase tracking-wide mb-1">Prizes</p>
                  <p className="text-[13px] text-gray-800">{league.prizes}</p>
                </div>
              )}

              {/* Standings table — pairs or individual */}
              {isPairs ? (
                <>
                <div className="rounded-2xl border border-gray-100 overflow-hidden">
                  <div className="grid grid-cols-[28px_1fr_36px_36px_36px_36px_40px] gap-1 px-3 py-2 bg-gray-50 border-b border-gray-100">
                    {['#', 'Pair', 'P', 'W', 'L', 'GD', 'Pts'].map((h) => (
                      <span key={h} className="text-[10px] font-bold text-gray-400 text-center first:text-left">{h}</span>
                    ))}
                  </div>
                  {teamStandings.map((row, i) => {
                    const isMyTeam = row.player1_id === currentUserId || row.player2_id === currentUserId
                    return (
                      <div
                        key={row.team_id}
                        className={cn(
                          'grid grid-cols-[28px_1fr_36px_36px_36px_36px_40px] gap-1 items-center px-3 py-2.5',
                          i < teamStandings.length - 1 && 'border-b border-gray-50',
                          isMyTeam && 'bg-teal-50/60'
                        )}
                      >
                        <span className={cn('text-[12px] font-bold', isMyTeam ? 'text-[#009688]' : 'text-gray-400')}>
                          {row.rank <= 3 ? ['🥇', '🥈', '🥉'][row.rank - 1] : row.rank}
                        </span>
                        <div className="flex items-center gap-2 min-w-0">
                          <PairAvatar
                            player1={{ name: row.player1?.name, avatarUrl: row.player1?.avatar_url }}
                            player2={{ name: row.player2?.name, avatarUrl: row.player2?.avatar_url }}
                          />
                          <span className={cn('text-[12px] font-semibold truncate', isMyTeam ? 'text-[#009688]' : 'text-gray-800')}>
                            {row.team_name ?? `${row.player1?.name?.split(' ')[0] ?? '?'} & ${row.player2?.name?.split(' ')[0] ?? '?'}`}{isMyTeam ? ' ★' : ''}
                          </span>
                          {[row.player1_id, row.player2_id].map((pid) => jerseyByUser[pid] ? (
                            <span
                              key={pid}
                              className="flex-shrink-0 text-[12px] leading-none"
                              title={JERSEY_LABEL[jerseyByUser[pid]] ?? 'Jersey'}
                            >
                              {JERSEY_EMOJI[jerseyByUser[pid]] ?? ''}
                            </span>
                          ) : null)}
                        </div>
                        <span className="text-[12px] text-gray-500 text-center">{row.played}</span>
                        <span className="text-[12px] text-gray-500 text-center">{row.won}</span>
                        <span className="text-[12px] text-gray-500 text-center">{row.lost}</span>
                        <span className={cn('text-[12px] text-center', row.game_difference > 0 ? 'text-green-600' : row.game_difference < 0 ? 'text-red-500' : 'text-gray-400')}>
                          {row.game_difference > 0 ? '+' : ''}{row.game_difference}
                        </span>
                        <span className={cn('text-[12px] font-bold text-center', isMyTeam ? 'text-[#009688]' : 'text-gray-800')}>
                          {row.points}
                        </span>
                      </div>
                    )
                  })}
                </div>

                {/* Unpaired members (not in any league_team) */}
                {(() => {
                  const pairedIds = new Set(teamStandings.flatMap((ts) => [ts.player1_id, ts.player2_id]))
                  const unpairedMembers = leagueMembers.filter((m) => !pairedIds.has(m.id))
                  if (unpairedMembers.length === 0) return null
                  return (
                    <>
                      <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                        <p className="text-[12px] text-amber-700">
                          {unpairedMembers.length} player{unpairedMembers.length > 1 ? 's are' : ' is'} unpaired. Find them a partner or remove them from the league before the season completes.
                        </p>
                      </div>
                      <div className="rounded-2xl border border-dashed border-gray-200 p-3">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Awaiting Partner</p>
                        {unpairedMembers.map((m) => (
                          <div key={m.id} className="flex items-center gap-2 py-1.5">
                            <PlayerAvatar name={m.name} avatarUrl={m.avatar_url} size="sm" />
                            <span className="text-[12px] text-gray-500">{m.name}</span>
                            <span className="ml-auto text-[11px] text-gray-300">—</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )
                })()}
              </>
              ) : isEloLeague ? (
                <div className="rounded-2xl border border-gray-100 overflow-hidden">
                  <div className="grid grid-cols-[28px_1fr_52px_28px_28px_36px] gap-1 px-3 py-2 bg-gray-50 border-b border-gray-100">
                    {['#', 'Player', 'ELO', 'W', 'L', 'P'].map((h) => (
                      <span key={h} className="text-[10px] font-bold text-gray-400 text-center first:text-left">{h}</span>
                    ))}
                  </div>
                  {indStandings.map((row, i) => {
                    const isMe = row.user_id === currentUserId
                    const elo = Math.round(row.season_elo ?? 1230)
                    const delta = elo - 1230
                    const isProvisional = (row.played ?? 0) < 10
                    return (
                      <div
                        key={row.id}
                        className={cn(
                          'grid grid-cols-[28px_1fr_52px_28px_28px_36px] gap-1 items-center px-3 py-2.5',
                          i < indStandings.length - 1 && 'border-b border-gray-50',
                          isMe && 'bg-teal-50/60'
                        )}
                      >
                        <span className={cn('text-[12px] font-bold', isMe ? 'text-[#009688]' : 'text-gray-400')}>
                          {i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}
                        </span>
                        <div className="flex items-center gap-2 min-w-0">
                          <PlayerAvatar name={row.profile?.name} avatarUrl={row.profile?.avatar_url} size="sm" />
                          <span className={cn('text-[12px] font-semibold truncate', isMe ? 'text-[#009688]' : 'text-gray-800')}>
                            {row.profile?.name ?? 'Unknown'}{isMe ? ' ★' : ''}
                          </span>
                          {isProvisional && (
                            <span className="shrink-0 rounded bg-amber-100 px-1 py-0.5 text-[9px] font-bold text-amber-600">Prov</span>
                          )}
                          {jerseyByUser[row.user_id] && (
                            <span
                              className="shrink-0 text-[12px] leading-none"
                              title={`${JERSEY_LABEL[jerseyByUser[row.user_id]] ?? 'Jersey'}`}
                            >
                              {JERSEY_EMOJI[jerseyByUser[row.user_id]] ?? ''}
                            </span>
                          )}
                        </div>
                        <div className="text-center">
                          <span className={cn('text-[12px] font-bold', isMe ? 'text-[#009688]' : 'text-gray-800')}>{elo}</span>
                          <span className={cn('ml-0.5 text-[9px] font-semibold', delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-500' : 'text-gray-400')}>
                            {delta > 0 ? `+${delta}` : delta === 0 ? '—' : `${delta}`}
                          </span>
                        </div>
                        <span className="text-[12px] text-gray-500 text-center">{row.won}</span>
                        <span className="text-[12px] text-gray-500 text-center">{row.lost}</span>
                        <span className="text-[12px] text-gray-500 text-center">{row.played}</span>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="rounded-2xl border border-gray-100 overflow-hidden">
                  <div className="grid grid-cols-[28px_1fr_36px_36px_36px_36px_40px] gap-1 px-3 py-2 bg-gray-50 border-b border-gray-100">
                    {['#', 'Player', 'P', 'W', 'L', 'GD', 'Pts'].map((h) => (
                      <span key={h} className="text-[10px] font-bold text-gray-400 text-center first:text-left">{h}</span>
                    ))}
                  </div>
                  {standings.map((row, i) => {
                    const isMe = row.user_id === currentUserId
                    return (
                      <div
                        key={row.id}
                        className={cn(
                          'grid grid-cols-[28px_1fr_36px_36px_36px_36px_40px] gap-1 items-center px-3 py-2.5',
                          i < standings.length - 1 && 'border-b border-gray-50',
                          isMe && 'bg-teal-50/60'
                        )}
                      >
                        <span className={cn('text-[12px] font-bold', isMe ? 'text-[#009688]' : 'text-gray-400')}>
                          {row.rank <= 3 ? ['🥇', '🥈', '🥉'][row.rank - 1] : row.rank}
                        </span>
                        <div className="flex items-center gap-2 min-w-0">
                          <PlayerAvatar name={row.profile?.name} avatarUrl={row.profile?.avatar_url} size="sm" />
                          <span className={cn('text-[12px] font-semibold truncate', isMe ? 'text-[#009688]' : 'text-gray-800')}>
                            {row.profile?.name ?? 'Unknown'}{isMe ? ' ★' : ''}
                          </span>
                          {jerseyByUser[row.user_id] && (
                            <span
                              className="shrink-0 text-[12px] leading-none"
                              title={`${JERSEY_LABEL[jerseyByUser[row.user_id]] ?? 'Jersey'}`}
                            >
                              {JERSEY_EMOJI[jerseyByUser[row.user_id]] ?? ''}
                            </span>
                          )}
                        </div>
                        <span className="text-[12px] text-gray-500 text-center">{row.played}</span>
                        <span className="text-[12px] text-gray-500 text-center">{row.won}</span>
                        <span className="text-[12px] text-gray-500 text-center">{row.lost}</span>
                        <span className={cn('text-[12px] text-center', row.game_difference > 0 ? 'text-green-600' : row.game_difference < 0 ? 'text-red-500' : 'text-gray-400')}>
                          {row.game_difference > 0 ? '+' : ''}{row.game_difference}
                        </span>
                        <span className={cn('text-[12px] font-bold text-center', isMe ? 'text-[#009688]' : 'text-gray-800')}>
                          {row.points}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
              {/* ── Entertainer jersey ── */}
              {(currentEntertainer || entertainerRace.length > 0 || entertainerHistory.length > 0) && (
                <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50/40 p-4 space-y-4">

                  {/* Current holder */}
                  {currentEntertainer && (() => {
                    const holderPlayer = standings.find((s) => s.user_id === currentEntertainer.user_id)
                    const holderName = holderPlayer?.profile?.name ?? 'Player'
                    return (
                      <div className="flex items-center gap-3">
                        <span className="text-[20px]">🔵</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-bold text-navy">Entertainer</p>
                          <p className="text-[11px] text-gray-500 truncate">{holderName} holds the jersey</p>
                        </div>
                      </div>
                    )
                  })()}

                  {/* This week's race */}
                  {entertainerRace.length > 0 && (
                    <div>
                      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2">This week</p>
                      <p className="text-[10px] text-amber-600 italic mb-2">Verified votes only — updates as results are verified</p>
                      <div className="space-y-1.5">
                        {entertainerRace.map((entry, idx) => {
                          const standingsPlayer = standings.find((s) => s.user_id === entry.user_id)
                          const memberPlayer = !standingsPlayer ? leagueMembers.find((m: Record<string, unknown>) => m.user_id === entry.user_id) : null
                          const name = standingsPlayer?.profile?.name ?? (((memberPlayer as Record<string, unknown>)?.name as string) || 'Player')
                          return (
                            <div key={entry.user_id} className="flex items-center gap-2.5">
                              <span className={cn(
                                'w-5 text-center text-[11px] font-bold',
                                idx === 0 ? 'text-blue-600' : 'text-gray-400'
                              )}>{idx + 1}</span>
                              <span className="text-[12px] font-semibold text-gray-800 flex-1 truncate">{name.split(' ')[0]}</span>
                              <span className={cn(
                                'text-[12px] font-bold tabular-nums',
                                idx === 0 ? 'text-blue-600' : 'text-gray-500'
                              )}>{entry.vote_count}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Past entertainers */}
                  {entertainerHistory.length > 0 && (
                    <div>
                      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2">Past Entertainers</p>
                      <div className="space-y-1">
                        {entertainerHistory.slice(0, 4).map((h) => {
                          const p = standings.find((s) => s.user_id === h.user_id)
                          const nm = p?.profile?.name ?? 'Player'
                          return (
                            <div key={h.week_start} className="flex items-center gap-2 text-[11px]">
                              <span className="text-gray-400 w-16 flex-shrink-0">
                                {(() => { try { return format(parseISO(h.week_start), 'd MMM') } catch { return h.week_start } })()}
                              </span>
                              <span className="font-semibold text-gray-700 flex-1 truncate">{nm.split(' ')[0]}</span>
                              <span className="text-gray-400 tabular-nums">{h.vote_count}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
              </div>
            )
          )}

          {/* ── Fixtures ── */}
          {activeTab === 'fixtures' && (
            loadingFixtures ? <TabSkeleton /> : (
              <div>
                {/* Admin action bar — top of Fixtures */}
                {isAdmin && (
                  <div className="flex gap-2 mb-4">
                    {!isSeasonComplete && (
                      <button
                        onClick={() => {
                          if (isPairs && leagueTeams.length === 0) {
                            toast.error(tPairs('no_pairs_cta'))
                            return
                          }
                          handleGenerateRound()
                        }}
                        disabled={generatingRound || (isPairs && leagueTeams.length === 0)}
                        className="flex-1 rounded-2xl bg-[#009688] py-3 text-[13px] font-bold text-white disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {generatingRound ? 'Generating…' : currentRound === 0 ? 'Generate Round 1' : 'Generate Next Round'}
                      </button>
                    )}
                    {!isSeasonComplete && league?.match_type === 'individual' && (
                      <button
                        onClick={() => { setQuickSessionKey((k) => k + 1); setShowQuickSession(true) }}
                        className="flex-1 rounded-2xl bg-amber-500 py-3 text-[13px] font-bold text-white"
                      >
                        Quick session
                      </button>
                    )}
                    {!isSeasonComplete && (
                      <button
                        onClick={() => navigate(`/compete/leagues/${id}/tournament`)}
                        className="flex items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-r from-purple-600 to-purple-500 px-4 py-3 text-[13px] font-bold text-white"
                      >
                        <Zap className="h-4 w-4" />
                        Live
                      </button>
                    )}
                  </div>
                )}

                <QuickSessionSheet
                  key={quickSessionKey}
                  open={showQuickSession}
                  onClose={() => setShowQuickSession(false)}
                  standings={standings}
                  leagueId={id}
                  linkedGroupId={league?.linked_group_ids?.[0] ?? null}
                  currentUserId={currentUserId}
                  queryClient={queryClient}
                />

                {/* Empty state */}
                {fixtures.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-gray-200 p-8 text-center">
                    {results.length > 0 ? (
                      <>
                        <p className="text-[15px] font-bold text-gray-700 mb-1">Round complete!</p>
                        <p className="text-[12px] text-gray-400">
                          {isAdmin ? 'Generate the next round to continue' : 'Waiting for the next round to be scheduled'}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-[15px] font-bold text-gray-700 mb-1">Ready to start!</p>
                        <p className="text-[12px] text-gray-400">
                          {isAdmin ? 'Tap Generate Next Round to create your first fixtures' : 'Waiting for the season to start'}
                        </p>
                      </>
                    )}
                  </div>
                ) : (
              <div className="space-y-2">
                {fixtures.map((match) => (
                  <div key={match.id} className="rounded-xl border border-gray-100 bg-gray-50 overflow-hidden">
                    <button
                      onClick={() => navigate(`/matches/${match.id}`)}
                      className="w-full text-left px-4 py-3 hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <p className="text-[13px] font-semibold text-gray-900">
                          {(() => { try { return format(parseISO(match.match_date), 'EEE d MMM', { locale }) } catch { return match.match_date } })()}
                          {match.match_time ? ` · ${match.match_time.slice(0, 5)}` : ''}
                        </p>
                        <span className={cn(
                          'rounded-full border px-2 py-0.5 text-[10px] font-semibold flex-shrink-0 capitalize',
                          STATUS_BADGE[match.status] ?? 'bg-gray-50 text-gray-500 border-gray-100'
                        )}>
                          {match.status}
                        </span>
                      </div>
                      {match.booked_venue_name && (
                        <p className="text-[11px] text-gray-400">{match.booked_venue_name}</p>
                      )}
                      {match.players && match.players.length > 0 && (
                        <div className="flex -space-x-1 mt-2">
                          {match.players.slice(0, 4).map((p) => (
                            <PlayerAvatar key={p.id} name={p.name} avatarUrl={p.avatar_url} size="sm" />
                          ))}
                        </div>
                      )}
                    </button>
                    {isAdmin && (
                      <div className="px-4 pb-3 border-t border-gray-100 pt-2 flex gap-2">
                        {match.status !== 'completed' && (
                          <button
                            onClick={() => setQuickResultMatch(match)}
                            className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-1 text-[11px] font-semibold text-teal-700"
                          >
                            Enter result
                          </button>
                        )}
                        <button
                          onClick={async () => {
                            if (!confirm('Cancel this match? It will be removed from the fixtures.')) return
                            await supabase.from('matches').update({ status: 'cancelled', is_open: false, open_elo_min: null, open_elo_max: null }).eq('id', match.id)
                            queryClient.invalidateQueries({ queryKey: ['league-fixtures', id] })
                          }}
                          className="rounded-lg border border-red-200 px-3 py-1 text-[11px] font-semibold text-red-500"
                        >
                          Cancel match
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
                )}
              </div>
            )
          )}

          {/* ── Results ── */}
          {activeTab === 'results' && (
            loadingResults ? <TabSkeleton /> :
            results.length === 0 ? <EmptyTab message="No results yet" /> : (
              <div className="space-y-2">
                {results.map((match) => {
                  const r = match.result
                  return (
                    <button
                      key={match.id}
                      onClick={() => navigate(`/matches/${match.id}`)}
                      className="w-full text-left rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 hover:border-teal-200 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <p className="text-[11px] text-gray-400">
                          {(() => { try { return format(parseISO(match.match_date), 'EEE d MMM yyyy', { locale }) } catch { return match.match_date } })()}
                        </p>
                        {r && (
                          <span className={cn(
                            'text-[10px] font-semibold rounded-full px-2 py-0.5 border',
                            r.verification_status === 'verified'
                              ? 'bg-green-50 text-green-700 border-green-100'
                              : 'bg-yellow-50 text-yellow-700 border-yellow-100'
                          )}>
                            {r.verification_status === 'verified' ? 'Verified' : 'Pending'}
                          </span>
                        )}
                      </div>
                      {r ? (
                        <div className="flex items-center justify-between gap-2">
                          <p className="flex-1 text-right text-[12px] font-semibold text-gray-700 truncate">
                            {r.team1_players.map((pid: string) => match.profiles[pid]?.name?.split(' ')[0] ?? '?').join(' & ')}
                          </p>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <span className={cn('text-[16px] font-black', r.result_type === 'team1_win' ? 'text-teal-700' : 'text-gray-400')}>
                              {r.team1_score}
                            </span>
                            <span className="text-gray-300 text-xs">–</span>
                            <span className={cn('text-[16px] font-black', r.result_type === 'team2_win' ? 'text-orange-600' : 'text-gray-400')}>
                              {r.team2_score}
                            </span>
                          </div>
                          <p className="flex-1 text-[12px] font-semibold text-gray-700 truncate">
                            {r.team2_players.map((pid: string) => match.profiles[pid]?.name?.split(' ')[0] ?? '?').join(' & ')}
                          </p>
                        </div>
                      ) : (
                        <p className="text-[12px] text-gray-400">No result recorded</p>
                      )}
                    </button>
                  )
                })}
              </div>
            )
          )}

          {/* ── Mexicano ── */}
          {activeTab === 'mexicano' && (
            loadingStandings ? <TabSkeleton /> : (
              <MexicanoTab standings={standings} leagueId={id} isAdmin={isAdmin} />
            )
          )}

          {/* ── Admin ── */}
          {activeTab === 'admin' && isAdmin && (
            <AdminTab
              league={league}
              standings={standings}
              onNavigate={navigate}
              hasTeams={leagueTeams.length > 0}
              hasMatches={fixtures.length > 0}
              onResetPairs={async () => {
                await supabase.from('league_teams').delete().eq('league_id', id)
                queryClient.invalidateQueries({ queryKey: ['league-teams', id] })
                queryClient.invalidateQueries({ queryKey: ['league-team-standings', id] })
              }}
            />
          )}

        </motion.div>
      </AnimatePresence>

      {/* FAB for quick result entry */}
      {isAdmin && activeTab === 'standings' && (
        <>
          <button
            onClick={() => setShowFixturePicker(true)}
            className="fixed bottom-24 right-6 h-14 w-14 rounded-full bg-[#009688] shadow-lg flex items-center justify-center z-40"
          >
            <Plus className="h-6 w-6 text-white" />
          </button>
          {league?.match_type === 'individual' && (
            <div className="px-5 pb-4 mt-4">
              <button
                onClick={async () => {
                  if (!window.confirm('Start a new season? This resets every member\u2019s season ELO to 1230 and clears season W/L and points for this league. Career ELO is not affected. This cannot be undone.')) return
                  const { error } = await supabase.rpc('reset_league_season', { p_league_id: league.id })
                  if (error) {
                    console.warn('[LeagueDetail] reset_league_season error:', error)
                    toast.error('Failed to reset season')
                    return
                  }
                  queryClient.invalidateQueries({ queryKey: ['league-standings', id] })
                }}
                className="w-full rounded-xl border border-red-200 py-2.5 text-[13px] font-semibold text-red-500"
              >
                Start new season
              </button>
            </div>
          )}
        </>
      )}

      {/* Fixture picker sheet */}
      <FixturePickerSheet
        open={showFixturePicker}
        onClose={() => setShowFixturePicker(false)}
        fixtures={fixtures}
        onSelect={(match) => setQuickResultMatch(match)}
      />

      {/* Leave league — visible to members who are NOT the creator */}
      {league && !isAdmin && (
        <div className="px-5 pb-4">
          <button
            onClick={() => setShowLeaveConfirm(true)}
            className="w-full rounded-xl border border-red-200 py-2.5 text-[13px] font-semibold text-red-500"
          >
            Leave League
          </button>
        </div>
      )}

      {/* Leave league confirmation dialog */}
      <AnimatePresence>
        {showLeaveConfirm && (
          <>
            <motion.div
              className="fixed inset-0 z-[55] bg-black/40"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => !leaving && setShowLeaveConfirm(false)}
            />
            <motion.div
              className="fixed inset-x-5 top-1/2 -translate-y-1/2 z-[60] bg-white rounded-2xl p-6 shadow-xl"
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
            >
              <h3 className="text-[15px] font-bold text-gray-900 mb-2">Leave this league?</h3>
              <p className="text-[13px] text-gray-500 mb-5">
                Your standings and ELO from this league will be preserved but you won't appear in future fixtures.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowLeaveConfirm(false)}
                  disabled={leaving}
                  className="flex-1 rounded-xl border border-gray-200 py-3 text-[13px] font-semibold text-gray-700 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  disabled={leaving}
                  onClick={async () => {
                    setLeaving(true)
                    // Remove from league_members
                    const { error: memErr } = await supabase
                      .from('league_members').delete()
                      .eq('league_id', id).eq('user_id', currentUserId)
                    if (memErr) {
                      toast.error(memErr.message ?? 'Failed to leave league')
                      setLeaving(false)
                      return
                    }
                    // For pairs: remove league_team if member is in one
                    if (isPairs) {
                      await supabase
                        .from('league_teams').delete()
                        .eq('league_id', id)
                        .or(`player1_id.eq.${currentUserId},player2_id.eq.${currentUserId}`)
                    }
                    queryClient.invalidateQueries({ queryKey: ['my-leagues-compete'] })
                    queryClient.invalidateQueries({ queryKey: ['my-leagues-discovery'] })
                    queryClient.invalidateQueries({ queryKey: ['league-members-profiles', id] })
                    queryClient.invalidateQueries({ queryKey: ['league-teams', id] })
                    navigate('/compete')
                  }}
                  className="flex-1 rounded-xl bg-red-500 py-3 text-[13px] font-bold text-white disabled:opacity-50"
                >
                  {leaving ? 'Leaving…' : 'Leave League'}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Quick result sheet */}
      <QuickResultSheet
        open={!!quickResultMatch}
        onClose={() => setQuickResultMatch(null)}
        match={quickResultMatch}
        leagueId={id}
        currentUserId={currentUserId}
        scoringFormat={league?.scoring_format}
        setAsMatch={league?.match_type === 'individual' && league?.format === 'round_robin'}
        minSetsPerFixture={league?.min_sets_per_fixture ?? undefined}
      />

      {/* Pair assignment sheet */}
      {isPairs && (
        <PairAssignmentSheet
          open={showPairSheet}
          onClose={() => setShowPairSheet(false)}
          leagueId={id}
          members={leagueMembers}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['league-teams', id] })
            queryClient.invalidateQueries({ queryKey: ['league-team-standings', id] })
          }}
        />
      )}
    </div>
  )
}
