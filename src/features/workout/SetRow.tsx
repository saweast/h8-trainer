import { Check, Trophy } from 'lucide-react'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { currentLanguage } from '@/i18n'
import { formatKg, parseWeight } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { PreviousSet } from '@/lib/templatePrefill'
import type { WorkoutSet } from './api'

type SetPatch = Partial<Pick<WorkoutSet, 'weightKg' | 'reps' | 'isWarmup' | 'completedAt'>>

interface SetRowProps {
  set: WorkoutSet
  /** "1", "2"… for working sets, "Р"/"W" for warm-ups. */
  label: string
  last: PreviousSet | undefined
  isPr: boolean
  readOnly?: boolean
  onChange: (patch: SetPatch) => void
  /** Called with the values just saved, so the caller can check records and start rest. */
  onCompleted: (values: { weightKg: number; reps: number }) => void
  onDelete: () => void
}

/** Input text for a stored weight: "" for 0, decimal comma in Ukrainian. */
function weightText(kg: number, lang: string): string {
  if (!kg) return ''
  const text = String(kg)
  return lang === 'uk' ? text.replace('.', ',') : text
}

export const SET_GRID = 'grid grid-cols-[2rem_minmax(0,1fr)_4.5rem_3.5rem_2.75rem] items-center gap-2'

export function SetRow({ set, label, last, isPr, readOnly = false, onChange, onCompleted, onDelete }: SetRowProps) {
  const { t } = useTranslation()
  const lang = currentLanguage()
  const done = set.completedAt !== null
  const repsRef = useRef<HTMLInputElement>(null)

  // What the user typed stays authoritative for this row; untouched fields show the stored value.
  const [weightDraft, setWeightDraft] = useState<string | null>(null)
  const [repsDraft, setRepsDraft] = useState<string | null>(null)
  const weight = weightDraft ?? weightText(set.weightKg, lang)
  const reps = repsDraft ?? (set.reps ? String(set.reps) : '')

  const parsed = () => ({
    weightKg: weight.trim() === '' ? 0 : parseWeight(weight),
    reps: reps.trim() === '' ? 0 : Number.parseInt(reps, 10),
  })

  const commit = () => {
    const p = parsed()
    const patch: SetPatch = {}
    if (p.weightKg !== null && p.weightKg !== set.weightKg) patch.weightKg = p.weightKg
    if (Number.isFinite(p.reps) && p.reps !== set.reps) patch.reps = p.reps
    if (Object.keys(patch).length) onChange(patch)
  }

  // Save while typing too (after a short pause), not only on blur: a closed tab or a locked phone
  // shouldn't lose a weight that was typed but never left.
  const commitLater = useEffectEvent(() => commit())
  useEffect(() => {
    if (readOnly || (weightDraft === null && repsDraft === null)) return
    const timer = window.setTimeout(commitLater, 1200)
    return () => window.clearTimeout(timer)
  }, [weightDraft, repsDraft, readOnly])

  const toggleDone = () => {
    if (done) {
      onChange({ completedAt: null })
      return
    }
    const p = parsed()
    if (!Number.isFinite(p.reps) || p.reps <= 0) {
      toast(t('workout.repsRequired'))
      repsRef.current?.focus()
      return
    }
    const weightKg = p.weightKg ?? set.weightKg
    onChange({ weightKg, reps: p.reps, completedAt: new Date().toISOString() })
    onCompleted({ weightKg, reps: p.reps })
  }

  const inputClass = cn(
    'tabular h-11 w-full rounded-lg border-0 text-center text-base font-medium outline-none transition-colors',
    'placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-ring',
    done ? 'bg-lime-muted text-lime-text dark:text-lime' : 'bg-secondary',
  )

  return (
    <div className={SET_GRID}>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={readOnly}
          aria-label={t('workout.setMenu')}
          className={cn(
            'flex h-11 items-center justify-center rounded-lg text-sm font-medium',
            isPr ? 'text-pr' : set.isWarmup ? 'text-warning-text' : 'text-muted-foreground',
          )}
        >
          {isPr ? <Trophy className="size-4" aria-label={t('workout.pr')} /> : label}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onSelect={() => onChange({ isWarmup: !set.isWarmup })}>
            {set.isWarmup ? t('workout.markWorking') : t('workout.markWarmup')}
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={onDelete}>
            {t('workout.deleteSet')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <span className="tabular truncate text-[13px] text-muted-foreground">
        {last ? `${formatKg(last.weightKg, lang)} × ${last.reps}` : '—'}
      </span>

      <input
        inputMode="decimal"
        enterKeyHint="next"
        aria-label={t('workout.kg')}
        value={weight}
        placeholder={last ? weightText(last.weightKg, lang) || '0' : '0'}
        readOnly={readOnly}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setWeightDraft(e.target.value)}
        onBlur={commit}
        className={inputClass}
      />
      <input
        ref={repsRef}
        inputMode="numeric"
        enterKeyHint="done"
        aria-label={t('workout.reps')}
        value={reps}
        placeholder={last ? String(last.reps) : '0'}
        readOnly={readOnly}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setRepsDraft(e.target.value.replace(/\D/g, '').slice(0, 3))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
        className={inputClass}
      />

      <button
        type="button"
        onClick={toggleDone}
        disabled={readOnly}
        aria-pressed={done}
        aria-label={done ? t('workout.uncomplete') : t('workout.complete')}
        className={cn(
          'flex size-11 items-center justify-center rounded-full transition-colors',
          done ? 'bg-primary text-primary-foreground' : 'border-2 border-border text-muted-foreground hover:border-ring',
        )}
      >
        <Check className="size-5" aria-hidden />
      </button>
    </div>
  )
}
