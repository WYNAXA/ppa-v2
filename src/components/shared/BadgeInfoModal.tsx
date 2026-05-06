import { X } from 'lucide-react'

type Rarity = 'Common' | 'Uncommon' | 'Rare' | 'Epic'

interface BadgeMeta {
  label: string
  emoji: string
  description: string
  howToEarn: string
  rarity: Rarity
}

const BADGE_INFO: Record<string, BadgeMeta> = {
  first_win: {
    label: 'First Win',
    emoji: '🏆',
    description: 'Awarded to players who have recorded their first match victory.',
    howToEarn: 'Win at least 1 match.',
    rarity: 'Common',
  },
  on_fire: {
    label: 'On Fire',
    emoji: '🔥',
    description: 'Given to players on a hot winning streak.',
    howToEarn: 'Win 3 or more matches in a row.',
    rarity: 'Uncommon',
  },
  consistent: {
    label: 'Consistent',
    emoji: '💪',
    description: 'Recognises players who keep showing up and playing.',
    howToEarn: 'Play 10 or more matches.',
    rarity: 'Common',
  },
  league_champion: {
    label: 'League Champion',
    emoji: '👑',
    description: 'The highest honour — top of a league.',
    howToEarn: 'Finish first place in a league.',
    rarity: 'Epic',
  },
  social: {
    label: 'Social',
    emoji: '🤝',
    description: 'For players who are active in the community.',
    howToEarn: 'Join 3 or more groups.',
    rarity: 'Common',
  },
  veteran: {
    label: 'Veteran',
    emoji: '⭐',
    description: 'A seasoned player with serious court time.',
    howToEarn: 'Play 50 or more matches.',
    rarity: 'Rare',
  },
  sharp_shooter: {
    label: 'Sharp Shooter',
    emoji: '🎯',
    description: 'Awarded to highly accurate and effective players.',
    howToEarn: 'Maintain a 70%+ win rate across at least 10 matches.',
    rarity: 'Rare',
  },
}

const RARITY_STYLES: Record<Rarity, string> = {
  Common: 'bg-gray-100 text-gray-600',
  Uncommon: 'bg-teal-50 text-teal-700',
  Rare: 'bg-purple-50 text-purple-700',
  Epic: 'bg-amber-50 text-amber-700',
}

interface Props {
  badgeKey: string | null
  onClose: () => void
}

export default function BadgeInfoModal({ badgeKey, onClose }: Props) {
  if (!badgeKey) return null
  const meta = BADGE_INFO[badgeKey]
  if (!meta) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-3xl bg-white px-6 pt-6"
        style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom) + 80px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-gray-200" />

        {/* Close */}
        <button onClick={onClose} className="absolute top-5 right-5 p-1">
          <X className="h-5 w-5 text-gray-400" />
        </button>

        {/* Emoji */}
        <p className="text-center text-[48px] leading-none mb-3">{meta.emoji}</p>

        {/* Name */}
        <h2 className="text-center text-[20px] font-bold text-gray-900 mb-2">{meta.label}</h2>

        {/* Rarity pill */}
        <div className="flex justify-center mb-4">
          <span className={`rounded-full px-3 py-1 text-[12px] font-bold ${RARITY_STYLES[meta.rarity]}`}>
            {meta.rarity}
          </span>
        </div>

        {/* Description */}
        <p className="text-[14px] text-gray-600 text-center mb-4">{meta.description}</p>

        {/* How to earn */}
        <div className="rounded-xl bg-gray-50 px-4 py-3">
          <p className="text-[12px] font-semibold text-gray-500 uppercase tracking-wide mb-1">How to earn</p>
          <p className="text-[14px] text-gray-800">{meta.howToEarn}</p>
        </div>
      </div>
    </div>
  )
}
