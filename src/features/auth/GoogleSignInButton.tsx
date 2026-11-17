import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useAuth } from './authContext'
import { createNonce, loadGoogleIdentity } from './googleIdentity'

// Google caps its rendered button at 400px.
const MAX_WIDTH = 400

/**
 * Google's own "Continue with Google" button. Shows `fallback` if the GIS script can't load
 * (blocked by an extension, offline), so sign-in never disappears.
 */
export function GoogleSignInButton({ clientId, fallback }: { clientId: string; fallback: ReactNode }) {
  const { t, i18n } = useTranslation()
  const { signInWithGoogleIdToken } = useAuth()
  const slot = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const abort = new AbortController()
    void (async () => {
      try {
        const [nonce, gis] = await Promise.all([createNonce(), loadGoogleIdentity()])
        const el = slot.current
        if (abort.signal.aborted || !el) return
        gis.initialize({
          client_id: clientId,
          nonce: nonce.hashed,
          use_fedcm_for_button: true,
          callback: ({ credential }) => {
            signInWithGoogleIdToken(credential, nonce.raw).catch(() => toast.error(t('login.error')))
          },
        })
        el.replaceChildren()
        gis.renderButton(el, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          shape: 'pill',
          text: 'continue_with',
          logo_alignment: 'center',
          width: Math.min(MAX_WIDTH, Math.round(el.getBoundingClientRect().width)),
          locale: i18n.language,
        })
      } catch {
        if (!abort.signal.aborted) setFailed(true)
      }
    })()
    return () => abort.abort()
  }, [clientId, i18n.language, signInWithGoogleIdToken, t])

  if (failed) return <>{fallback}</>
  return <div ref={slot} className="flex min-h-11 w-full justify-center [color-scheme:light]" />
}
