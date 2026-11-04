import { Navigate, Outlet, useLocation } from 'react-router'
import { Logo } from '@/components/common/Logo'
import { useAuth } from './authContext'

const RETURN_KEY = 'h8.returnTo'

function readReturnTo(): string | null {
  try {
    return window.sessionStorage.getItem(RETURN_KEY)
  } catch {
    return null
  }
}

export function RequireAuth() {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Logo className="animate-pulse text-4xl" />
      </div>
    )
  }
  if (status === 'signedOut') {
    const path = location.pathname + location.search
    // Survives the Google redirect, which always comes back to the app root.
    try {
      if (path !== '/') window.sessionStorage.setItem(RETURN_KEY, path)
    } catch {
      // ignore
    }
    return <Navigate to="/login" replace state={{ from: path }} />
  }

  const returnTo = readReturnTo()
  if (returnTo) {
    try {
      window.sessionStorage.removeItem(RETURN_KEY)
    } catch {
      // ignore
    }
    if (returnTo !== location.pathname + location.search) return <Navigate to={returnTo} replace />
  }
  return <Outlet />
}
