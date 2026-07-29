import { shouldShowGetTheApp, mobilePlatform, APP_STORE_URL, PLAY_STORE_URL } from '@/lib/appInstall'

interface GetTheAppCardProps {
  /** Optional heading override. */
  title?: string
  subtitle?: string
  className?: string
}

/**
 * "Get the app" nudge. Renders nothing inside the native app or an installed
 * PWA — only for people using the web app in a plain browser.
 */
export function GetTheAppCard({ title, subtitle, className }: GetTheAppCardProps) {
  if (!shouldShowGetTheApp()) return null

  const platform = mobilePlatform()
  const showApple = platform === 'ios' || platform === 'other'
  const showGoogle = platform === 'android' || platform === 'other'

  return (
    <div className={`rounded-2xl border border-gray-100 bg-gray-50 p-5 text-center ${className ?? ''}`}>
      <div className="text-3xl mb-1">📲</div>
      <p className="text-[15px] font-bold text-gray-900">{title ?? 'Get the Padel Players app'}</p>
      <p className="mt-1 text-[13px] text-gray-500">
        {subtitle ?? 'Install the app for match reminders, push notifications and a home-screen icon.'}
      </p>
      <div className="mt-4 flex flex-col gap-2">
        {showApple && (
          <a
            href={APP_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full rounded-xl bg-black py-3 text-[14px] font-semibold text-white"
          >
             Download on the App Store
          </a>
        )}
        {showGoogle && (
          <a
            href={PLAY_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full rounded-xl bg-[#009688] py-3 text-[14px] font-semibold text-white"
          >
            ▶ Get it on Google Play
          </a>
        )}
      </div>
    </div>
  )
}
