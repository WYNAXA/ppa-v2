import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { ChevronLeft, Trophy, Check, Zap } from 'lucide-react'
import { format } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PlayerAvatar } from '@/components/shared/PlayerAvatar'
import { cn } from '@/lib/utils'

// ── Types ────────────────────────────────────────────────────────────────────

interface SetScore {
  team1: number | ''
  team2: number | ''
}

interface MatchEntry {
  matchId: string
  playerIds: string[]
  team1Names: string[]
  team2Names: string[]
  sets: SetScore[]
  completed: boolean
  submitting: boolean
}

interface Standing {
  user_id: string
  rank: number
  played: number
  won: number
  lost: number
  drawn: number
  points: number
  profile?: { name: string; avatar_url: string | null }
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function TournamentModePage() {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const currentUserId = profile?.id ?? ''

  const [entries, setEntries] = useState<MatchEntry[]>([])
  const [standingsOpen, setStandingsOpen] = useState(true)
  const [generatingRound, setGeneratingRound] = useState(false)

  // ── League info ──────────────────────────────────────────────────────────

  const { data: league } = useQuery({
    queryKey: ['league', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leagues')
        .select('id, name, status, match_type, linked_group_ids, created_by')
        .eq('id', id)
        .single()
      if (error) throw error
      return data
    },
  })

  const groupIds = league?.linked_group_ids ?? []

  // ── Standings ────────────────────────────────────────────────────────────

  const { data: standings = [] } = useQuery({
    queryKey: ['tournament-standings', id],
    enabled: !!id,
    queryFn: async (): Promise<Standing[]> => {
      const { data: rows, error } = await supabase
        .from('league_standings')
        .select('*')
        .eq('league_id', id)
      if (error || !rows) return []

      const userIds = rows.map((r) => r.user_id)
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name, avatar_url')
        .in('id', userIds)

      const profileMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]))
      const sorted = [...rows].sort(
        (a, b) =>
          ((b.ranking_points ?? b.points ?? 0) as number) -
          ((a.ranking_points ?? a.points ?? 0) as number),
      )

      return sorted.map((r, i) => ({
        user_id: r.user_id,
        rank: i + 1,
        played: (r.matches_played ?? r.played ?? 0) as number,
        won: (r.wins ?? r.won ?? 0) as number,
        lost: (r.losses ?? r.lost ?? 0) as number,
        drawn: (r.draws ?? r.drawn ?? 0) as number,
        points: (r.ranking_points ?? r.points ?? 0) as number,
        profile: profileMap[r.user_id],
      }))
    },
  })

  // ── Today's fixtures ─────────────────────────────────────────────────────

  const { data: todayFixtures = [] } = useQuery({
    queryKey: ['tournament-fixtures', id],
    enabled: !!id,
    queryFn: async () => {
      const today = format(new Date(), 'yyyy-MM-dd')

      // Build query — league_id or linked groups
      let query = supabase
        .from('matches')
        .select('id, match_date, match_time, player_ids, status, notes')
        .eq('match_date', today)
        .not('status', 'eq', 'cancelled')
        .order('match_time', { ascending: true })

      if (groupIds.length > 0) {
        query = query.or(`league_id.eq.${id},group_id.in.(${groupIds.join(',')})`)
      } else {
        query = query.eq('league_id', id)
      }

      const { data: matches } = await query
      if (!matches || matches.length === 0) return []

      // Fetch profiles for all players
      const allPlayerIds = [...new Set(matches.flatMap((m) => m.player_ids ?? []))]
      const { data: profiles } = allPlayerIds.length > 0
        ? await supabase.from('profiles').select('id, name, avatar_url').in('id', allPlayerIds)
        : { data: [] }
      const profileMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]))

      return matches.map((m) => ({
        id: m.id,
        playerIds: m.player_ids ?? [],
        status: m.status,
        profiles: profileMap,
      }))
    },
  })

  // ── Build entries from fixtures ──────────────────────────────────────────

  useEffect(() => {
    if (todayFixtures.length === 0) return

    setEntries((prev) => {
      // Preserve existing entries that haven't changed
      const existingMap = new Map(prev.map((e) => [e.matchId, e]))

      return todayFixtures.map((f) => {
        const existing = existingMap.get(f.id)
        if (existing) return existing

        const team1Ids = f.playerIds.slice(0, 2)
        const team2Ids = f.playerIds.slice(2, 4)

        return {
          matchId: f.id,
          playerIds: f.playerIds,
          team1Names: team1Ids.map(
            (pid: string) => f.profiles[pid]?.name?.split(' ')[0] ?? 'Player',
          ),
          team2Names: team2Ids.map(
            (pid: string) => f.profiles[pid]?.name?.split(' ')[0] ?? 'Player',
          ),
          sets: [{ team1: '', team2: '' }],
          completed: f.status === 'completed',
          submitting: false,
        }
      })
    })
  }, [todayFixtures])

  // ── Realtime subscription ────────────────────────────────────────────────

  useEffect(() => {
    if (!id) return
    const channel = supabase
      .channel(`tournament-${id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'league_standings',
          filter: `league_id=eq.${id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['tournament-standings', id] })
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [id, queryClient])

  // ── Helpers ──────────────────────────────────────────────────────────────

  const updateSet = useCallback(
    (matchIdx: number, setIdx: number, field: 'team1' | 'team2', value: string) => {
      const parsed = value === '' ? '' : Math.min(9, Math.max(0, parseInt(value, 10)))
      setEntries((prev) =>
        prev.map((e, i) =>
          i === matchIdx
            ? {
                ...e,
                sets: e.sets.map((s, j) => (j === setIdx ? { ...s, [field]: parsed } : s)),
              }
            : e,
        ),
      )
    },
    [],
  )

  const addSet = useCallback((matchIdx: number) => {
    setEntries((prev) =>
      prev.map((e, i) =>
        i === matchIdx && e.sets.length < 3
          ? { ...e, sets: [...e.sets, { team1: '', team2: '' }] }
          : e,
      ),
    )
  }, [])

  function getResult(entry: MatchEntry) {
    const completedSets = entry.sets.filter((s) => s.team1 !== '' && s.team2 !== '')
    let t1Wins = 0
    let t2Wins = 0
    for (const s of completedSets) {
      if (Number(s.team1) > Number(s.team2)) t1Wins++
      else if (Number(s.team2) > Number(s.team1)) t2Wins++
    }
    const resultType =
      t1Wins > t2Wins ? 'team1_win' : t2Wins > t1Wins ? 'team2_win' : 'draw'
    const label =
      resultType === 'team1_win'
        ? `${entry.team1Names.join(' & ')} win ${t1Wins}-${t2Wins}`
        : resultType === 'team2_win'
          ? `${entry.team2Names.join(' & ')} win ${t2Wins}-${t1Wins}`
          : `Draw ${t1Wins}-${t2Wins}`
    return { t1Wins, t2Wins, resultType, label, completedSets }
  }

  function hasScores(entry: MatchEntry) {
    return entry.sets.some((s) => s.team1 !== '' && s.team2 !== '')
  }

  // ── Submit result ────────────────────────────────────────────────────────

  async function submitResult(idx: number) {
    const entry = entries[idx]
    setEntries((prev) =>
      prev.map((e, i) => (i === idx ? { ...e, submitting: true } : e)),
    )

    try {
      const { t1Wins, t2Wins, resultType, completedSets } = getResult(entry)
      const team1 = entry.playerIds.slice(0, 2)
      const team2 = entry.playerIds.slice(2, 4)

      // Insert result
      await supabase.from('match_results').insert({
        match_id: entry.matchId,
        team1_players: team1,
        team2_players: team2,
        team1_score: t1Wins,
        team2_score: t2Wins,
        result_type: resultType,
        verification_status: 'verified',
        submitted_by: currentUserId,
        sets_data: completedSets.map((s) => ({
          team1: Number(s.team1),
          team2: Number(s.team2),
        })),
      })

      // Update match status
      await supabase
        .from('matches')
        .update({ status: 'completed', is_open: false, open_elo_min: null, open_elo_max: null })
        .eq('id', entry.matchId)

      // Update standings via RPC
      if (resultType === 'draw') {
        await supabase.rpc('update_league_standings_draw', {
          p_league_id: id,
          p_player_ids: [...team1, ...team2],
        })
      } else {
        await supabase.rpc('update_league_standings_win', {
          p_league_id: id,
          p_winner_ids: resultType === 'team1_win' ? team1 : team2,
          p_loser_ids: resultType === 'team1_win' ? team2 : team1,
        })
      }

      setEntries((prev) =>
        prev.map((e, i) =>
          i === idx ? { ...e, completed: true, submitting: false } : e,
        ),
      )
      queryClient.invalidateQueries({ queryKey: ['tournament-standings', id] })
      queryClient.invalidateQueries({ queryKey: ['tournament-fixtures', id] })
    } catch (err) {
      console.error('[Tournament] submit error:', err)
      setEntries((prev) =>
        prev.map((e, i) => (i === idx ? { ...e, submitting: false } : e)),
      )
    }
  }

  // ── Generate next round ──────────────────────────────────────────────────

  async function generateNextRound() {
    if (!league || standings.length < 4) return
    setGeneratingRound(true)

    try {
      const players = standings.map((s) => s.user_id)
      const matchesToCreate = []
      const today = format(new Date(), 'yyyy-MM-dd')

      for (let i = 0; i + 3 < players.length; i += 4) {
        matchesToCreate.push({
          match_date: today,
          match_time: '12:00:00',
          match_type: league.match_type ?? 'competitive',
          status: 'scheduled',
          player_ids: [players[i], players[i + 1], players[i + 2], players[i + 3]],
          group_id: league.linked_group_ids?.[0] ?? null,
          league_id: id,
          created_manually: false,
          notes: 'Tournament round — auto-generated',
        })
      }

      await supabase.from('matches').insert(matchesToCreate)
      queryClient.invalidateQueries({ queryKey: ['tournament-fixtures', id] })
    } catch (err) {
      console.error('[Tournament] generate round error:', err)
    } finally {
      setGeneratingRound(false)
    }
  }

  // ── Computed ─────────────────────────────────────────────────────────────

  const completedCount = entries.filter((e) => e.completed).length
  const totalCount = entries.length
  const allCompleted = totalCount > 0 && completedCount === totalCount
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white px-5 pt-14 pb-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/compete/leagues/${id}`)}
            className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0"
          >
            <ChevronLeft className="h-5 w-5 text-gray-600" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-[17px] font-bold text-gray-900">Tournament Mode</h1>
              <span className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2 py-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                <span className="text-[10px] font-bold text-red-600">LIVE</span>
              </span>
            </div>
            {league && (
              <p className="text-[12px] text-gray-400 truncate mt-0.5">{league.name}</p>
            )}
          </div>
          <Trophy className="h-5 w-5 text-amber-500 flex-shrink-0" />
        </div>
      </div>

      {/* Standings mini-view */}
      {standings.length > 0 && (
        <div className="bg-white border-b border-gray-100">
          <button
            onClick={() => setStandingsOpen((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-2"
          >
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">
              Top Standings
            </span>
            <span className="text-[11px] text-gray-400">
              {standingsOpen ? 'Hide' : 'Show'}
            </span>
          </button>
          {standingsOpen && (
            <div className="px-5 pb-3 overflow-x-auto">
              <div className="flex gap-3 min-w-max">
                {standings.slice(0, 5).map((s, i) => (
                  <div
                    key={s.user_id}
                    className="flex items-center gap-2 rounded-xl bg-gray-50 border border-gray-100 px-3 py-2 min-w-[120px]"
                  >
                    <span className="text-[12px] font-bold text-gray-400">
                      {i < 3 ? ['🥇', '🥈', '🥉'][i] : `#${i + 1}`}
                    </span>
                    <PlayerAvatar
                      name={s.profile?.name}
                      avatarUrl={s.profile?.avatar_url}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold text-gray-800 truncate">
                        {s.profile?.name?.split(' ')[0] ?? 'Unknown'}
                      </p>
                      <p className="text-[10px] text-gray-400">{s.points} pts</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Match list */}
      <div className="flex-1 px-4 pt-4 pb-32 overflow-y-auto">
        {entries.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 p-8 text-center">
            <Zap className="h-8 w-8 text-gray-300 mx-auto mb-3" />
            <p className="text-[13px] font-semibold text-gray-500">
              No matches scheduled for today
            </p>
            <p className="text-[12px] text-gray-400 mt-1">
              Generate a round from standings to get started
            </p>
          </div>
        ) : (
          entries.map((entry, idx) => {
            const result = getResult(entry)
            const scored = hasScores(entry)

            return (
              <motion.div
                key={entry.matchId}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className={cn(
                  'rounded-2xl border p-4 mb-3',
                  entry.completed
                    ? 'bg-green-50 border-green-200'
                    : 'bg-white border-gray-100',
                )}
              >
                {/* Team names */}
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex-1 text-right">
                    <p className="text-[12px] font-semibold text-gray-800 truncate">
                      {entry.team1Names.join(' & ')}
                    </p>
                  </div>
                  <span className="text-[10px] text-gray-400 font-bold px-2">vs</span>
                  <div className="flex-1">
                    <p className="text-[12px] font-semibold text-gray-800 truncate">
                      {entry.team2Names.join(' & ')}
                    </p>
                  </div>
                </div>

                {/* Score inputs (per set) */}
                {entry.sets.map((set, i) => (
                  <div key={i} className="flex items-center justify-center gap-2 mb-1">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={9}
                      value={set.team1}
                      disabled={entry.completed}
                      onChange={(e) => updateSet(idx, i, 'team1', e.target.value)}
                      className="w-12 rounded-lg border border-gray-200 text-center py-1.5 text-[16px] font-bold text-gray-800 focus:outline-none focus:border-teal-400 disabled:opacity-50"
                    />
                    <span className="text-gray-300">—</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={9}
                      value={set.team2}
                      disabled={entry.completed}
                      onChange={(e) => updateSet(idx, i, 'team2', e.target.value)}
                      className="w-12 rounded-lg border border-gray-200 text-center py-1.5 text-[16px] font-bold text-gray-800 focus:outline-none focus:border-teal-400 disabled:opacity-50"
                    />
                  </div>
                ))}

                {/* Add set button */}
                {!entry.completed && entry.sets.length < 3 && (
                  <button
                    onClick={() => addSet(idx)}
                    className="text-[11px] text-teal-600 font-semibold mt-1"
                  >
                    + Add set
                  </button>
                )}

                {/* Submit */}
                {!entry.completed && scored && (
                  <button
                    onClick={() => submitResult(idx)}
                    disabled={entry.submitting}
                    className="mt-2 w-full rounded-xl bg-[#009688] py-2 text-[13px] font-bold text-white disabled:opacity-50"
                  >
                    {entry.submitting
                      ? 'Submitting...'
                      : `${result.label} · Submit`}
                  </button>
                )}

                {/* Completed state */}
                {entry.completed && (
                  <div className="flex items-center gap-1 mt-2">
                    <Check className="h-4 w-4 text-green-600" />
                    <span className="text-[12px] font-semibold text-green-700">
                      Result submitted
                    </span>
                  </div>
                )}
              </motion.div>
            )
          })
        )}

        {/* Generate next round */}
        {allCompleted && (
          <motion.button
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={generateNextRound}
            disabled={generatingRound || standings.length < 4}
            className="w-full rounded-2xl bg-gradient-to-r from-purple-600 to-purple-500 py-3.5 text-[14px] font-bold text-white disabled:opacity-50 mt-4"
          >
            {generatingRound ? 'Generating...' : 'Generate Next Round'}
          </motion.button>
        )}
      </div>

      {/* Bottom bar — progress */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-5 py-3 safe-area-pb z-30">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[12px] font-semibold text-gray-600">
            {completedCount}/{totalCount} results submitted
          </span>
          {allCompleted && totalCount > 0 && (
            <span className="text-[11px] font-bold text-green-600">All done!</span>
          )}
        </div>
        <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-[#009688]"
            initial={{ width: 0 }}
            animate={{ width: `${progressPct}%` }}
            transition={{ type: 'spring', stiffness: 200, damping: 25 }}
          />
        </div>
      </div>
    </div>
  )
}
