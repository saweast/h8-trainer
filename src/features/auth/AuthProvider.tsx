import type { Session } from '@supabase/supabase-js'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { authRedirectUrl, isSupabaseConfigured, supabase } from '@/lib/supabase'
import { AuthContext, type AuthContextValue, type AuthUser } from './authContext'

const DEMO_KEY = 'h8.demo'

const DEMO_USER: AuthUser = { id: 'demo', displayName: 'Демо', avatarUrl: null }

function userFromSession(session: Session | null): AuthUser | null {
  if (!session) return null
  const meta = session.user.user_metadata as Record<string, unknown>
  const name = (meta.full_name ?? meta.name ?? '') as string
  return {
    id: session.user.id,
    displayName: name || session.user.email?.split('@')[0] || '',
    avatarUrl: (meta.avatar_url as string | undefined) ?? null,
  }
}

function readDemoFlag(): boolean {
  try {
    return window.sessionStorage.getItem(DEMO_KEY) === '1'
  } catch {
    return false
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [demo, setDemo] = useState(() => !isSupabaseConfigured && readDemoFlag())

  useEffect(() => {
    if (!supabase) return
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setLoading(false)
    })
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  const signInWithGoogle = useCallback(async () => {
    if (!supabase) return
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: authRedirectUrl() },
    })
    if (error) throw error
  }, [])

  const enterDemo = useCallback(() => {
    try {
      window.sessionStorage.setItem(DEMO_KEY, '1')
    } catch {
      // ignore
    }
    setDemo(true)
  }, [])

  const signOut = useCallback(async () => {
    if (supabase) {
      await supabase.auth.signOut()
      return
    }
    try {
      window.sessionStorage.removeItem(DEMO_KEY)
    } catch {
      // ignore
    }
    setDemo(false)
  }, [])

  const value = useMemo<AuthContextValue>(() => {
    const user = isSupabaseConfigured ? userFromSession(session) : demo ? DEMO_USER : null
    return {
      status: loading ? 'loading' : user ? 'signedIn' : 'signedOut',
      user,
      isDemo: !isSupabaseConfigured,
      signInWithGoogle,
      enterDemo,
      signOut,
    }
  }, [session, loading, demo, signInWithGoogle, enterDemo, signOut])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
