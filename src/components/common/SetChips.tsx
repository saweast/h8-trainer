import { useTranslation } from 'react-i18next'
import { currentLanguage } from '@/i18n'
import { groupChains } from '@/lib/dropSets'
import { formatKg } from '@/lib/format'
import { cn } from '@/lib/utils'

export interface ChipSet {
  weightKg: number
  reps: number
  isWarmup: boolean
  isDrop?: boolean
}

interface SetChipsProps<T extends ChipSet> {
  sets: T[]
  /** Highlights a set (its chain's first set) as a personal record. */
  isPr?: (set: T) => boolean
  className?: string
}

/** Logged sets as chips. A drop chain is one chip: "80 × 10 → 60 × 8 → 40 × 6". */
export function SetChips<T extends ChipSet>({ sets, isPr, className }: SetChipsProps<T>) {
  const { t } = useTranslation()
  const lang = currentLanguage()
  const text = (s: T) => `${formatKg(s.weightKg, lang)} × ${s.reps}`

  return (
    <ul className={cn('flex flex-wrap gap-1.5', className)}>
      {groupChains(sets).map(({ head, drops }, i) => (
        <li
          key={i}
          title={drops.length ? t('workout.dropSet') : undefined}
          className={cn(
            'tabular rounded-lg px-2 py-1 text-xs',
            head.isWarmup
              ? 'bg-secondary/60 text-muted-foreground'
              : isPr?.(head)
                ? 'bg-pr-muted font-medium text-pr-text'
                : 'bg-secondary font-medium',
          )}
        >
          {text(head)}
          {drops.map((d, k) => (
            <span key={k} className="font-normal text-muted-foreground">
              <span aria-hidden> → </span>
              <span className="sr-only">, {t('workout.drop')}: </span>
              {text(d)}
            </span>
          ))}
        </li>
      ))}
    </ul>
  )
}
