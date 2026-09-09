import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { previewMatchOutcomes } from '@/lib/eloPreview'
import type { Profile } from '@/lib/types'
import { cn } from '@/lib/utils'

/**
 * The pre-match block on Match detail — built to `Match.dc.html`.
 *
 * WHY THIS IS THE MOST IMPORTANT COMPONENT IN THE APP
 *   It is the one thing a booking app cannot answer: what this result will do
 *   to *your* number, before you walk on court, and what happens to it if you
 *   re-pair the four of you. Everything here is one screen: the win split, every
 *   player's swing both ways, and a live "swap these two and it's 58/42" line.
 *
 * The arithmetic is untouched — win probability from lib/predictions.ts, rating
 * deltas from lib/eloPreview.ts, which mirrors the process-elo Edge Function.
 * This component only presents them.
 *
 * It replaces the old TeamRow + PointsAtStakeSection pair, which also carried a
 * conditional-hook bug: `useMemo` sat after an early return on friendly
 * matches, so a match flipping friendly → competitive while mounted crashed
 * React. Every hook here runs before any return.
 */

type PlayerLike = Profile & {
  internal_ranking?: number | null
  matches_played?: number | null
}

export interface MatchStakesProps {
  team1Players: PlayerLike[]
  team2Players: PlayerLike[]
  /** Team 1's win probability, 0–100. */
  team1WinProb: number
  hasRankings: boolean
  isFriendly: boolean
  isLeagueMatch: boolean
  currentUserId: string
  /** Re-pair the four players. Absent when the viewer may not change teams. */
  onSwap?: () => void
  /** Team 1's win probability under the next pairing, and who moves. */
  swapPreview?: { team1WinProb: number; a: string; b: string } | null
}

const initials = (name?: string | null) => {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  return (parts.length === 1 ? parts[0][0] : parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const fmt = (d: number) => (d > 0 ? `+${d}` : `${d}`)

function SwapGlyph({ className, stroke }: { className?: string; stroke: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 16V4M7 4L4 7M7 4l3 3" />
      <path d="M17 8v12M17 20l3-3M17 20l-3-3" />
    </svg>
  )
}

function TeamCard({
  label, tone, players, currentUserId, swingFor, tRoot, tMatch,
}: {
  label: string
  tone: 'court' | 'muted'
  players: PlayerLike[]
  currentUserId: string
  swingFor: (p: PlayerLike) => { up: number; down: number } | null
  tRoot: (k: string) => string
  tMatch: (k: string, o?: Record<string, unknown>) => string
}) {
  return (
    <div className="flex flex-col gap-3 rounded-[16px] border border-hairline bg-card p-3.5">
      <p className={cn(
        'text-[12px] font-bold uppercase leading-[15px] tracking-[0.04em]',
        tone === 'court' ? 'text-court' : 'text-ink-2',
      )}>
        {label}
      </p>
      {players.map((p, i) => {
        const s = swingFor(p)
        const isMe = p.id === currentUserId
        return (
          <div key={p.id} className="flex flex-col gap-3">
            {i > 0 && <div className="h-px bg-hairline" />}
            <div className="flex items-center gap-[11px]">
              <span
                className={cn(
                  'flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-pill text-[12px] font-bold',
                  isMe ? 'bg-court text-white' : tone === 'court' ? 'bg-court-100 text-court-700' : 'bg-hairline text-ink-2',
                )}
              >
                {initials(p.name)}
              </span>
              <span className="flex min-w-0 flex-grow flex-col">
                <span className="truncate text-[15px] font-semibold leading-[19px] text-ink">
                  {isMe ? tRoot('common.you') : p.name?.split(' ')[0]}
                </span>
                <span className="num truncate text-[12px] leading-[15px] text-ink-2">
                  {[p.internal_ranking, p.matches_played != null ? tMatch('n_matches', { count: p.matches_played }) : null]
                    .filter((v) => v != null && v !== '')
                    .join(' · ')}
                </span>
              </span>
              {s && (
                <span className="flex flex-shrink-0 gap-1.5">
                  <span className="num rounded-[9px] bg-court-50 px-2.5 py-1.5 text-[13px] font-bold leading-4 text-court">
                    {fmt(s.up)}
                  </span>
                  <span className="num rounded-[9px] bg-alert-50 px-2.5 py-1.5 text-[13px] font-bold leading-4 text-alert">
                    {fmt(s.down)}
                  </span>
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function MatchStakes({
  team1Players,
  team2Players,
  team1WinProb,
  hasRankings,
  isFriendly,
  isLeagueMatch,
  currentUserId,
  onSwap,
  swapPreview,
}: MatchStakesProps) {
  const { t } = useTranslation('', { keyPrefix: 'match' })
  // `you` lives in the common namespace, not match.
  const { t: tRoot } = useTranslation()

  const preview = useMemo(
    () =>
      previewMatchOutcomes(
        team1Players.map((p) => ({ id: p.id, internal_ranking: p.internal_ranking, matches_played: p.matches_played })),
        team2Players.map((p) => ({ id: p.id, internal_ranking: p.internal_ranking, matches_played: p.matches_played })),
        isLeagueMatch,
      ),
    [team1Players, team2Players, isLeagueMatch],
  )

  // Every hook above this line, always.
  const inTeam1 = team1Players.some((p) => p.id === currentUserId)
  const inTeam2 = team2Players.some((p) => p.id === currentUserId)
  const isParticipant = inTeam1 || inTeam2

  /** Present it from the viewer's side when they are playing. */
  const mineFirst = !inTeam2
  const near = mineFirst ? team1Players : team2Players
  const far = mineFirst ? team2Players : team1Players
  const nearProb = mineFirst ? team1WinProb : 100 - team1WinProb
  const farProb = 100 - nearProb

  const verdict = Math.abs(nearProb - 50) <= 6
    ? t('stakes_even')
    : nearProb > 50 ? t('stakes_favoured') : t('stakes_underdog')

  const farLabel = far.map((p) => p.name?.split(' ')[0]).filter(Boolean).join(' & ')

  /** Rating swing for one player: what they gain if their side wins, lose if not. */
  function swing(p: PlayerLike, onNearSide: boolean): { up: number; down: number } | null {
    if (!preview) return null
    const teamIsOne = mineFirst ? onNearSide : !onNearSide
    const roster = teamIsOne ? team1Players : team2Players
    const idx = roster.findIndex((r) => r.id === p.id)
    if (idx < 0) return null
    const winOutcome = teamIsOne ? preview.team1Wins : preview.team2Wins
    const loseOutcome = teamIsOne ? preview.team2Wins : preview.team1Wins
    const pick = (o: typeof preview.team1Wins) => (teamIsOne ? o.team1Deltas : o.team2Deltas)[idx]
    return { up: pick(winOutcome), down: pick(loseOutcome) }
  }

  return (
    <div className="flex flex-col gap-4 px-5">
      {/* ── Win probability ── */}
      <div className="flex flex-col gap-3.5 rounded-panel bg-court p-[18px]">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-bold uppercase leading-[14px] tracking-[0.06em] text-court-100">
            {t('stakes_before_ball')}
          </p>
          {hasRankings && (
            <span className="rounded-pill bg-ball/[0.18] px-2 py-1 text-[11px] font-bold leading-[14px] text-ball">
              {verdict}
            </span>
          )}
        </div>

        {hasRankings ? (
          <>
            <div className="flex items-end justify-between gap-3">
              <div className="flex min-w-0 flex-col">
                <p className="num text-[36px] font-extrabold leading-9 text-white">{nearProb}%</p>
                <p className="truncate text-[12px] font-semibold leading-4 text-court-100">
                  {isParticipant ? t('stakes_your_team') : t('team1')}
                </p>
              </div>
              <div className="flex min-w-0 flex-col items-end">
                <p className="num text-[36px] font-extrabold leading-9 text-court-100/80">{farProb}%</p>
                <p className="truncate text-[12px] font-semibold leading-4 text-court-100">
                  {farLabel || t('team2')}
                </p>
              </div>
            </div>

            <div className="flex h-2 gap-0.5 overflow-hidden rounded-pill">
              <div className="rounded-pill bg-ball" style={{ width: `${nearProb}%` }} />
              <div className="flex-grow rounded-pill bg-white/[0.22]" />
            </div>
          </>
        ) : (
          <p className="text-[13px] leading-[18px] text-court-100">{t('predictions_unavailable')}</p>
        )}
      </div>

      {/* ── What's at stake ── */}
      {!isFriendly && preview && (
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[11px] font-bold uppercase leading-[14px] tracking-[0.06em] text-ink-2">
              {t('stakes_title')}
            </h3>
            {onSwap && (
              <button onClick={onSwap} className="flex min-h-[44px] items-center gap-1.5">
                <SwapGlyph className="h-3.5 w-3.5" stroke="var(--color-court)" />
                <span className="text-[13px] font-bold leading-4 text-court">{t('stakes_swap')}</span>
              </button>
            )}
          </div>

          <TeamCard
            label={isParticipant ? t('stakes_your_team') : t('team1')}
            tone="court"
            players={near}
            currentUserId={currentUserId}
            swingFor={(p) => swing(p, true)}
            tRoot={tRoot}
            tMatch={t}
          />
          <TeamCard
            label={isParticipant ? t('stakes_opponents') : t('team2')}
            tone="muted"
            players={far}
            currentUserId={currentUserId}
            swingFor={(p) => swing(p, false)}
            tRoot={tRoot}
            tMatch={t}
          />
        </div>
      )}

      {isFriendly && (
        <p className="text-center text-[13px] italic text-ink-2">{t('friendly_no_stakes')}</p>
      )}

      {/* ── What a swap would do ── */}
      {swapPreview && onSwap && (
        <button
          onClick={onSwap}
          className="flex items-center gap-[11px] rounded-[14px] bg-ink px-3.5 py-3 text-left"
        >
          <SwapGlyph className="h-[18px] w-[18px] flex-shrink-0" stroke="var(--color-ball)" />
          <span className="flex-grow text-[13px] leading-[18px] text-court-100">
            {t('stakes_swap_hint_prefix')}{' '}
            <span className="font-bold text-white">{swapPreview.a}</span>
            {' '}{t('stakes_swap_hint_and')}{' '}
            <span className="font-bold text-white">{swapPreview.b}</span>
            {' '}{t('stakes_swap_hint_suffix')}{' '}
            <span className="num font-bold text-ball">
              {mineFirst ? swapPreview.team1WinProb : 100 - swapPreview.team1WinProb}% /{' '}
              {mineFirst ? 100 - swapPreview.team1WinProb : swapPreview.team1WinProb}%
            </span>
          </span>
        </button>
      )}
    </div>
  )
}

export default MatchStakes
