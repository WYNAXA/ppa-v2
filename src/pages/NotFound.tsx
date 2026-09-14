import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export function NotFoundPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { t } = useTranslation()

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-[48px] font-extrabold text-ink-3">404</p>
      <p className="text-[15px] font-semibold text-ink">{t('common.page_not_found')}</p>
      <p className="text-[13px] text-ink-2 break-all">{location.pathname}</p>
      <button
        onClick={() => navigate('/home')}
        className="mt-2 rounded-control bg-court px-5 py-2.5 text-[14px] font-bold text-white"
      >
        {t('common.go_home')}
      </button>
    </div>
  )
}
