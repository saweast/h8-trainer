import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

/** Pill-shaped filter / toggle chip. `active` = lime fill (one selection per group). */
export function Chip({ active = false, className, ...props }: ComponentProps<'button'> & { active?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium whitespace-nowrap transition-colors',
        'focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
        active ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-secondary/70',
        className,
      )}
      {...props}
    />
  )
}
