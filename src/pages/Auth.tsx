import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

export function AuthPage() {
  const { session, loading } = useAuth()
  const [mode, setMode] = useState<'magic' | 'password'>('magic')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
      </div>
    )
  }

  if (session) return <Navigate to="/home" replace />

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setMessage(null)

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/home` },
    })

    setSubmitting(false)
    if (error) {
      setMessage({ type: 'error', text: error.message })
    } else {
      setMessage({ type: 'success', text: 'Check your email — magic link sent.' })
    }
  }

  const handlePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setMessage(null)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    setSubmitting(false)
    if (error) {
      setMessage({ type: 'error', text: error.message })
    }
    // on success AuthContext handles the redirect via session change
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-6 py-12 bg-white">
      {/* Logo / brand */}
      <div className="mb-10 text-center">
        <div
          className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl"
          style={{ background: '#009688' }}
        >
          <span className="text-2xl font-bold text-white">PP</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Padel Players</h1>
        <p className="mt-1 text-sm text-gray-500">Sign in to continue</p>
      </div>

      {/* Tab switcher */}
      <div className="mb-6 flex w-full max-w-sm gap-1 rounded-xl bg-gray-100 p-1">
        <button
          onClick={() => { setMode('magic'); setMessage(null) }}
          className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
            mode === 'magic' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
          }`}
        >
          Magic Link
        </button>
        <button
          onClick={() => { setMode('password'); setMessage(null) }}
          className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
            mode === 'password' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
          }`}
        >
          Password
        </button>
      </div>

      {/* Form */}
      <form
        onSubmit={mode === 'magic' ? handleMagicLink : handlePassword}
        className="w-full max-w-sm space-y-4"
      >
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
          />
        </div>

        {mode === 'password' && (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
            />
          </div>
        )}

        {message && (
          <p
            className={`rounded-lg px-4 py-3 text-sm ${
              message.type === 'success'
                ? 'bg-teal-50 text-teal-700'
                : 'bg-red-50 text-red-700'
            }`}
          >
            {message.text}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-xl py-3 text-sm font-semibold text-white transition disabled:opacity-60"
          style={{ background: '#009688' }}
        >
          {submitting
            ? 'Sending…'
            : mode === 'magic'
            ? 'Send magic link'
            : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
