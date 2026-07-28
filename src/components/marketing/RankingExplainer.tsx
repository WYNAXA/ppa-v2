import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
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
  { labelKey: 'ranking.exp_new', matches: 10, k: 40 },
  { labelKey: 'ranking.exp_learning', matches: 35, k: 20 },
  { labelKey: 'ranking.exp_regular', matches: 100, k: 10 },
  { labelKey: 'ranking.exp_veteran', matches: 250, k: 5 },
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
  const { t } = useTranslation()
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
            {t('ranking.transparent_ranking')}
          </p>
          <h2 className="font-display text-[26px] sm:text-[36px] font-extrabold text-navy">
            {t('ranking.see_how_rating_changes')}
          </h2>
          <p className="text-[15px] text-gray-500 mt-3 max-w-xl mx-auto">
            {t('ranking.system_description')}
          </p>
        </div>

        {/* ── Inputs ── */}
        <div className="grid sm:grid-cols-2 gap-5 mb-6">
          {/* Team A */}
          <div className="rounded-2xl border border-teal-100 bg-teal-50/40 p-5">
            <h3 className="text-[14px] font-bold text-teal-700 mb-3">{t('ranking.team_a')}</h3>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-[11px] font-medium text-gray-500 mb-1 block">{t('ranking.player_1_rating')}</label>
                <input
                  type="number"
                  min={0} max={3000}
                  value={team1Rating1}
                  onChange={(e) => setTeam1Rating1(e.target.value)}
                  className="w-full rounded-lg border border-teal-200 bg-white px-3 py-2 text-[14px] font-semibold text-navy outline-none focus:ring-2 focus:ring-teal-500/30"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-gray-500 mb-1 block">{t('ranking.player_2_rating')}</label>
                <input
                  type="number"
                  min={0} max={3000}
                  value={team1Rating2}
                  onChange={(e) => setTeam1Rating2(e.target.value)}
                  className="w-full rounded-lg border border-teal-200 bg-white px-3 py-2 text-[14px] font-semibold text-navy outline-none focus:ring-2 focus:ring-teal-500/30"
                />
              </div>
            </div>
            <label className="text-[11px] font-medium text-gray-500 mb-1 block">{t('ranking.experience_level')}</label>
            <select
              value={team1Exp}
              onChange={(e) => setTeam1Exp(Number(e.target.value))}
              className="w-full rounded-lg border border-teal-200 bg-white px-3 py-2 text-[13px] text-navy outline-none focus:ring-2 focus:ring-teal-500/30"
            >
              {EXPERIENCE_LABELS.map((l, i) => (
                <option key={i} value={i}>{t(l.labelKey)} — K={l.k}</option>
              ))}
            </select>
          </div>

          {/* Team B */}
          <div className="rounded-2xl border border-orange-100 bg-orange-50/40 p-5">
            <h3 className="text-[14px] font-bold text-orange-700 mb-3">{t('ranking.team_b')}</h3>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-[11px] font-medium text-gray-500 mb-1 block">{t('ranking.player_1_rating')}</label>
                <input
                  type="number"
                  min={0} max={3000}
                  value={team2Rating1}
                  onChange={(e) => setTeam2Rating1(e.target.value)}
                  className="w-full rounded-lg border border-orange-200 bg-white px-3 py-2 text-[14px] font-semibold text-navy outline-none focus:ring-2 focus:ring-orange-500/30"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-gray-500 mb-1 block">{t('ranking.player_2_rating')}</label>
                <input
                  type="number"
                  min={0} max={3000}
                  value={team2Rating2}
                  onChange={(e) => setTeam2Rating2(e.target.value)}
                  className="w-full rounded-lg border border-orange-200 bg-white px-3 py-2 text-[14px] font-semibold text-navy outline-none focus:ring-2 focus:ring-orange-500/30"
                />
              </div>
            </div>
            <label className="text-[11px] font-medium text-gray-500 mb-1 block">{t('ranking.experience_level')}</label>
            <select
              value={team2Exp}
              onChange={(e) => setTeam2Exp(Number(e.target.value))}
              className="w-full rounded-lg border border-orange-200 bg-white px-3 py-2 text-[13px] text-navy outline-none focus:ring-2 focus:ring-orange-500/30"
            >
              {EXPERIENCE_LABELS.map((l, i) => (
                <option key={i} value={i}>{t(l.labelKey)} — K={l.k}</option>
              ))}
            </select>
          </div>
        </div>

        {/* ── Set scores — side by side on wider screens ── */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5 mb-6 shadow-sm">
          <h3 className="text-[14px] font-bold text-navy mb-3">{t('ranking.score')}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {sets.map((s, i) => (
              <div key={i} className="flex flex-col gap-2">
                {i > 0 ? (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={s.played}
                      onChange={(e) => updateSet(i, 'played', e.target.checked)}
                      className="rounded border-gray-300 text-teal-500 focus:ring-teal-500/30 h-4 w-4"
                    />
                    <span className="text-[12px] font-medium text-gray-500">{t('ranking.set_number', { number: i + 1 })}</span>
                  </label>
                ) : (
                  <span className="text-[12px] font-medium text-gray-500 pl-0.5">{t('ranking.set_number', { number: 1 })}</span>
                )}
                <div className={`flex items-center gap-2 ${!s.played && i > 0 ? 'opacity-30 pointer-events-none' : ''}`}>
                  <input
                    type="number" min={0} max={7}
                    value={s.team1}
                    onChange={(e) => updateSet(i, 'team1', e.target.value)}
                    className="w-full text-center rounded-lg border border-teal-200 px-2 py-2 text-[14px] font-bold text-teal-700 outline-none focus:ring-2 focus:ring-teal-500/30"
                    placeholder="A"
                  />
                  <span className="text-[12px] text-gray-400 flex-shrink-0">–</span>
                  <input
                    type="number" min={0} max={7}
                    value={s.team2}
                    onChange={(e) => updateSet(i, 'team2', e.target.value)}
                    className="w-full text-center rounded-lg border border-orange-200 px-2 py-2 text-[14px] font-bold text-orange-700 outline-none focus:ring-2 focus:ring-orange-500/30"
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
                  <span className="text-[12px] font-bold uppercase tracking-wider text-teal-600">{t('ranking.team_a')}</span>
                  <span className={`text-[12px] font-bold uppercase tracking-wider ${
                    result.winner === 'team1' ? 'text-teal-600' :
                    result.winner === 'draw' ? 'text-gray-500' : 'text-gray-400'
                  }`}>
                    {result.winner === 'team1' ? t('ranking.won') : result.winner === 'draw' ? t('ranking.draw') : t('ranking.lost')}
                  </span>
                </div>
                <div className="flex items-baseline gap-3">
                  <span className="text-[13px] text-gray-500">{t('ranking.avg_rating', { rating: Math.round(result.t1Avg) })}</span>
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
                  <span className="text-[12px] font-bold uppercase tracking-wider text-orange-600">{t('ranking.team_b')}</span>
                  <span className={`text-[12px] font-bold uppercase tracking-wider ${
                    result.winner === 'team2' ? 'text-orange-600' :
                    result.winner === 'draw' ? 'text-gray-500' : 'text-gray-400'
                  }`}>
                    {result.winner === 'team2' ? t('ranking.won') : result.winner === 'draw' ? t('ranking.draw') : t('ranking.lost')}
                  </span>
                </div>
                <div className="flex items-baseline gap-3">
                  <span className="text-[13px] text-gray-500">{t('ranking.avg_rating', { rating: Math.round(result.t2Avg) })}</span>
                  <span className={`text-[24px] font-extrabold ${result.t2.change >= 0 ? 'text-teal-600' : 'text-orange-600'}`}>
                    {result.t2.change >= 0 ? '+' : ''}{result.t2.change}
                  </span>
                  <span className="text-[13px] text-gray-400">→ {result.t2.newRating}</span>
                </div>
              </div>
            </div>

            {/* Pending note */}
            <p className="text-[12px] text-gray-400 text-center mb-6 italic">
              {t('ranking.pending_note')}
            </p>

            {/* ── Collapsible breakdown ── */}
            <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden mb-8">
              <button
                onClick={() => setShowBreakdown((v) => !v)}
                className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
              >
                <span className="text-[14px] font-bold text-navy">{t('ranking.how_calculated')}</span>
                <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${showBreakdown ? 'rotate-180' : ''}`} />
              </button>
              {showBreakdown && (
                <div className="px-5 pb-5 text-[13px] text-gray-600 leading-relaxed space-y-4 border-t border-gray-100 pt-4">
                  {/* Step 1 */}
                  <div>
                    <p className="font-semibold text-navy mb-1">{t('ranking.step_expected')}</p>
                    <p>{t('ranking.team_avg_ratings', { ratingA: Math.round(result.t1Avg), ratingB: Math.round(result.t2Avg) })}</p>
                    <p>{t('ranking.expected_win_prob', { team: t('ranking.team_a'), prob: (result.t1.expected * 100).toFixed(1) })}</p>
                    <p className="text-[11px] text-gray-400 mt-1">E = 1 / (1 + 10<sup>(opponent − player) / 400</sup>)</p>
                  </div>
                  {/* Step 2 */}
                  <div>
                    <p className="font-semibold text-navy mb-1">{t('ranking.step_kfactor')}</p>
                    <p>{t('ranking.team_a')}: K = <strong>{result.t1.kFactor}</strong> ({t(EXPERIENCE_LABELS[team1Exp].labelKey)})</p>
                    <p>{t('ranking.team_b')}: K = <strong>{result.t2.kFactor}</strong> ({t(EXPERIENCE_LABELS[team2Exp].labelKey)})</p>
                    <p className="text-[11px] text-gray-400 mt-1">{t('ranking.kfactor_explanation')}</p>
                  </div>
                  {/* Step 3 */}
                  <div>
                    <p className="font-semibold text-navy mb-1">{t('ranking.step_bonuses')}</p>
                    {result.t1.multiplier > 1 || result.t2.multiplier > 1 ? (
                      <>
                        {result.dominant1 && <p>{t('ranking.team_a')}: <strong>{t('ranking.dominant_win')}</strong> (every set ≥5 games margin) → ×1.1</p>}
                        {result.dominant2 && <p>{t('ranking.team_b')}: <strong>{t('ranking.dominant_win')}</strong> → ×1.1</p>}
                        {result.winner === 'team1' && result.t1.expected < 0.3 && (
                          <p>{t('ranking.team_a')}: <strong>{t('ranking.upset_win')}</strong> (expected {(result.t1.expected * 100).toFixed(1)}%) → ×{result.t1.expected < 0.15 ? '1.5' : '1.25'}</p>
                        )}
                        {result.winner === 'team2' && result.t2.expected < 0.3 && (
                          <p>{t('ranking.team_b')}: <strong>{t('ranking.upset_win')}</strong> (expected {(result.t2.expected * 100).toFixed(1)}%) → ×{result.t2.expected < 0.15 ? '1.5' : '1.25'}</p>
                        )}
                      </>
                    ) : (
                      <p>{t('ranking.no_bonuses')}</p>
                    )}
                  </div>
                  {/* Step 4 */}
                  <div>
                    <p className="font-semibold text-navy mb-1">{t('ranking.step_final')}</p>
                    <p>Team A: round({result.t1.kFactor} × ({result.team1Score} − {result.t1.expected.toFixed(3)}) × {result.t1.multiplier.toFixed(2)}) = <strong className={result.t1.change >= 0 ? 'text-teal-600' : 'text-orange-600'}>{result.t1.change >= 0 ? '+' : ''}{result.t1.change}</strong></p>
                    <p>Team B: round({result.t2.kFactor} × ({result.team2Score} − {result.t2.expected.toFixed(3)}) × {result.t2.multiplier.toFixed(2)}) = <strong className={result.t2.change >= 0 ? 'text-teal-600' : 'text-orange-600'}>{result.t2.change >= 0 ? '+' : ''}{result.t2.change}</strong></p>
                    <p className="text-[11px] text-gray-400 mt-1">{t('ranking.ratings_clamped')}</p>
                  </div>
                </div>
              )}
            </div>

            {/* ── How it works plain-language + comparison ── */}
            <div className="grid sm:grid-cols-2 gap-5">
              <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <h4 className="text-[14px] font-bold text-navy mb-3">{t('ranking.how_it_works')}</h4>
                <ol className="space-y-2 text-[13px] text-gray-600">
                  <li className="flex gap-2"><span className="text-teal-600 font-bold flex-shrink-0">1.</span>{t('ranking.how_step_1')}</li>
                  <li className="flex gap-2"><span className="text-teal-600 font-bold flex-shrink-0">2.</span>{t('ranking.how_step_2')}</li>
                  <li className="flex gap-2"><span className="text-teal-600 font-bold flex-shrink-0">3.</span>{t('ranking.how_step_3')}</li>
                  <li className="flex gap-2"><span className="text-teal-600 font-bold flex-shrink-0">4.</span>{t('ranking.how_step_4')}</li>
                </ol>
              </div>
              <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <h4 className="text-[14px] font-bold text-navy mb-3">{t('ranking.what_makes_different')}</h4>
                <ul className="space-y-2 text-[13px] text-gray-600">
                  {[
                    'ranking.diff_opponent_strength',
                    'ranking.diff_score_margin',
                    'ranking.diff_experience_volatility',
                    'ranking.diff_realtime_preview',
                    'ranking.diff_fully_transparent',
                  ].map((key) => (
                    <li key={key} className="flex gap-2">
                      <span className="text-teal-500 flex-shrink-0">✓</span>
                      {t(key)}
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
