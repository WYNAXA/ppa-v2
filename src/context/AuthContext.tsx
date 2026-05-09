import { createContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import * as Sentry from '@sentry/react'

interface Profile {
  id: string
  name: string
  email: string
  avatar_url?: string | null
  playtomic_level?: number
  ranking_points?: number
  internal_ranking?: number
  city?: string | null
}

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: Profile | null
  loading: boolean
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, email, avatar_url, playtomic_level, ranking_points, internal_ranking, city')
    .eq('id', userId)
    .single()

  if (!error && data) return data

  // No profile yet — create one
  try {
    const { data: { user } } = await supabase.auth.getUser()
    const name = user?.user_metadata?.name ?? user?.email?.split('@')[0] ?? 'Player'
    const { data: created } = await supabase
      .from('profiles')
      .insert({ id: userId, name, email: user?.email ?? '' })
      .select('id, name, email, avatar_url, playtomic_level, ranking_points, internal_ranking, city')
      .single()
    return created
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const profileLoadedForRef = useRef('')
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    console.log('[Auth] initializing')

    // PRIMARY: onAuthStateChange fires immediately with current session
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        console.log('[Auth] state change:', event, newSession?.user?.id ?? 'none')
        if (!mountedRef.current) return

        setSession(newSession)
        setUser(newSession?.user ?? null)
        // Unblock UI immediately — don't wait for profile
        if (mountedRef.current) setLoading(false)

        if (newSession?.user) {
          // Set Sentry user context (ID only — no PII)
          Sentry.setUser({ id: newSession.user.id })
          // Load profile in background
          if (profileLoadedForRef.current !== newSession.user.id) {
            profileLoadedForRef.current = newSession.user.id
            fetchProfile(newSession.user.id).then(p => {
              if (mountedRef.current && p) setProfile(p)
            })
          }
        } else {
          Sentry.setUser(null)
          profileLoadedForRef.current = ''
          setProfile(null)
        }
      },
    )

    // SECONDARY: getSession triggers onAuthStateChange above
    // but also acts as fallback if onAuthStateChange doesn't fire
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      console.log('[Auth] getSession resolved:', s?.user?.id ?? 'none')
      // If still loading after getSession and no user, stop loading
      if (!s && mountedRef.current) {
        setTimeout(() => {
          if (mountedRef.current && loading) {
            console.warn('[Auth] no session — stopping loading')
            setLoading(false)
          }
        }, 8000)
      }
    }).catch(() => {
      if (mountedRef.current) setLoading(false)
    })

    return () => {
      mountedRef.current = false
      subscription.unsubscribe()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const signOut = async () => {
    await supabase.auth.signOut()
    Sentry.setUser(null)
    setSession(null)
    setUser(null)
    setProfile(null)
    profileLoadedForRef.current = ''
  }

  return (
    <AuthContext.Provider value={{ session, user, profile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}
