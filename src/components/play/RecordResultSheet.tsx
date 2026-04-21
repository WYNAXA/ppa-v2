import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ChevronLeft, Trophy, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { checkAndAwardBadges, type BadgeAward } from '@/lib/badges'
import { PlayerAvatar } from '@/components/shared/PlayerAvatar'
import { cn } from '@/lib/utils'
import type { Match, RankingChange } from '@/lib/types'

interface Player {
  id: string
  name: string
  avatar_url?: string | null
  ranking_points?: number | null
}

interface RecordResultSheetProps {
  open: boolean
  onClose: () => void
  match: Match
  players: Player[]
  currentUserId: string
}

interface SetScore {
  team1: number | ''
  team2: number | ''
}

function initTeams(playerIds: string[]): [string[], string[]] {
  return [playerIds.slice(0, 2), playerIds.slice(2, 4)]
}


export function RecordResultSheet({ open, onClose, match, players, currentUserId }: RecordResultSheetProps) {
  const [step, setStep] = useState(1)
  const [team1, setTeam1] = useState<string[]>([])
  const [team2, setTeam2] = useState<string[]>([])
  const [sets, setSets] = useState<SetScore[]>([{ team1: '', team2: '' }])
  const [resultType, setResultType] = useState<'team1_win' | 'team2_win' | 'draw' | null>(null)
  const [rankingChanges, setRankingChanges] = useState<RankingChange[]>([])
  const [newBadges, setNewBadges] = useState<BadgeAward[]>([])

  // Guard: initialise teams ONCE on open, never re-derived
  const initialisedRef = useRef(false)
  useEffect(() => {
    if (open && !initialisedRef.current) {
      const [t1, t2] = initTeams(match.player_ids)
      setTeam1(t1)
      setTeam2(t2)
      setStep(1)
      setSets([{ team1: '', team2: '' }])
      setResultType(null)
      setRankingChanges([])
      initialisedRef.current = true
    }
    if (!open) {
      initialisedRef.current = false
    }
  }, [open, match.player_ids])

  const queryClient = useQueryClient()

  const submitMutation = useMutation({
    mutationFn: async () => {
      const completedSets = sets.filter((s) => s.team1 !== '' && s.team2 !== '')
      const t1Total = completedSets.reduce((acc, s) => acc + (Number(s.team1) > Number(s.team2) ? 1 : 0), 0)
      const t2Total = completedSets.reduce((acc, s) => acc + (Number(s.team2) > Number(s.team1) ? 1 : 0), 0)

      const votingClosesAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()

      const { data: result, error: resultError } = await supabase
        .from('match_results')
        .insert({
          match_id: match.id,
          team1_players: team1,
          team2_players: team2,
          team1_score: t1Total,
          team2_score: t2Total,
          sets_data: completedSets,
          result_type: resultType!,
          verification_status: 'pending',
          submitted_by: currentUserId,
          is_friendly: match.match_type === 'casual',
          voting_closes_at: votingClosesAt,
        })
        .select()
        .single()

      if (resultError) throw resultError

      const { error: matchError } = await supabase
        .from('matches')
        .update({ status: 'completed' })
        .eq('id', match.id)

      if (matchError) throw matchError

      // Fetch ranking changes after insert
      const { data: changes } = await supabase
        .from('ranking_changes')
        .select('*')
        .eq('match_result_id', result.id)

      return changes ?? []
    },
    onSuccess: async (changes) => {
      setRankingChanges(changes)
      queryClient.invalidateQueries({ queryKey: ['match', match.id] })
      queryClient.invalidateQueries({ queryKey: ['matches'] })
      queryClient.invalidateQueries({ queryKey: ['achievements', currentUserId] })
      const earned = await checkAndAwardBadges(currentUserId)
      setNewBadges(earned)
      setStep(4)
    },
  })

  // Auto-calculate result from set scores
  useEffect(() => {
    if (step !== 3) return
    const completedSets = sets.filter((s) => s.team1 !== '' && s.team2 !== '')
    if (completedSets.length === 0) { setResultType(null); return }
    const t1Wins = completedSets.reduce((acc, s) => acc + (Number(s.team1) > Number(s.team2) ? 1 : 0), 0)
    const t2Wins = completedSets.reduce((acc, s) => acc + (Number(s.team2) > Number(s.team1) ? 1 : 0), 0)
    if (t1Wins > t2Wins) setResultType('team1_win')
    else if (t2Wins > t1Wins) setResultType('team2_win')
    else setResultType('draw')
  }, [step, sets])

  function getPlayer(id: string) {
    return players.find((p) => p.id === id)
  }

  function swapPlayerBetweenTeams(playerId: string, fromTeam: 1 | 2) {
    if (fromTeam === 1) {
      const otherInTeam1 = team1.find((id) => id !== playerId) ?? ''
      const firstInTeam2 = team2[0] ?? ''
      setTeam1([playerId, firstInTeam2].filter(Boolean))
      setTeam2([team2[1] ?? '', otherInTeam1].filter(Boolean))
    } else {
      const otherInTeam2 = team2.find((id) => id !== playerId) ?? ''
      const firstInTeam1 = team1[0] ?? ''
      setTeam2([playerId, firstInTeam1].filter(Boolean))
      setTeam1([team1[1] ?? '', otherInTeam2].filter(Boolean))
    }
  }

  function updateSet(index: number, side: 'team1' | 'team2', raw: string) {
    const val = raw === '' ? '' : Math.min(9, Math.max(0, parseInt(raw, 10)))
    setSets((prev) => prev.map((s, i) => i === index ? { ...s, [side]: val } : s))
  }

  function addSet() {
    if (sets.length < 3) setSets((prev) => [...prev, { team1: '', team2: '' }])
  }

  function removeSet(index: number) {
    setSets((prev) => prev.filter((_, i) => i !== index))
  }

  const canAdvanceStep1 = team1.length >= 1 && team2.length >= 1
  const canAdvanceStep2 = sets.some((s) => s.team1 !== '' && s.team2 !== '')

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
            className="fixed bottom-0 left-0 right-0 z-[60] bg-white rounded-t-3xl max-h-[90vh] flex flex-col"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="h-1 w-10 rounded-full bg-gray-200" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 flex-shrink-0">
              <button
                onClick={step > 1 && step < 4 ? () => setStep((s) => s - 1) : onClose}
                className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center"
              >
                {step > 1 && step < 4 ? <ChevronLeft className="h-5 w-5 text-gray-600" /> : <X className="h-4 w-4 text-gray-600" />}
              </button>
              <h2 className="text-[15px] font-bold text-gray-900">Record Result</h2>
              <div className="w-9" />
            </div>

            {/* Step dots */}
            {step < 4 && (
              <div className="flex items-center justify-center gap-1.5 pb-4 flex-shrink-0">
                {[1, 2, 3].map((s) => (
                  <motion.div
                    key={s}
                    className="h-1.5 rounded-full bg-[#009688]"
                    animate={{ width: s === step ? 20 : 6, opacity: s <= step ? 1 : 0.25 }}
                    transition={{ duration: 0.2 }}
                  />
                ))}
              </div>
            )}

            <div className="overflow-y-auto flex-1 px-5" style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}>
              <AnimatePresence mode="wait">
                {/* Step 1: Teams */}
                {step === 1 && (
                  <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                    <p className="text-[13px] text-gray-500 mb-4 text-center">Confirm or adjust team pairings</p>
                    <div className="grid grid-cols-2 gap-3">
                      {/* Team 1 */}
                      <div className="bg-teal-50 rounded-2xl p-3">
                        <p className="text-[11px] font-bold text-teal-700 mb-2 uppercase tracking-wide">Team 1</p>
                        {team1.map((pid) => {
                          const p = getPlayer(pid)
                          return (
                            <button
                              key={pid}
                              onClick={() => swapPlayerBetweenTeams(pid, 1)}
                              className="flex items-center gap-2 w-full rounded-xl bg-white px-2.5 py-2 mb-1.5 last:mb-0"
                            >
                              <PlayerAvatar name={p?.name ?? null} avatarUrl={p?.avatar_url} size="sm" />
                              <span className="text-[12px] font-medium text-gray-800 truncate">{p?.name ?? 'Player'}</span>
                            </button>
                          )
                        })}
                      </div>
                      {/* Team 2 */}
                      <div className="bg-orange-50 rounded-2xl p-3">
                        <p className="text-[11px] font-bold text-orange-600 mb-2 uppercase tracking-wide">Team 2</p>
                        {team2.map((pid) => {
                          const p = getPlayer(pid)
                          return (
                            <button
                              key={pid}
                              onClick={() => swapPlayerBetweenTeams(pid, 2)}
                              className="flex items-center gap-2 w-full rounded-xl bg-white px-2.5 py-2 mb-1.5 last:mb-0"
                            >
                              <PlayerAvatar name={p?.name ?? null} avatarUrl={p?.avatar_url} size="sm" />
                              <span className="text-[12px] font-medium text-gray-800 truncate">{p?.name ?? 'Player'}</span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                    <p className="text-[11px] text-gray-400 text-center mt-3">Tap a player to swap teams</p>
                    <button
                      onClick={() => setStep(2)}
                      disabled={!canAdvanceStep1}
                      className="mt-5 w-full rounded-2xl bg-[#009688] py-3.5 text-[14px] font-bold text-white disabled:opacity-40"
                    >
                      Next → Scores
                    </button>
                  </motion.div>
                )}

                {/* Step 2: Set scores */}
                {step === 2 && (
                  <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                    <p className="text-[13px] text-gray-500 mb-4 text-center">Enter scores for each set (0–9)</p>

                    {/* Column headers */}
                    <div className="grid grid-cols-[1fr_60px_16px_60px] gap-2 mb-2 px-1">
                      <div />
                      <p className="text-[11px] font-bold text-teal-700 text-center uppercase tracking-wide">Team 1</p>
                      <div />
                      <p className="text-[11px] font-bold text-orange-600 text-center uppercase tracking-wide">Team 2</p>
                    </div>

                    {sets.map((s, i) => (
                      <div key={i} className="flex items-center gap-2 mb-3">
                        <div className="flex-1 flex items-center gap-1.5">
                          <span className="text-[12px] text-gray-400 w-10">Set {i + 1}</span>
                          {sets.length > 1 && (
                            <button
                              onClick={() => removeSet(i)}
                              className="text-[10px] text-gray-300 hover:text-red-400"
                            >
                              ×
                            </button>
                          )}
                        </div>
                        <input
                          type="number"
                          min={0}
                          max={9}
                          value={s.team1}
                          onChange={(e) => updateSet(i, 'team1', e.target.value)}
                          className="w-[60px] rounded-xl border border-gray-200 bg-teal-50 py-2.5 text-center text-[16px] font-bold text-teal-700 focus:outline-none focus:border-teal-400"
                        />
                        <span className="text-gray-300 text-sm">—</span>
                        <input
                          type="number"
                          min={0}
                          max={9}
                          value={s.team2}
                          onChange={(e) => updateSet(i, 'team2', e.target.value)}
                          className="w-[60px] rounded-xl border border-gray-200 bg-orange-50 py-2.5 text-center text-[16px] font-bold text-orange-600 focus:outline-none focus:border-orange-300"
                        />
                      </div>
                    ))}

                    {sets.length < 3 && (
                      <button
                        onClick={addSet}
                        className="w-full rounded-xl border border-dashed border-gray-200 py-2.5 text-[12px] text-gray-400 hover:border-teal-300 hover:text-teal-600 transition-colors mb-3"
                      >
                        + Add set
                      </button>
                    )}

                    <button
                      onClick={() => setStep(3)}
                      disabled={!canAdvanceStep2}
                      className="mt-2 w-full rounded-2xl bg-[#009688] py-3.5 text-[14px] font-bold text-white disabled:opacity-40"
                    >
                      Next → Result
                    </button>
                  </motion.div>
                )}

                {/* Step 3: Confirm result */}
                {step === 3 && (
                  <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                    <p className="text-[13px] text-gray-500 mb-4 text-center">Confirm the match result</p>

                    {/* Score summary */}
                    <div className="bg-gray-50 rounded-2xl p-4 mb-4">
                      {sets.filter((s) => s.team1 !== '' && s.team2 !== '').map((s, i) => (
                        <div key={i} className="flex items-center justify-between mb-1 last:mb-0">
                          <span className="text-[12px] text-gray-500">Set {i + 1}</span>
                          <div className="flex items-center gap-3">
                            <span className={cn('text-[16px] font-bold', Number(s.team1) > Number(s.team2) ? 'text-teal-700' : 'text-gray-400')}>
                              {s.team1}
                            </span>
                            <span className="text-gray-300">–</span>
                            <span className={cn('text-[16px] font-bold', Number(s.team2) > Number(s.team1) ? 'text-orange-600' : 'text-gray-400')}>
                              {s.team2}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Winner display */}
                    <div className="text-center mb-5">
                      {resultType === 'draw' ? (
                        <p className="text-[15px] font-bold text-gray-700">Draw</p>
                      ) : resultType === 'team1_win' ? (
                        <div>
                          <p className="text-[11px] text-gray-400 uppercase tracking-wide mb-1">Winner</p>
                          <div className="flex items-center justify-center gap-2">
                            {team1.map((pid) => {
                              const p = getPlayer(pid)
                              return <PlayerAvatar key={pid} name={p?.name ?? null} avatarUrl={p?.avatar_url} size="sm" />
                            })}
                            <span className="text-[14px] font-bold text-teal-700">Team 1</span>
                          </div>
                        </div>
                      ) : resultType === 'team2_win' ? (
                        <div>
                          <p className="text-[11px] text-gray-400 uppercase tracking-wide mb-1">Winner</p>
                          <div className="flex items-center justify-center gap-2">
                            {team2.map((pid) => {
                              const p = getPlayer(pid)
                              return <PlayerAvatar key={pid} name={p?.name ?? null} avatarUrl={p?.avatar_url} size="sm" />
                            })}
                            <span className="text-[14px] font-bold text-orange-600">Team 2</span>
                          </div>
                        </div>
                      ) : null}
                    </div>

                    {/* Override result type */}
                    <div className="flex gap-2 mb-5">
                      {(['team1_win', 'draw', 'team2_win'] as const).map((rt) => (
                        <button
                          key={rt}
                          onClick={() => setResultType(rt)}
                          className={cn(
                            'flex-1 rounded-xl py-2 text-[11px] font-semibold border transition-colors',
                            resultType === rt
                              ? rt === 'team1_win' ? 'bg-teal-600 text-white border-teal-600'
                                : rt === 'team2_win' ? 'bg-orange-500 text-white border-orange-500'
                                : 'bg-gray-700 text-white border-gray-700'
                              : 'bg-white text-gray-500 border-gray-200'
                          )}
                        >
                          {rt === 'team1_win' ? 'T1 Win' : rt === 'team2_win' ? 'T2 Win' : 'Draw'}
                        </button>
                      ))}
                    </div>

                    {submitMutation.isError && (
                      <p className="text-[12px] text-red-500 text-center mb-3">Failed to submit. Try again.</p>
                    )}

                    <button
                      onClick={() => submitMutation.mutate()}
                      disabled={!resultType || submitMutation.isPending}
                      className="w-full rounded-2xl bg-[#009688] py-3.5 text-[14px] font-bold text-white disabled:opacity-40"
                    >
                      {submitMutation.isPending ? 'Submitting…' : 'Submit Result'}
                    </button>
                  </motion.div>
                )}

                {/* Step 4: Success */}
                {step === 4 && (
                  <motion.div
                    key="step4"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center py-6"
                  >
                    <div className="h-16 w-16 rounded-full bg-teal-50 flex items-center justify-center mb-4">
                      <Trophy className="h-8 w-8 text-[#009688]" />
                    </div>
                    <h3 className="text-[18px] font-bold text-gray-900 mb-1">Result Submitted</h3>
                    <p className="text-[13px] text-gray-500 mb-6 text-center">
                      Waiting for other players to verify. ELO will update once confirmed.
                    </p>

                    {rankingChanges.length > 0 && (
                      <div className="w-full bg-gray-50 rounded-2xl p-4 mb-5">
                        <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-3">ELO Changes</p>
                        {rankingChanges.map((rc) => {
                          const p = getPlayer(rc.player_id)
                          const delta = rc.points_change
                          return (
                            <div key={rc.id} className="flex items-center justify-between mb-2 last:mb-0">
                              <div className="flex items-center gap-2">
                                <PlayerAvatar name={p?.name ?? null} avatarUrl={p?.avatar_url} size="sm" />
                                <span className="text-[13px] font-medium text-gray-800">{p?.name ?? 'Player'}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                {delta > 0 ? (
                                  <TrendingUp className="h-3.5 w-3.5 text-green-500" />
                                ) : delta < 0 ? (
                                  <TrendingDown className="h-3.5 w-3.5 text-red-400" />
                                ) : (
                                  <Minus className="h-3.5 w-3.5 text-gray-400" />
                                )}
                                <span className={cn(
                                  'text-[13px] font-bold',
                                  delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-500' : 'text-gray-400'
                                )}>
                                  {delta > 0 ? '+' : ''}{delta}
                                </span>
                                <span className="text-[11px] text-gray-400">→ {rc.new_ranking}</span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {newBadges.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="w-full bg-amber-50 rounded-2xl p-4 mb-5 border border-amber-100"
                      >
                        <p className="text-[11px] font-bold text-amber-600 uppercase tracking-wide mb-2">
                          🎉 New Badge{newBadges.length > 1 ? 's' : ''} Earned!
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {newBadges.map((b) => (
                            <motion.div
                              key={b.badge_key}
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                              className="flex items-center gap-1.5 bg-white rounded-xl px-3 py-1.5 border border-amber-100"
                            >
                              <span className="text-lg">{b.emoji}</span>
                              <span className="text-[12px] font-bold text-gray-800">{b.label}</span>
                            </motion.div>
                          ))}
                        </div>
                      </motion.div>
                    )}

                    <button
                      onClick={onClose}
                      className="w-full rounded-2xl bg-[#009688] py-3.5 text-[14px] font-bold text-white"
                    >
                      Done
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
