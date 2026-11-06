import { Navigate, Outlet } from 'react-router'
import { Skeleton } from '@/components/ui/skeleton'
import { useMode } from '@/features/mode/modeContext'

/** Admin pages only. The database checks `is_admin` again in every admin RPC. */
export function RequireAdmin() {
  const { isAdmin, ready } = useMode()
  if (!ready) return <Skeleton className="h-64 rounded-2xl" />
  if (!isAdmin) return <Navigate to="/" replace />
  return <Outlet />
}
