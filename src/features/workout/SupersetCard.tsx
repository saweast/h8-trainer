import { EllipsisVertical, Layers, Plus, Trash2, Unlink } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface SupersetCardProps {
  letter: string
  /** Rounds done and in total; `done` is left out when it differs per client. */
  rounds: { done?: number; total: number }
  readOnly?: boolean
  /** Per-client sessions say "for everyone". */
  deleteLabel?: string
  onAddRound: () => void
  onUngroup: () => void
  onRemove: () => void
  /** The superset's exercises, in order (each a keyed element). */
  children: ReactNode
}

/** Exercises done back to back: one frame, a rail on the left, rounds added all at once. */
export function SupersetCard({ letter, rounds, readOnly = false, deleteLabel, onAddRound, onUngroup, onRemove, children }: SupersetCardProps) {
  const { t } = useTranslation()
  const { done, total } = rounds
  const progress =
    done === undefined
      ? t('superset.rounds', { count: total })
      : done >= total && total > 0
        ? t('superset.allRoundsDone')
        : t('superset.round', { current: Math.min(done + 1, total), total })

  return (
    <section aria-label={t('superset.named', { letter })} className="rounded-2xl border bg-card p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Layers className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-sm leading-tight">{t('superset.named', { letter })}</h2>
          <p className="truncate text-xs text-muted-foreground">
            {progress} · {t('superset.restAfter')}
          </p>
        </div>
        {readOnly ? null : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-touch" aria-label={t('superset.menu')} className="-mr-1">
                <EllipsisVertical />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onUngroup}>
                <Unlink />
                {t('superset.ungroup')}
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={onRemove}>
                <Trash2 />
                {deleteLabel ?? t('superset.deleteAll')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div className="relative pl-3">
        <span className="absolute inset-y-1 left-0 w-1 rounded-full bg-primary/70" aria-hidden />
        <div className="flex flex-col divide-y divide-dashed *:py-3 *:first:pt-0 *:last:pb-0">{children}</div>
      </div>

      {readOnly ? null : (
        <Button
          variant="ghost"
          size="touch"
          className="mt-3 w-full bg-secondary/50"
          onClick={onAddRound}
          aria-label={t('superset.addRoundLabel')}
        >
          <Plus aria-hidden />
          {t('superset.addRound')}
        </Button>
      )}
    </section>
  )
}
