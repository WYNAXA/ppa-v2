import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [validRecoverySession, setValidRecoverySession] = useState(false)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setValidRecoverySession(true)
      }
    })

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setValidRecoverySession(true)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)

    if (password !== confirmPassword) {
      setMessage({ type: 'error', text: 'Passwords do not match.' })
      return
    }
    if (password.length < 8) {
      setMessage({ type: 'error', text: 'Password must be at least 8 characters.' })
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (error) {
      setMessage({ type: 'error', text: error.message })
      return
    }

    setMessage({
      type: 'success',
      text: 'Password updated. Redirecting to home\u2026',
    })
    setTimeout(() => navigate('/home', { replace: true }), 1500)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img
            src="/icons/icon-192x192.png"
            alt="Padel Players"
            className="mx-auto mb-4 h-20 w-20 rounded-2xl shadow-sm"
          />
          <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">Set new password</h1>
          <p className="mt-1 text-sm text-gray-500">Choose a new password to sign in with.</p>
        </div>

        {!validRecoverySession ? (
          <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <p className="font-medium mb-1">Reset link expired or invalid</p>
            <p className="text-[13px]">
              This password reset link is no longer valid. Please request a new one from the sign-in page.
            </p>
            <button
              onClick={() => navigate('/auth', { replace: true })}
              className="mt-3 text-[13px] font-medium text-teal-700 hover:underline"
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="password"
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
            />
            <input
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-[#009688] py-3 text-sm font-bold text-white disabled:opacity-40"
            >
              {loading ? 'Updating\u2026' : 'Set new password'}
            </button>
          </form>
        )}

        {message && (
          <p
            className={`mt-4 rounded-lg px-4 py-3 text-sm ${
              message.type === 'success'
                ? 'bg-teal-50 text-teal-700'
                : 'bg-red-50 text-red-700'
            }`}
          >
            {message.text}
          </p>
        )}
      </div>
    </div>
  )
}
