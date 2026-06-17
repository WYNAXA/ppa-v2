import { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'

export interface SetScore {
  team1: number | ''
  team2: number | ''
  tiebreak?: { team1: number | ''; team2: number | '' } | null
  time_limit?: boolean
  note?: string
}

export function countSetWins(sets: SetScore[]): [number, number] {
  let t1Wins = 0, t2Wins = 0
  for (const s of sets) {
    if (s.team1 === '' || s.team2 === '') continue
    const t1 = Number(s.team1)
    const t2 = Number(s.team2)
    if (t1 > t2) t1Wins++
    else if (t2 > t1) t2Wins++
    else if (t1 === 6 && t2 === 6 && s.tiebreak) {
      const tb1 = Number(s.tiebreak.team1)
      const tb2 = Number(s.tiebreak.team2)
      if (tb1 > tb2) t1Wins++
      else if (tb2 > tb1) t2Wins++
    }
    // If 6-6 time_limit or no tiebreak, it's a drawn set (neither gets a win)
  }
  return [t1Wins, t2Wins]
}

export function deriveResultType(sets: SetScore[]): 'team1_win' | 'team2_win' | 'draw' | null {
  const completedSets = sets.filter((s) => s.team1 !== '' && s.team2 !== '')
  if (completedSets.length === 0) return null
  const [t1Wins, t2Wins] = countSetWins(completedSets)
  if (t1Wins > t2Wins) return 'team1_win'
  if (t2Wins > t1Wins) return 'team2_win'
  return 'draw'
}

interface ScoreEntryPanelProps {
  team1Names: string
  team2Names: string
  initialSets?: SetScore[]
  onChange: (sets: SetScore[], resultType: 'team1_win' | 'team2_win' | 'draw' | null) => void
}

export function ScoreEntryPanel({ team1Names, team2Names, initialSets, onChange }: ScoreEntryPanelProps) {
  const [sets, setSetsInternal] = useState<SetScore[]>(
    initialSets && initialSets.length > 0 ? initialSets : [{ team1: '', team2: '' }]
  )

  const firstInputRef = useRef<HTMLInputElement>(null)
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  // Notify parent on every change
  useEffect(() => {
    const resultType = deriveResultType(sets)
    onChange(sets, resultType)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sets])

  useEffect(() => {
    setTimeout(() => firstInputRef.current?.focus(), 50)
  }, [])

  function setSets(updater: SetScore[] | ((prev: SetScore[]) => SetScore[])) {
    setSetsInternal(updater)
  }

  function updateSet(index: number, side: 'team1' | 'team2', raw: string) {
    const val = raw === '' ? '' : Math.min(7, Math.max(0, parseInt(raw, 10)))
    setSets((prev) => prev.map((s, i) => i === index ? { ...s, [side]: val } : s))
    if (raw !== '') {
      const nextKey = side === 'team1' ? `${index}-team2` : `${index + 1}-team1`
      setTimeout(() => inputRefs.current[nextKey]?.focus(), 0)
    }
  }

  function updateTiebreak(index: number, side: 'team1' | 'team2', raw: string) {
    const val = raw === '' ? '' : Math.min(99, Math.max(0, parseInt(raw, 10)))
    setSets((prev) => prev.map((s, i) => {
      if (i !== index) return s
      return { ...s, tiebreak: { ...(s.tiebreak ?? { team1: '', team2: '' }), [side]: val } }
    }))
    if (raw !== '' && side === 'team1') {
      setTimeout(() => inputRefs.current[`tb-${index}-team2`]?.focus(), 0)
    }
  }

  function setTiebreakMode(index: number, mode: 'tiebreak' | 'time_limit') {
    setSets((prev) => prev.map((s, i) => {
      if (i !== index) return s
      if (mode === 'tiebreak') {
        return { ...s, tiebreak: { team1: '', team2: '' }, time_limit: false }
      } else {
        return { ...s, tiebreak: null, time_limit: true }
      }
    }))
  }

  function addSet() {
    if (sets.length < 3) setSets((prev) => [...prev, { team1: '', team2: '' }])
  }

  function removeSet(index: number) {
    setSets((prev) => prev.filter((_, i) => i !== index))
  }

  const resultType = deriveResultType(sets)

  return (
    <div>
      {/* Column headers with team names */}
      <div className="grid grid-cols-[1fr_60px_16px_60px] gap-2 mb-2 px-1">
        <div />
        <p className="text-[10px] font-bold text-teal-700 text-center leading-tight truncate">
          {team1Names}
        </p>
        <div />
        <p className="text-[10px] font-bold text-orange-600 text-center leading-tight truncate">
          {team2Names}
        </p>
      </div>

      {sets.map((s, i) => {
        const isTied66 = s.team1 === 6 && s.team2 === 6
        const is76 = (s.team1 === 7 && s.team2 === 6) || (s.team1 === 6 && s.team2 === 7)
        return (
          <div key={i} className="mb-3">
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center gap-1.5">
                <span className="text-[12px] text-gray-400 w-10">Set {i + 1}</span>
                {sets.length > 1 && (
                  <button
                    onClick={() => removeSet(i)}
                    className="text-[10px] text-gray-300 hover:text-red-400"
                  >
                    x
                  </button>
                )}
              </div>
              <input
                ref={i === 0 ? firstInputRef : (el) => { inputRefs.current[`${i}-team1`] = el }}
                type="number"
                inputMode="numeric"
                min={0}
                max={7}
                value={s.team1}
                onChange={(e) => updateSet(i, 'team1', e.target.value)}
                className="w-[60px] rounded-xl border border-gray-200 bg-teal-50 py-2.5 text-center text-[16px] font-bold text-teal-700 focus:outline-none focus:border-teal-400"
              />
              <span className="text-gray-300 text-sm">{'\u2014'}</span>
              <input
                ref={(el) => { inputRefs.current[`${i}-team2`] = el }}
                type="number"
                inputMode="numeric"
                min={0}
                max={7}
                value={s.team2}
                onChange={(e) => updateSet(i, 'team2', e.target.value)}
                className="w-[60px] rounded-xl border border-gray-200 bg-orange-50 py-2.5 text-center text-[16px] font-bold text-orange-600 focus:outline-none focus:border-orange-300"
              />
            </div>
            {/* Unusual score: neither team reaches 6 */}
            {s.team1 !== '' && s.team2 !== '' && Number(s.team1) < 6 && Number(s.team2) < 6 && (
              <div className="mt-2 ml-1">
                <input
                  type="text"
                  value={s.note ?? ''}
                  onChange={(e) => setSets(prev => prev.map((ss, j) => j === i ? { ...ss, note: e.target.value } : ss))}
                  placeholder="Match didn't finish? Add a note (optional)"
                  className="w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-gray-700 placeholder:text-amber-400 focus:outline-none focus:border-amber-300"
                />
              </div>
            )}
            {/* 7-6 or 6-7: tiebreak score required */}
            {is76 && (
              <div className="mt-2 ml-1">
                <div className="flex items-center gap-2 pl-2">
                  <span className="text-[11px] text-gray-400">Tie-break:</span>
                  <input
                    ref={(el) => { inputRefs.current[`tb-${i}-team1`] = el }}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={99}
                    value={s.tiebreak?.team1 ?? ''}
                    onChange={(e) => updateTiebreak(i, 'team1', e.target.value)}
                    className="w-[48px] rounded-lg border border-gray-200 bg-teal-50 py-1.5 text-center text-[14px] font-bold text-teal-700 focus:outline-none focus:border-teal-400"
                  />
                  <span className="text-gray-300 text-sm">{'\u2014'}</span>
                  <input
                    ref={(el) => { inputRefs.current[`tb-${i}-team2`] = el }}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={99}
                    value={s.tiebreak?.team2 ?? ''}
                    onChange={(e) => updateTiebreak(i, 'team2', e.target.value)}
                    className="w-[48px] rounded-lg border border-gray-200 bg-orange-50 py-1.5 text-center text-[14px] font-bold text-orange-600 focus:outline-none focus:border-orange-300"
                  />
                </div>
                {s.tiebreak && s.tiebreak.team1 === 0 && s.tiebreak.team2 === 0 && (
                  <p className="text-[11px] text-red-500 mt-1 pl-2">Tie-break can't be 0-0</p>
                )}
              </div>
            )}
            {isTied66 && (
              <div className="mt-2 ml-1">
                <div className="rounded-lg bg-teal-50 border border-teal-100 px-3 py-2 mb-2">
                  <p className="text-[12px] font-semibold text-teal-700">Set tied 6-6. How did it finish?</p>
                </div>
                <div className="flex gap-2 mb-2">
                  <button
                    onClick={() => setTiebreakMode(i, 'tiebreak')}
                    className={cn(
                      'flex-1 rounded-lg py-2 text-[12px] font-semibold border transition-colors',
                      s.tiebreak && !s.time_limit
                        ? 'bg-teal-50 border-teal-300 text-teal-700'
                        : 'border-gray-200 text-gray-500 hover:border-teal-200'
                    )}
                  >
                    Tiebreak played
                  </button>
                  <button
                    onClick={() => setTiebreakMode(i, 'time_limit')}
                    className={cn(
                      'flex-1 rounded-lg py-2 text-[12px] font-semibold border transition-colors',
                      s.time_limit
                        ? 'bg-orange-50 border-orange-300 text-orange-700'
                        : 'border-gray-200 text-gray-500 hover:border-orange-200'
                    )}
                  >
                    Finished on time
                  </button>
                </div>
                {s.tiebreak && !s.time_limit && (
                  <div className="flex items-center gap-2 pl-2">
                    <span className="text-[11px] text-gray-400">TB:</span>
                    <input
                      ref={(el) => { inputRefs.current[`tb-${i}-team1`] = el }}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={99}
                      value={s.tiebreak.team1}
                      onChange={(e) => updateTiebreak(i, 'team1', e.target.value)}
                      className="w-[48px] rounded-lg border border-gray-200 bg-teal-50 py-1.5 text-center text-[14px] font-bold text-teal-700 focus:outline-none focus:border-teal-400"
                    />
                    <span className="text-gray-300 text-sm">{'\u2014'}</span>
                    <input
                      ref={(el) => { inputRefs.current[`tb-${i}-team2`] = el }}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={99}
                      value={s.tiebreak.team2}
                      onChange={(e) => updateTiebreak(i, 'team2', e.target.value)}
                      className="w-[48px] rounded-lg border border-gray-200 bg-orange-50 py-1.5 text-center text-[14px] font-bold text-orange-600 focus:outline-none focus:border-orange-300"
                    />
                  </div>
                )}
                {s.time_limit && (
                  <p className="text-[11px] text-gray-400 italic pl-2">Drawn set — no winner</p>
                )}
              </div>
            )}
          </div>
        )
      })}

      {sets.length < 3 && (
        <button
          onClick={addSet}
          className="w-full rounded-xl border border-dashed border-gray-200 py-2.5 text-[12px] text-gray-400 hover:border-teal-300 hover:text-teal-600 transition-colors mb-3"
        >
          + Add set
        </button>
      )}

      {/* Live result indicator */}
      {resultType && (() => {
        const label = resultType === 'team1_win' ? `${team1Names} win`
          : resultType === 'team2_win' ? `${team2Names} win`
          : 'Draw / unfinished'
        const color = resultType === 'team1_win' ? 'text-teal-700 bg-teal-50'
          : resultType === 'team2_win' ? 'text-orange-600 bg-orange-50'
          : 'text-gray-600 bg-gray-50'
        return (
          <div className={cn('rounded-xl py-2 px-3 text-center text-[12px] font-bold mt-2 mb-1', color)}>
            {label}
          </div>
        )
      })()}
    </div>
  )
}
