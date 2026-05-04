import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { WeekMatchView } from '@/components/play/WeekMatchView'
import { CreateMatchSheet } from '@/components/play/CreateMatchSheet'

export function MatchesPage() {
  const { t } = useTranslation()
  const [createOpen, setCreateOpen] = useState(false)

  return (
    <div className="min-h-full bg-white pb-6">
      {/* Header */}
      <div className="px-5 pt-14 pb-1">
        <h1 className="text-[22px] font-bold text-gray-900">{t('matches.title')}</h1>
      </div>

      {/* Week Match View */}
      <WeekMatchView onCreateMatch={() => setCreateOpen(true)} />

      {/* Create match sheet */}
      <CreateMatchSheet open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  )
}
