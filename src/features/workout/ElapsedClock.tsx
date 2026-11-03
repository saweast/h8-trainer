import { formatClock } from '@/lib/time'
import { useNow } from './useNow'

export function ElapsedClock({ since, className }: { since: string; className?: string }) {
  const now = useNow(1000)
  return <span className={className}>{formatClock((now - new Date(since).getTime()) / 1000)}</span>
}
