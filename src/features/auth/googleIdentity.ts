// Sign in with Google through Google Identity Services (GIS): Google renders its own button and
// hands us an ID token, which Supabase exchanges for a session (signInWithIdToken). The whole flow
// stays on our origin, so Google's consent screen names h8-trainer.com instead of the Supabase
// project host, and Google brand verification only needs the domain we own.

/** OAuth Web client ID. Without it the login page falls back to the Supabase redirect flow. */
export const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() || null

interface CredentialResponse {
  credential: string
}

export interface GoogleButtonOptions {
  type?: 'standard' | 'icon'
  theme?: 'outline' | 'filled_blue' | 'filled_black'
  size?: 'large' | 'medium' | 'small'
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin'
  shape?: 'rectangular' | 'pill' | 'circle' | 'square'
  logo_alignment?: 'left' | 'center'
  width?: number
  locale?: string
}

interface GoogleAccountsId {
  initialize(config: {
    client_id: string
    callback: (response: CredentialResponse) => void
    nonce?: string
    auto_select?: boolean
    cancel_on_tap_outside?: boolean
    use_fedcm_for_button?: boolean
  }): void
  renderButton(parent: HTMLElement, options: GoogleButtonOptions): void
  cancel(): void
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } }
  }
}

const GIS_SRC = 'https://accounts.google.com/gsi/client'
let loading: Promise<GoogleAccountsId> | null = null

/** Loads the GIS script once. */
export function loadGoogleIdentity(): Promise<GoogleAccountsId> {
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id)
  loading ??= new Promise<GoogleAccountsId>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = GIS_SRC
    script.async = true
    script.onload = () =>
      window.google?.accounts?.id ? resolve(window.google.accounts.id) : reject(new Error('GIS unavailable'))
    script.onerror = () => {
      loading = null
      script.remove()
      reject(new Error('GIS failed to load'))
    }
    document.head.appendChild(script)
  })
  return loading
}

/**
 * A fresh nonce pair: Google puts the SHA-256 hash into the ID token, and Supabase checks it
 * against the raw value, so a token captured elsewhere can't be replayed.
 */
export async function createNonce(): Promise<{ raw: string; hashed: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const raw = btoa(String.fromCharCode(...bytes))
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))
  const hashed = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
  return { raw, hashed }
}
