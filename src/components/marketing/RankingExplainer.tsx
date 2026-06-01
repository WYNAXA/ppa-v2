import { useState, useMemo } from 'react'
import { ChevronDown } from 'lucide-react'

/* ── Mirror of the REAL ranking formula from supabase/functions/process-elo ── */

function calculateExpected(playerRating: number, opponentRating: number): number {
  return 1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400))
}

function calculateKFactor(matchesPlayed: number): number {
  if (matchesPlayed <= 20) return 40
  if (matchesPlayed <= 50) return 20
  if (matchesPlayed <= 200) return 10
  return 5
}

const EXPERIENCE_LABELS = [
  { label: 'New (≤20 matches)', matches: 10, k: 40 },
  { label: 'Learning (21–50)', matches: 35, k: 20 },
  { label: 'Regular (51–200)', matches: 100, k: 10 },
  { label: 'Veteran (200+)', matches: 250, k: 5 },
]

interface SetScore { team1: string; team2: string; played: boolean }

function isDominantWin(sets: SetScore[], winnerIsTeam1: boolean): boolean {
  const played = sets.filter((s) => s.played && s.team1 !== '' && s.team2 !== '')
  if (played.length === 0) return false
  return played.every((s) => {
    const a = parseInt(s.team1) || 0
    const b = parseInt(s.team2) || 0
    const diff = winnerIsTeam1 ? a - b : b - a
    return diff >= 5
  })
}

function determineResult(sets: SetScore[]): { team1Score: number; team2Score: number; result: 'team1' | 'team2' | 'draw' | null } {
  const played = sets.filter((s) => s.played && s.team1 !== '' && s.team2 !== '')
  if (played.length === 0) return { team1Score: 0, team2Score: 0, result: null }

  let t1Sets = 0
  let t2Sets = 0
  for (const s of played) {
    const a = parseInt(s.team1) || 0
    const b = parseInt(s.team2) || 0
    if (a > b) t1Sets++
    else if (b > a) t2Sets++
  }

  if (t1Sets > t2Sets) return { team1Score: 1, team2Score: 0, result: 'team1' }
  if (t2Sets > t1Sets) return { team1Score: 0, team2Score: 1, result: 'team2' }
  return { team1Score: 0.5, team2Score: 0.5, result: 'draw' }
}

function compute(
  playerRating: number,
  opponentAvgRating: number,
  matchesPlayed: number,
  actualScore: number,
  dominant: boolean,
) {
  const expected = calculateExpected(playerRating, opponentAvgRating)
  const kFactor = calculateKFactor(matchesPlayed)
  const raw = kFactor * (actualScore - expected)

  let multiplier = 1.0
  const isWin = actualScore === 1
  if (isWin) {
    if (expected < 0.15) multiplier *= 1.5
    else if (expected < 0.3) multiplier *= 1.25
  }
  if (dominant && isWin) multiplier *= 1.1

  const change = Math.round(raw * multiplier)
  const newRating = Math.max(0, Math.min(3000, playerRating + change))
  return { expected, kFactor, raw, multiplier, change, newRating }
}

/* ── Component ── */

export function RankingExplainer() {
  const [team1Rating1, setTeam1Rating1] = useState('1350')
  const [team1Rating2, setTeam1Rating2] = useState('1280')
  const [team2Rating1, setTeam2Rating1] = useState('1420')
  const [team2Rating2, setTeam2Rating2] = useState('1310')
  const [team1Exp, setTeam1Exp] = useState(1)
  const [team2Exp, setTeam2Exp] = useState(2)
  const [sets, setSets] = useState<SetScore[]>([
    { team1: '6', team2: '3', played: true },
    { team1: '4', team2: '6', played: true },
    { team1: '6', team2: '2', played: false },
  ])
  const [showBreakdown, setShowBreakdown] = useState(false)

  const updateSet = (i: number, field: 'team1' | 'team2' | 'played', val: string | boolean) => {
    setSets((prev) => prev.map((s, j) => (j === i ? { ...s, [field]: val } : s)))
  }

  const result = useMemo(() => {
    const t1Avg = ((parseInt(team1Rating1) || 1300) + (parseInt(team1Rating2) || 1300)) / 2
    const t2Avg = ((parseInt(team2Rating1) || 1300) + (parseInt(team2Rating2) || 1300)) / 2
    const { team1Score, team2Score, result: winner } = determineResult(sets)
    if (winner === null) return null

    const t1Matches = EXPERIENCE_LABELS[team1Exp].matches
    const t2Matches = EXPERIENCE_LABELS[team2Exp].matches

    const dominant1 = winner === 'team1' && isDominantWin(sets, true)
    const dominant2 = winner === 'team2' && isDominantWin(sets, false)

    const t1 = compute(t1Avg, t2Avg, t1Matches, team1Score, dominant1)
    const t2 = compute(t2Avg, t1Avg, t2Matches, team2Score, dominant2)

    return {
      t1Avg, t2Avg, t1Matches, t2Matches,
      team1Score, team2Score, winner,
      t1, t2, dominant1, dominant2,
    }
  }, [team1Rating1, team1Rating2, team2Rating1, team2Rating2, team1Exp, team2Exp, sets])

  return (
    <section id="ranking" className="bg-white py-16 sm:py-24 scroll-mt-20">
      <div className="mx-auto max-w-4xl px-5">
        <div className="text-center mb-10">
          <p className="text-[13px] font-semibold text-teal-600 uppercase tracking-wider mb-2">
            Transparent ranking
          </p>
          <h2 className="font-display text-[26px] sm:text-[36px] font-extrabold text-navy">
            See exactly how your rating changes
          </h2>
          <p className="text-[15px] text-gray-500 mt-3 max-w-xl mx-auto">
            Our ELO-based system is fully open. Adjust the inputs below to see how match results affect player ratings.
          </p>
        </div>

        {/* ── Inputs ── */}
        <div className="grid sm:grid-cols-2 gap-5 mb-6">
          {/* Team A */}
          <div className="rounded-2xl border border-teal-100 bg-teal-50/40 p-5">
            <h3 className="text-[14px] font-bold text-teal-700 mb-3">Team A</h3>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-[11px] font-medium text-gray-500 mb-1 block">Player 1 rating</label>
                <input
                  type="number"
                  min={0} max={3000}
                  value={team1Rating1}
                  onChange={(e) => setTeam1Rating1(e.target.value)}
                  className="w-full rounded-lg border border-teal-200 bg-white px-3 py-2 text-[14px] font-semibold text-navy outline-none focus:ring-2 focus:ring-teal-500/30"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-gray-500 mb-1 block">Player 2 rating</label>
                <input
                  type="number"
                  min={0} max={3000}
                  value={team1Rating2}
                  onChange={(e) => setTeam1Rating2(e.target.value)}
                  className="w-full rounded-lg border border-teal-200 bg-white px-3 py-2 text-[14px] font-semibold text-navy outline-none focus:ring-2 focus:ring-teal-500/30"
                />
              </div>
            </div>
            <label className="text-[11px] font-medium text-gray-500 mb-1 block">Experience level</label>
            <select
              value={team1Exp}
              onChange={(e) => setTeam1Exp(Number(e.target.value))}
              className="w-full rounded-lg border border-teal-200 bg-white px-3 py-2 text-[13px] text-navy outline-none focus:ring-2 focus:ring-teal-500/30"
            >
              {EXPERIENCE_LABELS.map((l, i) => (
                <option key={i} value={i}>{l.label} — K={l.k}</option>
              ))}
            </select>
          </div>

          {/* Team B */}
          <div className="rounded-2xl border border-orange-100 bg-orange-50/40 p-5">
            <h3 className="text-[14px] font-bold text-orange-700 mb-3">Team B</h3>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-[11px] font-medium text-gray-500 mb-1 block">Player 1 rating</label>
                <input
                  type="number"
                  min={0} max={3000}
                  value={team2Rating1}
                  onChange={(e) => setTeam2Rating1(e.target.value)}
                  className="w-full rounded-lg border border-orange-200 bg-white px-3 py-2 text-[14px] font-semibold text-navy outline-none focus:ring-2 focus:ring-orange-500/30"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-gray-500 mb-1 block">Player 2 rating</label>
                <input
                  type="number"
                  min={0} max={3000}
                  value={team2Rating2}
                  onChange={(e) => setTeam2Rating2(e.target.value)}
                  className="w-full rounded-lg border border-orange-200 bg-white px-3 py-2 text-[14px] font-semibold text-navy outline-none focus:ring-2 focus:ring-orange-500/30"
                />
              </div>
            </div>
            <label className="text-[11px] font-medium text-gray-500 mb-1 block">Experience level</label>
            <select
              value={team2Exp}
              onChange={(e) => setTeam2Exp(Number(e.target.value))}
              className="w-full rounded-lg border border-orange-200 bg-white px-3 py-2 text-[13px] text-navy outline-none focus:ring-2 focus:ring-orange-500/30"
            >
              {EXPERIENCE_LABELS.map((l, i) => (
                <option key={i} value={i}>{l.label} — K={l.k}</option>
              ))}
            </select>
          </div>
        </div>

        {/* ── Set scores ── */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5 mb-6 shadow-sm">
          <h3 className="text-[14px] font-bold text-navy mb-3">Score</h3>
          <div className="space-y-3">
            {sets.map((s, i) => (
              <div key={i} className="flex items-center gap-3">
                {i > 0 && (
                  <label className="flex items-center gap-2 cursor-pointer flex-shrink-0">
                    <input
                      type="checkbox"
                      checked={s.played}
                      onChange={(e) => updateSet(i, 'played', e.target.checked)}
                      className="rounded border-gray-300 text-teal-500 focus:ring-teal-500/30 h-4 w-4"
                    />
                    <span className="text-[12px] text-gray-500 w-12">Set {i + 1}</span>
                  </label>
                )}
                {i === 0 && (
                  <span className="text-[12px] text-gray-500 w-[76px] flex-shrink-0 pl-6">Set 1</span>
                )}
                <div className={`flex items-center gap-2 flex-1 ${!s.played && i > 0 ? 'opacity-30 pointer-events-none' : ''}`}>
                  <input
                    type="number" min={0} max={7}
                    value={s.team1}
                    onChange={(e) => updateSet(i, 'team1', e.target.value)}
                    className="w-14 text-center rounded-lg border border-teal-200 px-2 py-1.5 text-[14px] font-bold text-teal-700 outline-none focus:ring-2 focus:ring-teal-500/30"
                    placeholder="A"
                  />
                  <span className="text-[12px] text-gray-400">–</span>
                  <input
                    type="number" min={0} max={7}
                    value={s.team2}
                    onChange={(e) => updateSet(i, 'team2', e.target.value)}
                    className="w-14 text-center rounded-lg border border-orange-200 px-2 py-1.5 text-[14px] font-bold text-orange-700 outline-none focus:ring-2 focus:ring-orange-500/30"
                    placeholder="B"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Results ── */}
        {result && (
          <>
            <div className="grid sm:grid-cols-2 gap-5 mb-6">
              {/* Team A result */}
              <div className={`rounded-2xl p-5 border ${
                result.winner === 'team1' ? 'border-teal-200 bg-teal-50/60' :
                result.winner === 'draw' ? 'border-gray-200 bg-gray-50' :
                'border-gray-200 bg-gray-50'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[12px] font-bold uppercase tracking-wider text-teal-600">Team A</span>
                  <span className={`text-[12px] font-bold uppercase tracking-wider ${
                    result.winner === 'team1' ? 'text-teal-600' :
                    result.winner === 'draw' ? 'text-gray-500' : 'text-gray-400'
                  }`}>
                    {result.winner === 'team1' ? 'WON' : result.winner === 'draw' ? 'DRAW' : 'LOST'}
                  </span>
                </div>
                <div className="flex items-baseline gap-3">
                  <span className="text-[13px] text-gray-500">Avg {Math.round(result.t1Avg)}</span>
                  <span className={`text-[24px] font-extrabold ${result.t1.change >= 0 ? 'text-teal-600' : 'text-orange-600'}`}>
                    {result.t1.change >= 0 ? '+' : ''}{result.t1.change}
                  </span>
                  <span className="text-[13px] text-gray-400">→ {result.t1.newRating}</span>
                </div>
              </div>
              {/* Team B result */}
              <div className={`rounded-2xl p-5 border ${
                result.winner === 'team2' ? 'border-orange-200 bg-orange-50/60' :
                result.winner === 'draw' ? 'border-gray-200 bg-gray-50' :
                'border-gray-200 bg-gray-50'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[12px] font-bold uppercase tracking-wider text-orange-600">Team B</span>
                  <span className={`text-[12px] font-bold uppercase tracking-wider ${
                    result.winner === 'team2' ? 'text-orange-600' :
                    result.winner === 'draw' ? 'text-gray-500' : 'text-gray-400'
                  }`}>
                    {result.winner === 'team2' ? 'WON' : result.winner === 'draw' ? 'DRAW' : 'LOST'}
                  </span>
                </div>
                <div className="flex items-baseline gap-3">
                  <span className="text-[13px] text-gray-500">Avg {Math.round(result.t2Avg)}</span>
                  <span className={`text-[24px] font-extrabold ${result.t2.change >= 0 ? 'text-teal-600' : 'text-orange-600'}`}>
                    {result.t2.change >= 0 ? '+' : ''}{result.t2.change}
                  </span>
                  <span className="text-[13px] text-gray-400">→ {result.t2.newRating}</span>
                </div>
              </div>
            </div>

            {/* Pending note */}
            <p className="text-[12px] text-gray-400 text-center mb-6 italic">
              While your result is pending, this is your estimated change. It confirms once verified by the other players — or automatically after 24 hours if unchallenged.
            </p>

            {/* ── Collapsible breakdown ── */}
            <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden mb-8">
              <button
                onClick={() => setShowBreakdown((v) => !v)}
                className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
              >
                <span className="text-[14px] font-bold text-navy">How was this calculated?</span>
                <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${showBreakdown ? 'rotate-180' : ''}`} />
              </button>
              {showBreakdown && (
                <div className="px-5 pb-5 text-[13px] text-gray-600 leading-relaxed space-y-4 border-t border-gray-100 pt-4">
                  {/* Step 1 */}
                  <div>
                    <p className="font-semibold text-navy mb-1">1. Expected outcome</p>
                    <p>Team A avg rating: <strong>{Math.round(result.t1Avg)}</strong> — Team B avg: <strong>{Math.round(result.t2Avg)}</strong></p>
                    <p>Team A expected win probability: <strong>{(result.t1.expected * 100).toFixed(1)}%</strong></p>
                    <p className="text-[11px] text-gray-400 mt-1">E = 1 / (1 + 10<sup>(opponent − player) / 400</sup>)</p>
                  </div>
                  {/* Step 2 */}
                  <div>
                    <p className="font-semibold text-navy mb-1">2. K-factor (volatility)</p>
                    <p>Team A: K = <strong>{result.t1.kFactor}</strong> ({EXPERIENCE_LABELS[team1Exp].label})</p>
                    <p>Team B: K = <strong>{result.t2.kFactor}</strong> ({EXPERIENCE_LABELS[team2Exp].label})</p>
                    <p className="text-[11px] text-gray-400 mt-1">New players (≤20 matches) have K=40 so ratings settle quickly; veterans (200+) have K=5 for stability.</p>
                  </div>
                  {/* Step 3 */}
                  <div>
                    <p className="font-semibold text-navy mb-1">3. Bonuses</p>
                    {result.t1.multiplier > 1 || result.t2.multiplier > 1 ? (
                      <>
                        {result.dominant1 && <p>Team A: <strong>Dominant win</strong> (every set ≥5 games margin) → ×1.1</p>}
                        {result.dominant2 && <p>Team B: <strong>Dominant win</strong> → ×1.1</p>}
                        {result.winner === 'team1' && result.t1.expected < 0.3 && (
                          <p>Team A: <strong>Upset win</strong> (expected {(result.t1.expected * 100).toFixed(1)}%) → ×{result.t1.expected < 0.15 ? '1.5' : '1.25'}</p>
                        )}
                        {result.winner === 'team2' && result.t2.expected < 0.3 && (
                          <p>Team B: <strong>Upset win</strong> (expected {(result.t2.expected * 100).toFixed(1)}%) → ×{result.t2.expected < 0.15 ? '1.5' : '1.25'}</p>
                        )}
                      </>
                    ) : (
                      <p>No bonuses applied (no upset or dominant win).</p>
                    )}
                  </div>
                  {/* Step 4 */}
                  <div>
                    <p className="font-semibold text-navy mb-1">4. Final change</p>
                    <p>Team A: round({result.t1.kFactor} × ({result.team1Score} − {result.t1.expected.toFixed(3)}) × {result.t1.multiplier.toFixed(2)}) = <strong className={result.t1.change >= 0 ? 'text-teal-600' : 'text-orange-600'}>{result.t1.change >= 0 ? '+' : ''}{result.t1.change}</strong></p>
                    <p>Team B: round({result.t2.kFactor} × ({result.team2Score} − {result.t2.expected.toFixed(3)}) × {result.t2.multiplier.toFixed(2)}) = <strong className={result.t2.change >= 0 ? 'text-teal-600' : 'text-orange-600'}>{result.t2.change >= 0 ? '+' : ''}{result.t2.change}</strong></p>
                    <p className="text-[11px] text-gray-400 mt-1">Ratings are clamped between 0 and 3000.</p>
                  </div>
                </div>
              )}
            </div>

            {/* ── How it works plain-language + comparison ── */}
            <div className="grid sm:grid-cols-2 gap-5">
              <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <h4 className="text-[14px] font-bold text-navy mb-3">How it works</h4>
                <ol className="space-y-2 text-[13px] text-gray-600">
                  <li className="flex gap-2"><span className="text-teal-600 font-bold flex-shrink-0">1.</span>We calculate the expected outcome based on both teams' average rating.</li>
                  <li className="flex gap-2"><span className="text-teal-600 font-bold flex-shrink-0">2.</span>Your K-factor (how much ratings can move) depends on how many matches you've played.</li>
                  <li className="flex gap-2"><span className="text-teal-600 font-bold flex-shrink-0">3.</span>If you won against the odds or dominated every set, you earn a bonus multiplier.</li>
                  <li className="flex gap-2"><span className="text-teal-600 font-bold flex-shrink-0">4.</span>The final change is applied to each player's individual rating.</li>
                </ol>
              </div>
              <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <h4 className="text-[14px] font-bold text-navy mb-3">What makes this different</h4>
                <ul className="space-y-2 text-[13px] text-gray-600">
                  {[
                    'Opponent strength affects your change — beat a stronger team, gain more',
                    'Score margin matters — dominating every set earns a bonus',
                    'Experience-based volatility — new players settle faster',
                    'Real-time preview while your result is pending verification',
                    'Fully transparent — every number shown, nothing hidden',
                  ].map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="text-teal-500 flex-shrink-0">✓</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
