import { useAuth } from '@/hooks/useAuth'

export function YouPage() {
  const { profile, signOut } = useAuth()

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-teal-50 text-2xl font-bold text-teal-600">
        {profile?.name?.[0]?.toUpperCase() ?? '?'}
      </div>
      <p className="text-base font-semibold text-gray-900">{profile?.name ?? 'Loading…'}</p>
      <p className="text-sm text-gray-400">{profile?.email}</p>
      <button
        onClick={signOut}
        className="mt-4 rounded-xl border border-gray-200 px-6 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
      >
        Sign out
      </button>
    </div>
  )
}
