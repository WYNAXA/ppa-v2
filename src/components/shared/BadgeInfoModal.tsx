import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ACHIEVEMENT_LIBRARY } from '@/lib/achievements'

const RARITY_STYLES: Record<string, string> = {
  common: 'bg-hairline text-ink-2',
  uncommon: 'bg-court-50 text-court-700',
  rare: 'bg-court-50 text-court',
  epic: 'bg-warn-50 text-warn',
  special: 'bg-surface text-ink-2',
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
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-hairline" />
        <button onClick={onClose} className="absolute top-5 right-5 p-1">
          <X className="h-5 w-5 text-ink-2" />
        </button>
        <p className="text-center text-[48px] leading-none mb-3">{def.emoji}</p>
        <h2 className="text-center text-[20px] font-bold text-ink mb-2">{label}</h2>
        <div className="flex justify-center mb-4">
          <span className={`rounded-full px-3 py-1 text-[12px] font-bold ${RARITY_STYLES[rarity] ?? RARITY_STYLES.common}`}>
            {rarityLabel}
          </span>
        </div>
        <p className="text-[14px] text-ink-2 text-center mb-4">{description}</p>
        {howToEarn && (
          <div className="rounded-xl bg-surface px-4 py-3">
            <p className="text-[12px] font-semibold text-ink-2 uppercase tracking-wide mb-1">{t('achievements.how_to_earn')}</p>
            <p className="text-[14px] text-ink">{howToEarn}</p>
          </div>
        )}
      </div>
    </div>
  )
}
