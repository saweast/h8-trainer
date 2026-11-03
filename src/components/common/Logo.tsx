import { cn } from '@/lib/utils'

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('font-heading text-xl leading-none tracking-tight', className)}>
      h8<span className="text-lime">.</span>
    </span>
  )
}
