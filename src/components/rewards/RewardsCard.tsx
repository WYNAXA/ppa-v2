import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { getDateLocale } from '@/lib/dateLocale'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

interface VenueReward {
  id: string
  reward_type: 'free_drink' | 'free_game_share'
  status: string
  redemption_code: string
  expires_at: string | null
}

export interface RewardsCardProps {
  venueId: string
  venueName: string
  userId: string
  compact?: boolean
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STAMPS_PER_DRINK = 6
// 12 stamps = free game share (second tier)

// ── Stamp dot ────────────────────────────────────────────────────────────────

function StampDot({ filled }: { filled: boolean }) {
  return (
    <div
      className={cn(
        'h-8 w-8 rounded-full flex items-center justify-center border-2 transition-colors',
        filled
          ? 'bg-court border-court'
          : 'bg-hairline border-hairline'
      )}
    >
      {filled && (
        <span className="text-white text-[14px] leading-none select-none">🎾</span>
      )}
    </div>
  )
}

// ── Reward banner ─────────────────────────────────────────────────────────────

function RewardBanner({ reward }: { reward: VenueReward }) {
  const label = reward.reward_type === 'free_drink' ? '🥤 FREE DRINK AVAILABLE!' : '🎾 FREE GAME SHARE AVAILABLE!'
  const expires = reward.expires_at
    ? (() => { try { return format(parseISO(reward.expires_at), 'd MMM yyyy', { locale: getDateLocale() }) } catch { return null } })()
    : null

  return (
    <div className="rounded-xl bg-court-50 border border-court-100 px-3 py-3 mt-3">
      <p className="text-[12px] font-black text-court-700 mb-1.5">{label}</p>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <p className="text-[11px] text-court mb-0.5">Redemption code</p>
          <p className="text-[16px] font-black text-court-700 tracking-widest">{reward.redemption_code}</p>
        </div>
        {expires && (
          <p className="text-[11px] text-court">Expires {expires}</p>
        )}
      </div>
      <p className="text-[11px] text-court mt-2">Show this code at the venue to claim your reward.</p>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function RewardsCard({ venueId, venueName, userId, compact = false }: RewardsCardProps) {
  const navigate = useNavigate()

  const { data: wallet } = useQuery({
    queryKey: ['wallet', userId, venueId],
    queryFn: async () => {
      const { data } = await supabase
        .from('user_venue_stamps')
        .select('stamp_count, lifetime_stamps')
        .eq('user_id', userId)
        .eq('venue_id', venueId)
        .maybeSingle()
      return data as { stamp_count: number; lifetime_stamps: number } | null
    },
  })

  const { data: rewards = [] } = useQuery({
    queryKey: ['venue-rewards', userId, venueId],
    queryFn: async () => {
      const { data } = await supabase
        .from('venue_rewards')
        .select('*')
        .eq('user_id', userId)
        .eq('venue_id', venueId)
        .eq('status', 'available')
      return (data ?? []) as VenueReward[]
    },
  })

  const stampCount     = wallet?.stamp_count ?? 0
  const hasRewards     = rewards.length > 0
  const drinkReward    = rewards.find((r) => r.reward_type === 'free_drink')
  const gameReward     = rewards.find((r) => r.reward_type === 'free_game_share')

  // ── Compact version ──
  if (compact) {
    if (!hasRewards) return null
    return (
      <button
        onClick={() => navigate('/you')}
        className="w-full flex items-center gap-3 rounded-2xl bg-court-50 border border-court-100 px-4 py-3 text-left"
      >
        <span className="text-[22px]">🥤</span>
        <p className="flex-1 text-[13px] font-semibold text-court-700">
          You have a reward waiting at {venueName}!
        </p>
        <span className="text-[12px] text-court font-semibold flex-shrink-0">View →</span>
      </button>
    )
  }

  // ── Stamp rows ──
  // First group: stamps 1–6 (towards free drink)
  // Second group: stamps 7–12 (towards free game share) — only shown if stampCount > 0 in that range

  const firstGroupFilled  = Math.min(stampCount, STAMPS_PER_DRINK)
  const showSecondGroup   = stampCount > STAMPS_PER_DRINK || gameReward != null
  const secondGroupFilled = Math.max(0, Math.min(stampCount - STAMPS_PER_DRINK, STAMPS_PER_DRINK))
  const stampsToNextDrink = Math.max(0, STAMPS_PER_DRINK - (stampCount % STAMPS_PER_DRINK || STAMPS_PER_DRINK))

  // ── Full version ──
  return (
    <div className="rounded-2xl bg-white border border-hairline p-4">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-[11px] font-bold text-ink-2 uppercase tracking-wide mb-0.5">Loyalty Card</p>
          <p className="text-[15px] font-bold text-ink leading-tight">{venueName}</p>
        </div>
        <span className="text-[22px]">🎾</span>
      </div>

      {/* First stamp group — free drink */}
      <div className="mb-2">
        <div className="flex items-center gap-1.5 mb-1.5">
          {Array.from({ length: STAMPS_PER_DRINK }).map((_, i) => (
            <StampDot key={i} filled={i < firstGroupFilled} />
          ))}
        </div>
        <p className="text-[12px] text-ink-2">
          {firstGroupFilled} of {STAMPS_PER_DRINK} stamps towards free drink
          {stampsToNextDrink > 0 && !drinkReward && (
            <span className="text-ink-2"> · {stampsToNextDrink} more to go</span>
          )}
        </p>
      </div>

      {/* Second stamp group — free game share */}
      {showSecondGroup && (
        <div className="mt-3 pt-3 border-t border-hairline">
          <p className="text-[11px] font-semibold text-ink-2 mb-1.5">Towards free game share (12 stamps)</p>
          <div className="flex items-center gap-1.5 mb-1.5">
            {Array.from({ length: STAMPS_PER_DRINK }).map((_, i) => (
              <StampDot key={i} filled={i < secondGroupFilled} />
            ))}
          </div>
          <p className="text-[12px] text-ink-2">
            {secondGroupFilled} of {STAMPS_PER_DRINK} extra stamps
          </p>
        </div>
      )}

      {/* Available rewards */}
      {drinkReward && <RewardBanner reward={drinkReward} />}
      {gameReward  && <RewardBanner reward={gameReward} />}

      {/* No stamps yet nudge */}
      {stampCount === 0 && !hasRewards && (
        <p className="text-[12px] text-ink-2 mt-2">
          Play your first game at {venueName} to start earning stamps!
        </p>
      )}
    </div>
  )
}
