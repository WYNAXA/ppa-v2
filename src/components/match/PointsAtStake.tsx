import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { ChevronDown, TrendingUp } from 'lucide-react'
import { previewMatchOutcomes } from '@/lib/eloPreview'
import type { Profile } from '@/lib/types'
import { cn } from '@/lib/utils'

/**
 * "Points at stake" — the ELO preview shown before a match is played.
 *
 * WHY IT LIVES HERE AND NOT INSIDE MatchDetail.tsx
 *   This is the single clearest thing the app does that Playtomic does not:
 *   every player can see exactly what the result will do to their rating
 *   *before* they walk on court, and can re-pair the teams and watch the
 *   numbers move. It was buried 3,400 lines into a 170KB page component, which
 *   made it un-reviewable and impossible to reuse on the pre-match card or in
 *   the match invite. It is its own component now.
 *
 * BUG FIXED IN THE MOVE
 *   The original called `useMemo` *after* an early `return` on the friendly
 *   case. That is a conditional hook: the moment a match flips friendly →
 *   competitive while mounted, React renders a different number of hooks and
 *   throws. The early return now happens after every hook has run.
 *
 * The arithmetic is untouched — it comes from lib/eloPreview.ts, which mirrors
 * the process-elo Edge Function. This component only presents it.
 */

type PlayerLike = Profile & {
  internal_ranking?: number | null
  matches_played?: number | null
}

export interface PointsAtStakeProps {
  team1Players: PlayerLike[]
  team2Players: PlayerLike[]
  isFriendly: boolean
  isLeagueMatch: boolean
  currentUserId: string
}

const fmtDelta = (d: number) => (d > 0 ? `+${d}` : `${d}`)

function deltaTone(d: number) {
  if (d > 0) return 'text-court'
  if (d < 0) return 'text-alert'
  return 'text-ink-2'
}

export function PointsAtStake({
  team1Players,
  team2Players,
  isFriendly,
  isLeagueMatch,
  currentUserId,
}: PointsAtStakeProps) {
  const { t } = useTranslation('', { keyPrefix: 'match' })
  const [showAll, setShowAll] = useState(false)

  const preview = useMemo(
    () =>
      previewMatchOutcomes(
        team1Players.map((p) => ({
          id: p.id,
          internal_ranking: p.internal_ranking,
          matches_played: p.matches_played,
        })),
        team2Players.map((p) => ({
          id: p.id,
          internal_ranking: p.internal_ranking,
          matches_played: p.matches_played,
        })),
        isLeagueMatch,
      ),
    [team1Players, team2Players, isLeagueMatch],
  )

  // Every hook above this line, always. See the note at the top of the file.
  if (isFriendly) {
    return (
      <p className="mt-3 text-center text-[11px] italic text-ink-3">
        {t('friendly_no_stakes')}
      </p>
    )
  }
  if (!preview) return null

  const stakes = preview
  const inTeam1 = team1Players.some((p) => p.id === currentUserId)
  const inTeam2 = team2Players.some((p) => p.id === currentUserId)
  const isParticipant = inTeam1 || inTeam2

  /** The player's own delta when they are playing, otherwise the team average. */
  function deltaFor(outcome: typeof stakes.team1Wins, teamNum: 1 | 2): number {
    const deltas = teamNum === 1 ? outcome.team1Deltas : outcome.team2Deltas
    const roster = teamNum === 1 ? team1Players : team2Players
    if (isParticipant) {
      const idx = roster.findIndex((p) => p.id === currentUserId)
      if (idx >= 0) return deltas[idx]
    }
    return Math.round(deltas.reduce((s, d) => s + d, 0) / deltas.length)
  }

  const lp = (outcome: typeof stakes.team1Wins, teamNum: 1 | 2) =>
    teamNum === 1 ? outcome.team1LeaguePts : outcome.team2LeaguePts

  const header = (
    <div className="mb-2.5 flex items-center gap-1.5">
      <TrendingUp className="h-3.5 w-3.5 text-court" />
      <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-2">
        {t('points_at_stake')}
      </p>
    </div>
  )

  const breakdown = (
    <>
      <button
        onClick={() => setShowAll((v) => !v)}
        className="mt-2 flex min-h-[44px] w-full items-center justify-center gap-1 text-[11px] font-semibold text-court"
        aria-expanded={showAll}
      >
        {showAll ? t('hide_all_players') : t('view_all_players')}
        <ChevronDown
          className={cn('h-3.5 w-3.5 transition-transform', showAll && 'rotate-180')}
        />
      </button>

      <AnimatePresence initial={false}>
        {showAll && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-1 space-y-2.5 border-t border-hairline pt-2.5">
              {(
                [
                  [t('team1_if_they_win'), team1Players, stakes.team1Wins.team1Deltas],
                  [t('team2_if_they_win'), team2Players, stakes.team2Wins.team2Deltas],
                ] as const
              ).map(([label, roster, deltas]) => (
                <div key={label}>
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.06em] text-ink-3">
                    {label}
                  </p>
                  {roster.map((p, i) => (
                    <div key={p.id} className="flex items-center justify-between py-0.5">
                      <span
                        className={cn(
                          'text-[13px]',
                          p.id === currentUserId
                            ? 'font-bold text-ink'
                            : 'text-ink-2',
                        )}
                      >
                        {p.name?.split(' ')[0]}
                      </span>
                      <span className={cn('num text-[13px] font-bold', deltaTone(deltas[i]))}>
                        {fmtDelta(deltas[i])}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )

  // ── Participant: three outcomes, from the player's own point of view ──────
  if (isParticipant) {
    const myTeam: 1 | 2 = inTeam1 ? 1 : 2
    const winOutcome = myTeam === 1 ? stakes.team1Wins : stakes.team2Wins
    const loseOutcome = myTeam === 1 ? stakes.team2Wins : stakes.team1Wins

    const rows = [
      { key: 'win',  label: t('if_you_win'),  d: deltaFor(winOutcome, myTeam),   pts: lp(winOutcome, myTeam),   lead: true },
      { key: 'draw', label: t('if_you_draw'), d: deltaFor(stakes.draw, myTeam),  pts: lp(stakes.draw, myTeam),  lead: false },
      { key: 'lose', label: t('if_you_lose'), d: deltaFor(loseOutcome, myTeam),  pts: lp(loseOutcome, myTeam),  lead: false },
    ]

    return (
      <div className="mt-3 rounded-panel border border-hairline bg-card p-3.5">
        {header}
        <div className="space-y-1">
          {rows.map((r) => (
            <div
              key={r.key}
              className={cn(
                'flex items-center justify-between rounded-control px-2.5 py-2',
                r.lead && 'bg-court-50',
              )}
            >
              <span
                className={cn(
                  'text-[13px]',
                  r.lead ? 'font-bold text-ink' : 'text-ink-2',
                )}
              >
                {r.label}
              </span>
              <span className="flex items-baseline gap-2.5">
                {/* `league_points_gain` is a *gain* string ("+3 league pts").
                    Rendering it for a zero result gives "+0 league pts", which
                    reads as a bug. A nil gain is simply not shown. */}
                {!!r.pts && (
                  <span className="text-[11px] font-semibold text-ink-3">
                    {t('league_points_gain', { count: r.pts })}
                  </span>
                )}
                <span
                  className={cn(
                    'num font-extrabold tabular-nums',
                    r.lead ? 'text-[22px] leading-none' : 'text-[17px] leading-none',
                    deltaTone(r.d),
                  )}
                >
                  {fmtDelta(r.d)}
                </span>
              </span>
            </div>
          ))}
        </div>

        {breakdown}

        {!isLeagueMatch && (
          <p className="mt-2 text-center text-[11px] italic text-ink-3">
            {t('not_yet_played')}
          </p>
        )}
      </div>
    )
  }

  // ── Spectator: what each side stands to gain ──────────────────────────────
  const t1 = deltaFor(stakes.team1Wins, 1)
  const t2 = deltaFor(stakes.team2Wins, 2)
  const t1Lp = stakes.team1Wins.team1LeaguePts
  const t2Lp = stakes.team2Wins.team2LeaguePts

  return (
    <div className="mt-3 rounded-panel border border-hairline bg-card p-3.5">
      {header}
      <div className="grid grid-cols-2 gap-2">
        {(
          [
            [t('team1_wins_label'), t1, t1Lp],
            [t('team2_wins_label'), t2, t2Lp],
          ] as const
        ).map(([label, d, pts]) => (
          <div key={label} className="rounded-control bg-surface px-3 py-2.5">
            <p className="text-[11px] font-semibold text-ink-3">{label}</p>
            <p className={cn('num mt-0.5 text-[19px] font-extrabold leading-none', deltaTone(d))}>
              {fmtDelta(d)}
            </p>
            {!!pts && (
              <p className="mt-1 text-[11px] font-semibold text-court">
                {t('league_points_gain', { count: pts })}
              </p>
            )}
          </div>
        ))}
      </div>

      {breakdown}

      {!isLeagueMatch && (
        <p className="mt-2 text-center text-[11px] italic text-ink-3">
          {t('not_yet_played')}
        </p>
      )}
    </div>
  )
}

export default PointsAtStake
