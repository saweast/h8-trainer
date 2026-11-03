import { useEffect } from 'react'
import { Link, Outlet, useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Logo } from '@/components/common/Logo'
import { UserAvatar } from '@/components/common/UserAvatar'
import { useAuth } from '@/features/auth/authContext'
import { useMode, type AppMode } from '@/features/mode/modeContext'
import { BottomNav } from './BottomNav'
import { ModeSwitch } from './ModeSwitch'

export function AppShell() {
  const { t } = useTranslation()
  const { user, isDemo } = useAuth()
  const { isTrainer, mode, setMode } = useMode()
  const { pathname } = useLocation()

  // Screens that belong to one mode switch the navigation to it (links, reloads, back button).
  const routeMode = modeForPath(pathname)
  useEffect(() => {
    if (isTrainer && routeMode && routeMode !== mode) setMode(routeMode)
  }, [isTrainer, routeMode, mode, setMode])

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 bg-background/95 pt-safe backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex h-14 max-w-md items-center justify-between gap-3 px-4">
          <Link to={mode === 'trainer' ? '/trainer' : '/'} aria-label={t('common.appName')} className="flex items-center gap-2">
            <Logo />
            {isDemo ? (
              <span className="rounded-full bg-warning-muted px-2 py-0.5 text-[11px] font-medium text-warning-text">
                {t('profile.demo')}
              </span>
            ) : null}
          </Link>
          <div className="flex items-center gap-2">
            {isTrainer ? <ModeSwitch /> : null}
            <Link to="/profile" aria-label={t('nav.profile')}>
              <UserAvatar name={user?.displayName ?? ''} src={user?.avatarUrl} className="size-8" />
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-md px-4 pt-2 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}

function modeForPath(pathname: string): AppMode | null {
  if (pathname === '/trainer' || pathname.startsWith('/trainer/')) return 'trainer'
  if (pathname === '/' || ['/history', '/progress', '/body'].some((p) => pathname.startsWith(p))) return 'athlete'
  return null // shared screens (exercises, templates, profile) keep the current mode
}
