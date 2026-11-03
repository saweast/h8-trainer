import type { ReactNode } from 'react'

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div className="min-w-0">
        {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
        <h1 className="font-heading truncate text-[22px] leading-tight">{title}</h1>
      </div>
      {action}
    </div>
  )
}
