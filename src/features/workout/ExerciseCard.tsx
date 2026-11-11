import { EllipsisVertical, Plus, SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { exerciseName } from '@/data/exercises'
import { ExerciseHintButton } from '@/features/exercises/guide/ExerciseHintButton'
import { ExerciseThumb } from '@/features/exercises/guide/ExerciseThumb'
import type { Exercise } from '@/features/exercises/api'
import { currentLanguage } from '@/i18n'
import { detectPrs, type ExerciseRecords } from '@/lib/records'
import type { PreviousSet } from '@/lib/templatePrefill'
import type { ExerciseFeedbackPatch, WorkoutExercise, WorkoutSet } from './api'
import { ExerciseFeedback } from './ExerciseFeedback'
import { SET_GRID, SetRow } from './SetRow'

type SetPatch = Partial<Pick<WorkoutSet, 'weightKg' | 'reps' | 'isWarmup' | 'completedAt'>>

interface ExerciseCardProps {
  item: WorkoutExercise
  exercise: Exercise | undefined
  lastTime: PreviousSet[]
  records: ExerciseRecords | null
  setupNotes: string | null
  /** Live view of someone else's session: sets and exercises can't be changed, feedback can. */
  readOnly?: boolean
  onSetChange: (setId: string, patch: SetPatch) => void
  onSetCompleted: (set: WorkoutSet, isPr: boolean) => void
  onSetDelete: (setId: string) => void
  onAddSet: () => void
  onRemove: () => void
  onSaveSetup: (notes: string) => void
  onFeedback: (patch: ExerciseFeedbackPatch) => void
}

export function ExerciseCard({
  item,
  exercise,
  lastTime,
  records,
  setupNotes,
  readOnly = false,
  onSetChange,
  onSetCompleted,
  onSetDelete,
  onAddSet,
  onRemove,
  onSaveSetup,
  onFeedback,
}: ExerciseCardProps) {
  const { t } = useTranslation()
  const lang = currentLanguage()
  const [editingSetup, setEditingSetup] = useState(false)
  const [setupDraft, setSetupDraft] = useState(setupNotes ?? '')

  const rows = labelSets(item.sets, lastTime, t('workout.warmupShort'))

  const saveSetup = () => {
    setEditingSetup(false)
    if ((setupNotes ?? '') !== setupDraft.trim()) onSaveSetup(setupDraft)
  }

  return (
    <section className="rounded-2xl border bg-card p-3">
      <div className="mb-2 flex items-start gap-2">
        {exercise ? <ExerciseThumb slug={exercise.slug} className="mt-0.5" /> : null}
        <div className="min-w-0 flex-1 pt-1">
          <h2 className="text-[15px] leading-snug font-medium">{exercise ? exerciseName(exercise, lang) : '…'}</h2>
          {exercise ? (
            <p className="text-xs text-muted-foreground">
              {t(`equipment.${exercise.equipment}`)} · {t(`muscle.${exercise.muscle}`)}
            </p>
          ) : null}
        </div>
        {exercise ? <ExerciseHintButton exercise={exercise} className="-mr-2" /> : null}
        {readOnly ? null : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-touch" aria-label={t('workout.exerciseMenu')}>
              <EllipsisVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setEditingSetup(true)}>
              <SlidersHorizontal />
              {t('workout.setupNotes')}
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={onRemove}>
              {t('workout.deleteExercise')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        )}
      </div>

      {editingSetup ? (
        <Input
          autoFocus
          value={setupDraft}
          onChange={(e) => setSetupDraft(e.target.value)}
          onBlur={saveSetup}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
          placeholder={t('workout.setupPlaceholder')}
          aria-label={t('workout.setupNotes')}
          maxLength={200}
          className="mb-2 h-10 rounded-lg"
        />
      ) : setupNotes ? (
        <button
          type="button"
          onClick={() => setEditingSetup(true)}
          className="mb-2 flex items-center gap-1.5 pl-1 text-left text-xs text-muted-foreground"
        >
          <SlidersHorizontal className="size-3.5 shrink-0" aria-hidden />
          {setupNotes}
        </button>
      ) : null}

      <div className={`${SET_GRID} mb-1 text-[11px] text-muted-foreground`}>
        <span className="text-center">{t('workout.set')}</span>
        <span>{t('workout.lastTime')}</span>
        <span className="text-center">{t('workout.kg')}</span>
        <span className="text-center">{t('workout.reps')}</span>
        <span />
      </div>

      <div className="flex flex-col gap-1.5">
        {rows.map(({ set, label, last }) => {
          const isPr = set.completedAt !== null && detectPrs(set, records).length > 0
          return (
            <SetRow
              key={set.id}
              set={set}
              label={label}
              last={last}
              isPr={isPr}
              readOnly={readOnly}
              onChange={(patch) => onSetChange(set.id, patch)}
              onCompleted={(values) => {
                // Check records with the values being saved, not the cached row.
                const isNewPr = detectPrs({ ...values, isWarmup: set.isWarmup }, records).length > 0
                onSetCompleted({ ...set, ...values }, isNewPr)
              }}
              onDelete={() => onSetDelete(set.id)}
            />
          )
        })}
      </div>

      {readOnly ? null : (
        <Button variant="ghost" size="touch" className="mt-2 w-full bg-secondary/50" onClick={onAddSet}>
          <Plus aria-hidden />
          {t('workout.addSet')}
        </Button>
      )}

      {item.sets.some((s) => s.completedAt !== null) || item.difficulty !== null ? (
        <ExerciseFeedback
          difficulty={item.difficulty}
          text={item.athleteFeedback}
          onChange={onFeedback}
          className="mt-3 border-t pt-3"
        />
      ) : null}
    </section>
  )
}

/** Numbers working sets 1..n, labels warm-ups, and pairs each with the same set from last time. */
function labelSets(sets: WorkoutSet[], lastTime: PreviousSet[], warmupLabel: string) {
  const lastWarmups = lastTime.filter((s) => s.isWarmup)
  const lastWorking = lastTime.filter((s) => !s.isWarmup)
  const rows: { set: WorkoutSet; label: string; last: PreviousSet | undefined }[] = []
  let warmups = 0
  let working = 0
  for (const set of sets) {
    if (set.isWarmup) {
      rows.push({ set, label: warmupLabel, last: lastWarmups[warmups++] })
    } else {
      rows.push({ set, label: String(working + 1), last: lastWorking[working++] })
    }
  }
  return rows
}
