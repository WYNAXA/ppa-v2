import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, Zap, Share2, Plus, X } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PlayerAvatar } from '@/components/shared/PlayerAvatar'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

interface LeagueInfo {
  id: string
  name: string
  status: string
  match_type: string | null
  visibility: string | null
  season_start: string | null
  season_end: string | null
  linked_group_ids: string[] | null
  created_by: string | null
  city: string | null
  prizes: string | null
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

type Tab = 'standings' | 'fixtures' | 'results' | 'mexicano' | 'admin'

// ── Data hooks ────────────────────────────────────────────────────────────────

function useLeague(id: string) {
  return useQuery({
    queryKey: ['league', id],
    enabled: !!id,
    queryFn: async (): Promise<LeagueInfo | null> => {
      const { data, error } = await supabase
        .from('leagues')
        .select('id, name, status, match_type, visibility, season_start, season_end, linked_group_ids, created_by, city, prizes')
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
      const { data: rows, error } = await supabase
        .from('league_standings')
        .select('*')
        .eq('league_id', leagueId)

      if (error) { console.error('[League] standings error:', error); return [] }
      if (!rows || rows.length === 0) return []

      const userIds = rows.map((r) => r.user_id)
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name, avatar_url')
        .in('id', userIds)

      const profileMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]))

      // Sort by points desc then calculate rank client-side
      const sorted = [...rows].sort((a, b) => (b.points ?? 0) - (a.points ?? 0))

      return sorted.map((r, i) => ({
        id:      r.id,
        user_id: r.user_id,
        rank:    i + 1,
        played:  r.played ?? r.matches_played ?? 0,
        won:     r.wins ?? r.won ?? 0,
        lost:    r.losses ?? r.lost ?? 0,
        drawn:   r.draws ?? r.drawn ?? 0,
        points:  r.points ?? r.ranking_points ?? 0,
        profile: profileMap[r.user_id],
      }))
    },
  })
}

function useFixtures(leagueId: string, groupIds: string[]) {
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
      } else if (groupIds.length > 0) {
        // Fallback: matches in linked groups
        const { data: byGroup } = await supabase
          .from('matches')
          .select('id, match_date, match_time, status, booked_venue_name, player_ids')
          .in('group_id', groupIds)
          .not('status', 'in', '("completed","cancelled")')
          .order('match_date', { ascending: true })
          .limit(20)
        matches = byGroup
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

// ── Admin tab ─────────────────────────────────────────────────────────────────

function AdminTab({ league, standings }: { league: LeagueInfo; standings: Standing[] }) {
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
        .update({ points: (standings.find(s => s.user_id === selectedUserId)?.points ?? 0) + delta })
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

  async function saveJersey() {
    if (!jerseyUserId || !jerseyNumber) return
    setSavingJersey(true)
    await supabase.from('league_jerseys').upsert(
      { league_id: league.id, user_id: jerseyUserId, jersey_number: parseInt(jerseyNumber, 10) },
      { onConflict: 'league_id,user_id' }
    )
    setSavingJersey(false)
    setJerseyUserId('')
    setJerseyNumber('')
  }

  async function saveEndDate() {
    if (!newEndDate) return
    setSavingDate(true)
    await supabase.from('leagues').update({ season_end: newEndDate }).eq('id', league.id)
    await queryClient.invalidateQueries({ queryKey: ['league', league.id] })
    setSavingDate(false)
    setDateSaved(true)
    setTimeout(() => setDateSaved(false), 2000)
  }

  const playerOptions = standings.map(s => ({ id: s.user_id, name: s.profile?.name ?? s.user_id }))

  return (
    <div className="space-y-4">
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
        <input
          type="number"
          value={pointsDelta}
          onChange={e => setPointsDelta(e.target.value)}
          placeholder="Points change (e.g. +5 or -3)"
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
        <input
          type="number"
          value={jerseyNumber}
          onChange={e => setJerseyNumber(e.target.value)}
          placeholder="Jersey number"
          min="1"
          className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-[13px] text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#009688]"
        />
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

function QuickResultSheet({ open, onClose, match, leagueId, currentUserId }: {
  open: boolean
  onClose: () => void
  match: { id: string; player_ids: string[]; players?: Array<{ id: string; name: string }> } | null
  leagueId: string
  currentUserId: string
}) {
  const [step, setStep] = useState(1)
  const [sets, setSets] = useState<QuickSetScore[]>([{ team1: '', team2: '' }])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()

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

      // 1. Insert match_results
      const { error: resultError } = await supabase.from('match_results').insert({
        match_id: match.id,
        team1_players: match.player_ids.slice(0, 2),
        team2_players: match.player_ids.slice(2, 4),
        team1_score: t1Wins,
        team2_score: t2Wins,
        result_type: resultType,
        verification_status: 'verified',
        submitted_by: currentUserId,
        sets_data: completedSets.map((s) => ({ team1: Number(s.team1), team2: Number(s.team2) })),
      })
      if (resultError) throw resultError

      // 2. Update match status
      const { error: matchError } = await supabase.from('matches').update({ status: 'completed' }).eq('id', match.id)
      if (matchError) throw matchError

      // 3. Update league_standings via RPC
      const team1 = match.player_ids.slice(0, 2)
      const team2 = match.player_ids.slice(2, 4)

      if (resultType === 'draw') {
        await supabase.rpc('update_league_standings_draw', {
          p_league_id: leagueId,
          p_player_ids: [...team1, ...team2],
        })
      } else {
        const winners = resultType === 'team1_win' ? team1 : team2
        const losers = resultType === 'team1_win' ? team2 : team1
        await supabase.rpc('update_league_standings_win', {
          p_league_id: leagueId,
          p_winner_ids: winners,
          p_loser_ids: losers,
        })
      }

      // 4. Invalidate and close
      queryClient.invalidateQueries({ queryKey: ['league-standings', leagueId] })
      queryClient.invalidateQueries({ queryKey: ['league-fixtures', leagueId] })
      queryClient.invalidateQueries({ queryKey: ['league-results', leagueId] })
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
                  {sets.map((s, i) => (
                    <div key={i} className="flex items-center gap-2 mb-3 justify-center">
                      <span className="text-[12px] text-gray-400 w-12">Set {i + 1}</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={9}
                        value={s.team1}
                        onChange={(e) => {
                          const val = e.target.value === '' ? '' : Math.min(9, Math.max(0, parseInt(e.target.value, 10)))
                          setSets((prev) => prev.map((x, j) => j === i ? { ...x, team1: val } : x))
                        }}
                        className="w-[56px] rounded-xl border border-gray-200 bg-teal-50 py-2 text-center text-[16px] font-bold text-teal-700 focus:outline-none focus:border-teal-400"
                      />
                      <span className="text-gray-300">—</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={9}
                        value={s.team2}
                        onChange={(e) => {
                          const val = e.target.value === '' ? '' : Math.min(9, Math.max(0, parseInt(e.target.value, 10)))
                          setSets((prev) => prev.map((x, j) => j === i ? { ...x, team2: val } : x))
                        }}
                        className="w-[56px] rounded-xl border border-gray-200 bg-orange-50 py-2 text-center text-[16px] font-bold text-orange-600 focus:outline-none focus:border-orange-300"
                      />
                      {sets.length > 1 && (
                        <button onClick={() => setSets((prev) => prev.filter((_, j) => j !== i))} className="text-[10px] text-gray-300 hover:text-red-400 ml-1">
                          x
                        </button>
                      )}
                    </div>
                  ))}

                  {sets.length < 3 && (
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
                      onClick={handleSubmit}
                      disabled={submitting}
                      className="flex-1 rounded-2xl bg-[#009688] py-3.5 text-[14px] font-bold text-white disabled:opacity-40"
                    >
                      {submitting ? 'Submitting...' : 'Submit Result'}
                    </button>
                  </div>
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
                        {(() => { try { return format(parseISO(match.match_date), 'EEE d MMM') } catch { return match.match_date } })()}
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
  const isAdmin    = league?.created_by === currentUserId

  const TABS: Array<{ id: Tab; label: string }> = [
    { id: 'standings', label: 'Standings' },
    { id: 'fixtures',  label: 'Fixtures'  },
    { id: 'results',   label: 'Results'   },
    ...(isMexicano ? [{ id: 'mexicano' as Tab, label: 'Mexicano' }] : []),
    ...(isAdmin ? [{ id: 'admin' as Tab, label: 'Admin' }] : []),
  ]

  const { data: standings = [], isLoading: loadingStandings } = useStandings(id)
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
        <button onClick={() => navigate(-1)} className="mt-4 text-[13px] text-teal-600 font-semibold">Go back</button>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-white">
      {/* Header */}
      <div className="px-5 pt-14 pb-4">
        <div className="flex items-center gap-3 mb-1">
          <button
            onClick={() => navigate(-1)}
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
            {league.season_start ? (() => { try { return format(parseISO(league.season_start), 'd MMM yyyy') } catch { return league.season_start } })() : ''}
            {league.season_start && league.season_end ? ' – ' : ''}
            {league.season_end ? (() => { try { return format(parseISO(league.season_end), 'd MMM yyyy') } catch { return league.season_end } })() : ''}
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
            standings.length === 0 ? <EmptyTab message="No standings yet" /> : (
              <div className="space-y-3">

              {/* Current leader card */}
              {standings[0] && (
                <div className="rounded-2xl bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-100 px-4 py-3 flex items-center gap-3">
                  <p className="text-[28px] leading-none">🥇</p>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wide mb-0.5">Current Leader</p>
                    <p className="text-[15px] font-bold text-gray-900 truncate">{standings[0].profile?.name ?? 'Unknown'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[20px] font-black text-amber-700">{standings[0].points}</p>
                    <p className="text-[10px] text-amber-500 font-semibold">pts</p>
                  </div>
                </div>
              )}

              {/* Progress bar */}
              {(() => {
                const n = standings.length
                const totalRounds = n > 1 ? n * (n - 1) / 2 : 0
                const maxPlayed = standings.length > 0 ? Math.max(...standings.map((s) => s.played)) : 0
                const pct = totalRounds > 0 ? Math.min(100, Math.round((maxPlayed / totalRounds) * 100)) : 0
                return totalRounds > 0 ? (
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <p className="text-[11px] font-semibold text-gray-500">Season progress</p>
                      <p className="text-[11px] text-gray-400">{maxPlayed} / {totalRounds} rounds</p>
                    </div>
                    <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full rounded-full bg-[#009688] transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                ) : null
              })()}

              {/* Prizes */}
              {league?.prizes && (
                <div className="rounded-2xl bg-purple-50 border border-purple-100 px-4 py-3">
                  <p className="text-[11px] font-bold text-purple-600 uppercase tracking-wide mb-1">Prizes</p>
                  <p className="text-[13px] text-gray-800">{league.prizes}</p>
                </div>
              )}

              <div className="rounded-2xl border border-gray-100 overflow-hidden">
                <div className="grid grid-cols-[28px_1fr_36px_36px_36px_40px] gap-1 px-3 py-2 bg-gray-50 border-b border-gray-100">
                  {['#', 'Player', 'P', 'W', 'L', 'Pts'].map((h) => (
                    <span key={h} className="text-[10px] font-bold text-gray-400 text-center first:text-left">{h}</span>
                  ))}
                </div>
                {standings.map((row, i) => {
                  const isMe = row.user_id === currentUserId
                  return (
                    <div
                      key={row.id}
                      className={cn(
                        'grid grid-cols-[28px_1fr_36px_36px_36px_40px] gap-1 items-center px-3 py-2.5',
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
                      </div>
                      <span className="text-[12px] text-gray-500 text-center">{row.played}</span>
                      <span className="text-[12px] text-gray-500 text-center">{row.won}</span>
                      <span className="text-[12px] text-gray-500 text-center">{row.lost}</span>
                      <span className={cn('text-[12px] font-bold text-center', isMe ? 'text-[#009688]' : 'text-gray-800')}>
                        {row.points}
                      </span>
                    </div>
                  )
                })}
              </div>
              </div>
            )
          )}

          {/* ── Fixtures ── */}
          {activeTab === 'fixtures' && (
            loadingFixtures ? <TabSkeleton /> :
            fixtures.length === 0 ? <EmptyTab message="No upcoming fixtures" /> : (
              <div className="space-y-2">
                {fixtures.map((match) => (
                  <div key={match.id} className="rounded-xl border border-gray-100 bg-gray-50 overflow-hidden">
                    <button
                      onClick={() => navigate(`/matches/${match.id}`)}
                      className="w-full text-left px-4 py-3 hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <p className="text-[13px] font-semibold text-gray-900">
                          {(() => { try { return format(parseISO(match.match_date), 'EEE d MMM') } catch { return match.match_date } })()}
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
                            await supabase.from('matches').update({ status: 'cancelled' }).eq('id', match.id)
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
                          {(() => { try { return format(parseISO(match.match_date), 'EEE d MMM yyyy') } catch { return match.match_date } })()}
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
            <AdminTab league={league} standings={standings} />
          )}

        </motion.div>
      </AnimatePresence>

      {/* FAB for quick result entry */}
      {isAdmin && activeTab === 'standings' && (
        <button
          onClick={() => setShowFixturePicker(true)}
          className="fixed bottom-24 right-6 h-14 w-14 rounded-full bg-[#009688] shadow-lg flex items-center justify-center z-40"
        >
          <Plus className="h-6 w-6 text-white" />
        </button>
      )}

      {/* Fixture picker sheet */}
      <FixturePickerSheet
        open={showFixturePicker}
        onClose={() => setShowFixturePicker(false)}
        fixtures={fixtures}
        onSelect={(match) => setQuickResultMatch(match)}
      />

      {/* Quick result sheet */}
      <QuickResultSheet
        open={!!quickResultMatch}
        onClose={() => setQuickResultMatch(null)}
        match={quickResultMatch}
        leagueId={id}
        currentUserId={currentUserId}
      />
    </div>
  )
}
