import { Flag } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/hooks/useAuth'

interface ReportButtonProps {
  context: string
  contextId?: string
}

export function ReportButton({ context, contextId }: ReportButtonProps) {
  const { t } = useTranslation()
  const { profile } = useAuth()

  const subject = encodeURIComponent(`${t('report.subject_prefix')} - ${context}`)
  const body = encodeURIComponent(
    `${t('report.body_intro')}\n\nContext: ${context}\nID: ${contextId ?? 'N/A'}\nReporter user ID: ${profile?.id ?? 'unknown'}\n\n--\nReason: [Please describe the issue here]`,
  )
  const href = `mailto:report@padelplayersapp.com?subject=${subject}&body=${body}`

  return (
    <a
      href={href}
      className="inline-flex items-center gap-1 text-[12px] text-gray-400 hover:text-gray-500 transition-colors"
    >
      <Flag className="h-3 w-3" />
      {t('report.button_label')}
    </a>
  )
}
