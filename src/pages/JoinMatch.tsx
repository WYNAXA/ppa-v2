import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { SplashScreen } from '@/components/shared/SplashScreen'

const PENDING_KEY = 'pending_match_invite_token'

interface Preview {
  guest_name?: string
  status?: string
  expired?: boolean
  match_id?: string
  match_date?: string
  match_time?: string
  venue?: string | null
  inviter_name?: string
  error?: string
}

export function JoinMatchPage() {
  const { token = '' } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { session, loading } = useAuth()
  const [preview, setPreview] = useState<Preview | null>(null)
  const [claiming, setClaiming] = useState(false)
  const [claimError, setClaimError] = useState<string | null>(null)

  // Load a public preview of the invite (works logged-out).
  useEffect(() => {
    if (!token) return
    supabase.rpc('get_match_invite_preview', { p_token: token }).then(({ data }) => {
      setPreview((data as Preview) ?? { error: 'invalid_token' })
    })
  }, [token])

  async function claim() {
    setClaiming(true)
    setClaimError(null)
    const { data, error } = await supabase.rpc('claim_match_guest_invite', { p_token: token })
    setClaiming(false)
    const res = data as { match_id?: string; error?: string } | null
    if (error || res?.error) {
      setClaimError(res?.error ?? 'Could not join the match. Please try again.')
      return
    }
    localStorage.removeItem(PENDING_KEY)
    if (res?.match_id) navigate(`/matches/${res.match_id}`, { replace: true })
    else navigate('/home', { replace: true })
  }

  if (loading || !preview) return <SplashScreen />

  const dateStr = preview.match_date
    ? (() => { try { return new Date(preview.match_date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }) } catch { return preview.match_date } })()
    : null
  const invalid = preview.error === 'invalid_token'
  const expired = preview.expired || preview.status === 'cancelled'

  return (
    <div className="min-h-full bg-white flex flex-col items-center justify-center px-8 text-center">
      <div className="text-5xl mb-4">🎾</div>

      {invalid ? (
        <>
          <h1 className="text-xl font-bold text-gray-900">Invite not found</h1>
          <p className="mt-2 text-[14px] text-gray-500">This invite link is invalid or has been removed.</p>
        </>
      ) : expired ? (
        <>
          <h1 className="text-xl font-bold text-gray-900">This invite has expired</h1>
          <p className="mt-2 text-[14px] text-gray-500">Ask whoever invited you to send a fresh link.</p>
        </>
      ) : (
        <>
          <h1 className="text-xl font-bold text-gray-900">
            {preview.inviter_name ? `${preview.inviter_name} invited you` : "You're invited"} to a padel match
          </h1>
          <div className="mt-3 rounded-2xl bg-gray-50 border border-gray-100 px-5 py-4 text-[14px] text-gray-700 w-full max-w-xs">
            {dateStr && <p className="font-semibold">{dateStr}{preview.match_time ? ` · ${preview.match_time.slice(0, 5)}` : ''}</p>}
            {preview.venue && <p className="text-gray-500 mt-0.5">{preview.venue}</p>}
          </div>

          {preview.status === 'accepted' ? (
            <button
              onClick={() => preview.match_id && navigate(`/matches/${preview.match_id}`)}
              className="mt-6 w-full max-w-xs rounded-2xl bg-[#009688] py-3.5 text-[14px] font-bold text-white"
            >
              View match
            </button>
          ) : session ? (
            <>
              <button
                onClick={claim}
                disabled={claiming}
                className="mt-6 w-full max-w-xs rounded-2xl bg-[#009688] py-3.5 text-[14px] font-bold text-white disabled:opacity-50"
              >
                {claiming ? 'Joining…' : 'Join this match'}
              </button>
              {claimError && <p className="mt-2 text-[12px] text-red-500">{claimError}</p>}
            </>
          ) : (
            <>
              <p className="mt-5 text-[13px] text-gray-500">Create your free account to join — it takes a few seconds.</p>
              <button
                onClick={() => { localStorage.setItem(PENDING_KEY, token); navigate('/auth') }}
                className="mt-3 w-full max-w-xs rounded-2xl bg-[#009688] py-3.5 text-[14px] font-bold text-white"
              >
                Sign up / Log in to join
              </button>
            </>
          )}
        </>
      )}
    </div>
  )
}

export const PENDING_MATCH_INVITE_KEY = PENDING_KEY
