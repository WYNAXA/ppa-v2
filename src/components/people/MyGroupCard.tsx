import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { MapPin, ChevronRight } from 'lucide-react'
import { PlayerAvatar } from '@/components/shared/PlayerAvatar'
import { cn } from '@/lib/utils'
import type { MyGroup } from '@/hooks/useSocial'

export function MyGroupCard({ group, index, badge }: { group: MyGroup; index: number; badge?: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  return (
    <motion.button
      onClick={() => navigate(`/discover/groups/${group.id}`)}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      whileTap={{ scale: 0.985 }}
      className="w-full text-left bg-card rounded-2xl border border-hairline overflow-hidden hover:border-court-100 transition-colors relative"
    >
      <div className="flex">
        <div className="w-1 bg-court flex-shrink-0" />
        <div className="flex-1 px-4 py-3.5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-[15px] font-bold text-ink truncate">{group.name}</h3>
                {group.hasActiveLeague && (
                  <span className="inline-flex items-center rounded-full bg-court-50 border border-court-100 px-2 py-0.5 text-[11px] font-semibold text-court">
                    {t('people.active_league')}
                  </span>
                )}
                {badge && (
                  <span className={cn(
                    'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold',
                    badge === t('people.badge_ringer') ? 'bg-warn text-white' : 'bg-warn text-white'
                  )}>
                    {badge}
                  </span>
                )}
              </div>
              {group.city && (
                <div className="flex items-center gap-1 mt-0.5">
                  <MapPin className="h-3 w-3 text-ink-2" />
                  <p className="text-[12px] text-ink-2">{group.city}</p>
                </div>
              )}
            </div>
            <ChevronRight className="h-4 w-4 text-ink-3 flex-shrink-0 mt-1" />
          </div>

          <div className="flex items-center gap-2 mt-3">
            <div className="flex -space-x-1.5">
              {group.recentMembers.map((m) => (
                <PlayerAvatar key={m.id} name={m.name} avatarUrl={m.avatar_url} size="sm" />
              ))}
            </div>
            <span className="text-[12px] text-ink-2">
              {group.memberCount === 1 ? t('people.member', { count: 1 }) : t('people.members', { count: group.memberCount })}
            </span>
          </div>
        </div>
      </div>
    </motion.button>
  )
}
