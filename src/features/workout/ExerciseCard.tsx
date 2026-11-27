import { CornerDownRight, EllipsisVertical, Plus, SlidersHorizontal } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { SegmentedControl } from '@/components/common/SegmentedControl'
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
import { chainEnd, DEFAULT_DROP_PCT, DROP_PCT_OPTIONS, suggestDropWeight, workingChains } from '@/lib/dropSets'
import { detectPrs, type ExerciseRecords } from '@/lib/records'
import type { PreviousSet } from '@/lib/templatePrefill'
import type { ExerciseFeedbackPatch, WorkoutExercise, WorkoutSet } from './api'
import { ExerciseFeedback } from './ExerciseFeedback'
import { SET_GRID, SetRow } from './SetRow'

type SetPatch = Partial<Pick<WorkoutSet, 'weightKg' | 'reps' | 'isWarmup' | 'rpe' | 'completedAt'>>

interface ExerciseCardProps {
  item: WorkoutExercise
  exercise: Exercise | undefined
  lastTime: PreviousSet[]
  records: ExerciseRecords | null
  setupNotes: string | null
  /** How much lighter a new drop is, %; null = default. */
  dropPct: number | null
  /** Live view of someone else's session: sets and exercises can't be changed, feedback can. */
  readOnly?: boolean
  /** "A1", "A2"… inside a superset. */
  label?: string
  /** Inside a superset card: no frame of its own, and "add set" moves into the menu. */
  embedded?: boolean
  /** The superset's next set to do, highlighted. */
  nextSetId?: string | null
  /** Extra menu entries (superset grouping). */
  menuItems?: ReactNode
  onSetChange: (setId: string, patch: SetPatch) => void
  /** `dropNext`: a drop follows straight away, so no rest. */
  onSetCompleted: (set: WorkoutSet, isPr: boolean, dropNext: boolean) => void
  onSetDelete: (setId: string) => void
  onAddSet: () => void
  onAddDrop: (afterSetId: string, weightKg: number) => void
  onRemove: () => void
  onSaveSetup: (notes: string) => void
  onSaveDropPct: (pct: number) => void
  onFeedback: (patch: ExerciseFeedbackPatch) => void
}

export function ExerciseCard({
  item,
  exercise,
  lastTime,
  records,
  setupNotes,
  dropPct,
  readOnly = false,
  label,
  embedded = false,
  nextSetId = null,
  menuItems,
  onSetChange,
  onSetCompleted,
  onSetDelete,
  onAddSet,
  onAddDrop,
  onRemove,
  onSaveSetup,
  onSaveDropPct,
  onFeedback,
}: ExerciseCardProps) {
  const { t } = useTranslation()
  const lang = currentLanguage()
  const [editingSetup, setEditingSetup] = useState(false)
  const [editingDrop, setEditingDrop] = useState(false)
  const pct = dropPct ?? DEFAULT_DROP_PCT
  const weighted = exercise?.equipment !== 'bodyweight'
  const [setupDraft, setSetupDraft] = useState(setupNotes ?? '')

  const saveSetup = () => {
    setEditingSetup(false)
    if ((setupNotes ?? '') !== setupDraft.trim()) onSaveSetup(setupDraft)
  }

  return (
    <section className={embedded ? undefined : 'rounded-2xl border bg-card p-3'}>
      <div className="mb-2 flex items-start gap-2">
        {exercise ? <ExerciseThumb slug={exercise.slug} className="mt-0.5" /> : null}
        <div className="min-w-0 flex-1 pt-1">
          <h2 className="text-[15px] leading-snug font-medium">
            {label ? <SupersetLabel label={label} /> : null}
            {exercise ? exerciseName(exercise, lang) : '…'}
          </h2>
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
            {embedded ? (
              <DropdownMenuItem onSelect={onAddSet}>
                <Plus />
                {t('superset.addSet')}
              </DropdownMenuItem>
            ) : null}
            {weighted ? (
              <DropdownMenuItem onSelect={() => setEditingDrop(true)}>
                <CornerDownRight />
                {t('workout.dropPctMenu', { pct })}
              </DropdownMenuItem>
            ) : null}
            {menuItems}
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

      {editingDrop ? (
        <div className="mb-2 flex flex-col gap-1.5">
          <p className="pl-1 text-xs text-muted-foreground">{t('workout.dropPctHint')}</p>
          <SegmentedControl
            value={String(pct)}
            options={DROP_PCT_OPTIONS.map((p) => ({ value: String(p), label: `−${p}%` }))}
            onChange={(value) => {
              setEditingDrop(false)
              if (Number(value) !== pct) onSaveDropPct(Number(value))
            }}
            ariaLabel={t('workout.dropPct')}
          />
        </div>
      ) : null}

      <SetsTable
        sets={item.sets}
        lastTime={lastTime}
        records={records}
        readOnly={readOnly}
        nextSetId={nextSetId}
        hideAddSet={embedded}
        onSetChange={onSetChange}
        onSetCompleted={onSetCompleted}
        onSetDelete={onSetDelete}
        onAddSet={onAddSet}
        onAddDrop={onAddDrop}
        weightStepKg={exercise?.weightStepKg}
        dropPct={pct}
      />

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

interface SetsTableProps {
  sets: WorkoutSet[]
  lastTime: PreviousSet[]
  records: ExerciseRecords | null
  readOnly?: boolean
  nextSetId?: string | null
  /** In a superset the card adds whole rounds instead. */
  hideAddSet?: boolean
  /** The machine's weight step, for the weight of a new drop. */
  weightStepKg?: number
  /** How much lighter a new drop is without history, %. */
  dropPct?: number
  onSetChange: (setId: string, patch: SetPatch) => void
  /** `dropNext`: a drop follows straight away, so no rest. */
  onSetCompleted: (set: WorkoutSet, isPr: boolean, dropNext: boolean) => void
  onSetDelete: (setId: string) => void
  onAddSet: () => void
  onAddDrop: (afterSetId: string, weightKg: number) => void
}

/** Set rows (set · last time · kg · reps · done) with "add set" — one person's sets of an exercise. */
export function SetsTable({
  sets,
  lastTime,
  records,
  readOnly = false,
  nextSetId = null,
  hideAddSet = false,
  weightStepKg = 2.5,
  dropPct = DEFAULT_DROP_PCT,
  onSetChange,
  onSetCompleted,
  onSetDelete,
  onAddSet,
  onAddDrop,
}: SetsTableProps) {
  const { t } = useTranslation()
  const rows = labelSets(sets, lastTime, t('workout.warmupShort'))
  const lastChains = workingChains(lastTime)

  // The new drop goes after the chain's last set, at last time's weight for that drop or dropPct% less.
  const addDrop = (index: number) => {
    const end = chainEnd(sets, index)
    const { chain, step } = rows[end]
    const lastTimeKg = lastChains[chain]?.drops[step]?.weightKg
    onAddDrop(sets[end].id, suggestDropWeight(sets[end].weightKg, weightStepKg, lastTimeKg, dropPct))
  }

  return (
    <>
      <div className={`${SET_GRID} mb-1 text-[11px] text-muted-foreground`}>
        <span className="text-center">{t('workout.set')}</span>
        <span>{t('workout.lastTime')}</span>
        <span className="text-center">{t('workout.kg')}</span>
        <span className="text-center">{t('workout.reps')}</span>
        <span />
      </div>

      <div className="flex flex-col gap-1.5">
        {rows.map(({ set, label, last, drop }, i) => {
          const isPr = set.completedAt !== null && detectPrs(set, records).length > 0
          return (
            <SetRow
              key={set.id}
              set={set}
              label={label}
              drop={drop}
              hasDrops={!drop && !set.isWarmup && Boolean(sets[i + 1]?.isDrop)}
              last={last}
              isPr={isPr}
              isNext={set.id === nextSetId}
              readOnly={readOnly}
              onChange={(patch) => onSetChange(set.id, patch)}
              onCompleted={(values) => {
                // Check records with the values being saved, not the cached row.
                const isNewPr = detectPrs({ ...values, isWarmup: set.isWarmup, isDrop: set.isDrop }, records).length > 0
                const next = sets[i + 1]
                onSetCompleted({ ...set, ...values }, isNewPr, Boolean(next?.isDrop && next.completedAt === null))
              }}
              onDelete={() => onSetDelete(set.id)}
              onAddDrop={set.isWarmup ? undefined : () => addDrop(i)}
            />
          )
        })}
      </div>

      {readOnly || hideAddSet ? null : (
        <Button variant="ghost" size="touch" className="mt-2 w-full bg-secondary/50" onClick={onAddSet}>
          <Plus aria-hidden />
          {t('workout.addSet')}
        </Button>
      )}
    </>
  )
}

/** "A1" before an exercise name in a superset. */
export function SupersetLabel({ label }: { label: string }) {
  return (
    <span className="tabular mr-1.5 inline-flex h-5 min-w-7 -translate-y-px items-center justify-center rounded-md bg-primary px-1.5 align-middle text-[11px] font-semibold text-primary-foreground">
      {label}
    </span>
  )
}

interface LabeledSet {
  set: WorkoutSet
  label: string
  last: PreviousSet | undefined
  /** A drop of the set above. */
  drop: boolean
  /** Working set (chain) index, -1 for warm-ups. */
  chain: number
  /** Place in the chain: 0 for the set itself, 1… for its drops. */
  step: number
}

/**
 * Numbers working sets 1..n, labels warm-ups and drops, and pairs each with the same set from
 * last time: the n-th working set with last time's n-th, its k-th drop with that set's k-th drop.
 */
function labelSets(sets: WorkoutSet[], lastTime: PreviousSet[], warmupLabel: string): LabeledSet[] {
  const lastWarmups = lastTime.filter((s) => s.isWarmup)
  const lastChains = workingChains(lastTime)
  const rows: LabeledSet[] = []
  let warmups = 0
  let chain = -1
  let step = 0
  for (const set of sets) {
    if (set.isWarmup) {
      rows.push({ set, label: warmupLabel, last: lastWarmups[warmups++], drop: false, chain: -1, step: 0 })
    } else if (set.isDrop && chain >= 0) {
      step++
      rows.push({ set, label: '', last: lastChains[chain]?.drops[step - 1], drop: true, chain, step })
    } else {
      chain++
      step = 0
      rows.push({ set, label: String(chain + 1), last: lastChains[chain]?.head, drop: false, chain, step })
    }
  }
  return rows
}
