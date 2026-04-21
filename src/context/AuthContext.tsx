import { createContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

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

async function ensureProfile(user: User): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, email, avatar_url, playtomic_level, ranking_points, internal_ranking')
    .eq('id', user.id)
    .single()

  if (!error && data) return data

  // No profile yet — create one
  const name = user.user_metadata?.name ?? user.email?.split('@')[0] ?? 'Player'
  const { data: created, error: createError } = await supabase
    .from('profiles')
    .insert({ id: user.id, name, email: user.email ?? '' })
    .select('id, name, email, avatar_url, playtomic_level, ranking_points, internal_ranking')
    .single()

  if (createError) throw createError
  return created
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        try {
          const p = await ensureProfile(session.user)
          setProfile(p)
        } catch {
          // profile fetch failure is non-fatal
        }
      }
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        try {
          const p = await ensureProfile(session.user)
          setProfile(p)
        } catch {
          // profile fetch failure is non-fatal
        }
      } else {
        setProfile(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const signOut = async () => {
    await supabase.auth.signOut()
    setSession(null)
    setUser(null)
    setProfile(null)
  }

  return (
    <AuthContext.Provider value={{ session, user, profile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}
