import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  body?: string
  children?: ReactNode
  className?: string
}

export function EmptyState({ icon: Icon, title, body, children, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center rounded-2xl border border-dashed px-6 py-10 text-center', className)}>
      <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <Icon className="size-6" aria-hidden />
      </div>
      <h2 className="text-base font-medium">{title}</h2>
      {body ? <p className="mt-1 max-w-xs text-sm text-muted-foreground">{body}</p> : null}
      {children ? <div className="mt-5 flex w-full flex-col gap-2">{children}</div> : null}
    </div>
  )
}
