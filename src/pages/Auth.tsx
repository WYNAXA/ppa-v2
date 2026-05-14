import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

export function AuthPage() {
  const { session, loading } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup' | 'magic'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
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
      setMessage({ type: 'success', text: 'Check your email \u2014 magic link sent.' })
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

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)

    const trimmedName = name.trim()
    if (trimmedName.length < 2) {
      setMessage({ type: 'error', text: 'Please enter your name (at least 2 characters).' })
      return
    }
    if (password !== confirmPassword) {
      setMessage({ type: 'error', text: 'Passwords do not match.' })
      return
    }
    if (password.length < 8) {
      setMessage({ type: 'error', text: 'Password must be at least 8 characters.' })
      return
    }

    setSubmitting(true)
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name: trimmedName },
        emailRedirectTo: `${window.location.origin}/auth`,
      },
    })
    setSubmitting(false)

    if (error) {
      setMessage({ type: 'error', text: error.message })
      return
    }

    if (data.session) {
      // Email confirmation disabled \u2014 user is logged in immediately
      setMessage({ type: 'success', text: 'Account created. Redirecting\u2026' })
      return
    }

    // Email confirmation pending
    setMessage({
      type: 'success',
      text: 'Check your email to confirm your account, then come back here to sign in.',
    })
    setMode('signin')
    setPassword('')
    setConfirmPassword('')
    setName('')
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-6 py-12 bg-white">
      {/* Logo / brand */}
      <div className="mb-10 text-center">
        <img
          src="/PPA_Round_Logo_White_Background.png"
          alt="Padel Players"
          className="mx-auto mb-4 h-20 w-20 rounded-2xl shadow-sm"
        />
        <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">Padel Players</h1>
        <p className="mt-1 text-sm text-gray-500">The social padel app</p>
      </div>

      {/* Tab switcher */}
      <div className="mb-6 flex w-full max-w-sm gap-1 rounded-xl bg-gray-100 p-1">
        {([
          { key: 'signin' as const, label: 'Sign In' },
          { key: 'signup' as const, label: 'Sign Up' },
          { key: 'magic' as const, label: 'Magic Link' },
        ]).map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => { setMode(key); setMessage(null) }}
            className={`flex-1 rounded-lg py-2 text-[12px] font-medium transition-colors ${
              mode === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Form */}
      <form
        onSubmit={
          mode === 'magic' ? handleMagicLink :
          mode === 'signup' ? handleSignUp :
          handlePassword
        }
        className="w-full max-w-sm space-y-4"
      >
        {mode === 'signup' && (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Your name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Christian Shanahan"
              autoComplete="name"
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
            />
          </div>
        )}

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

        {(mode === 'signin' || mode === 'signup') && (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'signup' ? 'Min 8 characters' : '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
            />
            {mode === 'signup' && (
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm password"
                autoComplete="new-password"
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 mt-3"
              />
            )}
            {mode === 'signin' && (
              <button
                type="button"
                onClick={async () => {
                  if (!email.trim()) return
                  await supabase.auth.resetPasswordForEmail(email, {
                    redirectTo: `${window.location.origin}/auth`,
                  })
                  setMessage({ type: 'success', text: 'Password reset link sent \u2014 check your email' })
                }}
                className="mt-2 text-[13px] text-[#009688] font-medium hover:underline"
              >
                Forgot password?
              </button>
            )}
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
            ? 'Loading\u2026'
            : mode === 'magic'
            ? 'Send magic link'
            : mode === 'signup'
            ? 'Create account'
            : 'Sign in'}
        </button>

        {mode === 'signup' && (
          <p className="text-[11px] text-gray-500 text-center mt-3">
            After signing up you'll need to confirm your email. We'll then help you set up your padel profile.
          </p>
        )}
      </form>
    </div>
  )
}
