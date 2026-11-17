import { createContext, useContext } from 'react'

export interface AuthUser {
  id: string
  displayName: string
  avatarUrl: string | null
}

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn'

export interface AuthContextValue {
  status: AuthStatus
  user: AuthUser | null
  /** True when Supabase isn't configured and the UI runs on placeholder data. */
  isDemo: boolean
  /** Redirect flow through Supabase; used when no Google client ID is configured. */
  signInWithGoogle: () => Promise<void>
  /** Exchanges an ID token from Google Identity Services for a session. */
  signInWithGoogleIdToken: (token: string, nonce: string) => Promise<void>
  enterDemo: () => void
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
