import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './db.types'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

/** False until VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are set; the app then runs in demo mode. */
export const isSupabaseConfigured = Boolean(url && key)

export const supabase: SupabaseClient<Database> | null = isSupabaseConfigured
  ? createClient<Database>(url!, key!, {
      auth: {
        // PKCE returns `?code=` to the app, which works with plain static hosting.
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null

/** Where Google sends the user back: the app root, including the GitHub Pages sub-path. */
export function authRedirectUrl(): string {
  return new URL(import.meta.env.BASE_URL, window.location.origin).toString()
}
