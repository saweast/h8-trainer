import { Navigate, Outlet, useLocation } from 'react-router'
import { Logo } from '@/components/common/Logo'
import { useAuth } from './authContext'

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
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }
  return <Outlet />
}
