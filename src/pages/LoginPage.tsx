import { Info } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useLocation } from 'react-router'
import { toast } from 'sonner'
import { GoogleIcon } from '@/components/common/GoogleIcon'
import { Logo } from '@/components/common/Logo'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/authContext'

export function LoginPage() {
  const { t } = useTranslation()
  const { status, isDemo, signInWithGoogle, enterDemo } = useAuth()
  const location = useLocation()
  const [pending, setPending] = useState(false)

  if (status === 'signedIn') {
    const from = (location.state as { from?: string } | null)?.from ?? '/'
    return <Navigate to={from} replace />
  }

  const google = async () => {
    setPending(true)
    try {
      await signInWithGoogle()
    } catch {
      toast.error(t('login.error'))
      setPending(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pt-safe pb-[calc(2rem+env(safe-area-inset-bottom))]">
      <div className="flex flex-1 flex-col justify-center">
        <Logo className="text-6xl" />
        <p className="mt-4 max-w-xs text-lg text-muted-foreground">{t('login.tagline')}</p>
      </div>

      <div className="flex flex-col gap-3">
        {isDemo ? (
          <>
            <div className="flex gap-3 rounded-2xl bg-warning-muted p-4 text-sm text-warning-text">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>{t('login.demoNotice')}</p>
            </div>
            <Button size="xl" onClick={enterDemo}>
              {t('login.demoEnter')}
            </Button>
          </>
        ) : (
          <Button
            size="xl"
            onClick={() => void google()}
            disabled={pending}
            className="bg-white text-zinc-900 hover:bg-zinc-100 dark:bg-white dark:hover:bg-zinc-200"
          >
            <GoogleIcon className="size-5" />
            {t('login.google')}
          </Button>
        )}
        <p className="text-center text-xs text-muted-foreground">{t('login.privacy')}</p>
      </div>
    </div>
  )
}
