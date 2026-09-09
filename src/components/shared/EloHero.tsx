import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { experienceTier } from '@/lib/eloPreview'
import { cn } from '@/lib/utils'

/**
 * The Me hero — built to `Me.dc.html`.
 *
 * The rating is the product. It gets the whole card: the number at 44px on
 * `ink`, the recent trend as a sparkline in `line`, the last five results as
 * chips, and the K-factor tier spelled out — because "Regular · K10" is the
 * honest answer to "why did I only gain 4 points", and no other padel app
 * shows it at all.
 *
 * `experienceTier` comes from lib/eloPreview.ts, which mirrors the K-factor
 * tiers in the process-elo Edge Function. Nothing here recomputes ELO.
 */

const initials = (name?: string | null) => {
  if (!name) return '?'
  const p = name.trim().split(/\s+/)
  return (p.length === 1 ? p[0][0] : p[0][0] + p[p.length - 1][0]).toUpperCase()
}

/** Last ~12 verified rating points — enough to show a shape, not a chart. */
function useRatingTrend(userId: string) {
  return useQuery<number[]>({
    queryKey: ['elo-hero-trend', userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('rating_history')
        .select('rating_after, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(12)
      return (data ?? []).map((r) => r.rating_after as number).reverse()
    },
  })
}

function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null
  const W = 310
  const H = 54
  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = max - min || 1
  const step = W / (points.length - 1)
  const d = points
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)} ${(H - 6 - ((v - min) / span) * (H - 14)).toFixed(1)}`)
    .join(' ')
  const lastX = W
  const lastY = H - 6 - ((points[points.length - 1] - min) / span) * (H - 14)

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      fill="none"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d={d} stroke="var(--color-line)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX - 4} cy={lastY} r="4.5" fill="var(--color-ball)" />
    </svg>
  )
}

export interface EloHeroProps {
  userId: string
  name?: string | null
  avatarUrl?: string | null
  /** "BS3 Padel · Bristol" — whatever context the profile actually has. */
  subtitle?: string | null
  elo?: number | null
  isProvisional?: boolean
  matchesPlayed?: number | null
  /** Most recent first; only the last five are shown. */
  recentResults?: Array<'win' | 'loss' | 'draw' | null>
  onEdit?: () => void
}

export function EloHero({
  userId, name, avatarUrl, subtitle, elo, isProvisional,
  matchesPlayed, recentResults = [], onEdit,
}: EloHeroProps) {
  const { t } = useTranslation()
  const { data: trend = [] } = useRatingTrend(userId)

  // The board shows the swing over the visible window, not all time.
  const delta = trend.length >= 2 ? trend[trend.length - 1] - trend[0] : 0
  const tier = experienceTier(matchesPlayed ?? 0)
  const form = recentResults.slice(0, 5).reverse()

  return (
    <div className="flex flex-col gap-4 rounded-[20px] bg-ink p-5">
      <div className="flex items-center gap-[13px]">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="h-[52px] w-[52px] flex-shrink-0 rounded-pill object-cover" />
        ) : (
          <span className="flex h-[52px] w-[52px] flex-shrink-0 items-center justify-center rounded-pill bg-court text-[18px] font-bold text-white">
            {initials(name)}
          </span>
        )}
        <span className="flex min-w-0 flex-grow flex-col gap-0.5">
          <span className="truncate text-[19px] font-bold leading-[23px] text-white">
            {name?.split(' ')[0] ?? '—'}
          </span>
          {subtitle && (
            <span className="truncate text-[13px] leading-[17px] text-ink-4">{subtitle}</span>
          )}
        </span>
        {onEdit && (
          <button
            onClick={onEdit}
            aria-label={t('you.edit_profile_aria')}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-pill bg-white/10"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
            </svg>
          </button>
        )}
      </div>

      <div className="flex items-end gap-3.5">
        <div className="flex flex-col gap-px">
          <p className="num text-[44px] font-extrabold leading-[44px] tracking-[-0.02em] text-white">
            {elo != null ? elo.toLocaleString() : '—'}
          </p>
          <p className="text-[12px] font-semibold uppercase leading-4 tracking-[0.04em] text-ink-4">
            {isProvisional ? t('you.provisional_elo') : t('you.career_elo')}
          </p>
        </div>
        {delta !== 0 && (
          <span
            className={cn(
              'mb-[22px] flex items-center gap-1.5 rounded-pill px-2.5 py-1.5',
              delta > 0 ? 'bg-ball/[0.14]' : 'bg-white/[0.10]',
            )}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke={delta > 0 ? 'var(--color-ball)' : '#B6C0BB'}
              strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
              className={delta > 0 ? '' : 'rotate-180'}>
              <path d="M6 15l6-6 6 6" />
            </svg>
            <span className={cn('num text-[13px] font-bold leading-4', delta > 0 ? 'text-ball' : 'text-ink-4')}>
              {Math.abs(delta)}
            </span>
          </span>
        )}
      </div>

      {trend.length >= 2 && (
        <div className="h-[54px]">
          <Sparkline points={trend} />
        </div>
      )}

      <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-3.5">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-[12px] leading-[15px] text-ink-4">{t('you.experience_tier')}</p>
          <p className="truncate text-[14px] font-bold leading-[18px] text-white">
            {t(tier.nameKey)} · K{tier.k}
          </p>
        </div>
        {form.length > 0 && (
          <div className="flex flex-shrink-0 gap-1">
            {form.map((r, i) => (
              <span
                key={i}
                className={cn(
                  'flex h-[26px] w-[26px] items-center justify-center rounded-[8px] text-[11px] font-extrabold',
                  r === 'win' ? 'bg-line text-[#05302B]' : 'bg-white/[0.14] text-ink-4',
                )}
              >
                {r === 'win' ? t('you.form_w') : r === 'draw' ? t('you.form_d') : t('you.form_l')}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default EloHero
