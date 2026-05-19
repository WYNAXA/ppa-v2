import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ACHIEVEMENT_LIBRARY } from '@/lib/achievements'

const RARITY_STYLES: Record<string, string> = {
  common: 'bg-gray-100 text-gray-600',
  uncommon: 'bg-teal-50 text-teal-700',
  rare: 'bg-purple-50 text-purple-700',
  epic: 'bg-amber-50 text-amber-700',
  special: 'bg-blue-50 text-blue-700',
}

interface Props {
  badgeKey: string | null
  onClose: () => void
}

export default function BadgeInfoModal({ badgeKey, onClose }: Props) {
  const { t } = useTranslation()
  if (!badgeKey) return null

  const def = ACHIEVEMENT_LIBRARY[badgeKey]
  if (!def) return null

  const rarity = def.rarity
  const label = t(`achievements.${badgeKey}`, { defaultValue: def.name })
  const description = t(`achievements.${badgeKey}_desc`, { defaultValue: def.description })
  const howToEarn = t(`achievements.${badgeKey}_howto`, { defaultValue: '' })
  const rarityLabel = t(`achievements.rarity_${rarity}`)

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
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-gray-200" />
        <button onClick={onClose} className="absolute top-5 right-5 p-1">
          <X className="h-5 w-5 text-gray-400" />
        </button>
        <p className="text-center text-[48px] leading-none mb-3">{def.emoji}</p>
        <h2 className="text-center text-[20px] font-bold text-gray-900 mb-2">{label}</h2>
        <div className="flex justify-center mb-4">
          <span className={`rounded-full px-3 py-1 text-[12px] font-bold ${RARITY_STYLES[rarity] ?? RARITY_STYLES.common}`}>
            {rarityLabel}
          </span>
        </div>
        <p className="text-[14px] text-gray-600 text-center mb-4">{description}</p>
        {howToEarn && (
          <div className="rounded-xl bg-gray-50 px-4 py-3">
            <p className="text-[12px] font-semibold text-gray-500 uppercase tracking-wide mb-1">{t('achievements.how_to_earn')}</p>
            <p className="text-[14px] text-gray-800">{howToEarn}</p>
          </div>
        )}
      </div>
    </div>
  )
}
