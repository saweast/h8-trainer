import { useIsMutating, useQueryClient } from '@tanstack/react-query'
import {
  ChevronDown,
  ChevronRight,
  Dumbbell,
  EllipsisVertical,
  Layers,
  Link2,
  Plus,
  SearchX,
  SlidersHorizontal,
  Unlink,
  Users,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { EmptyState } from '@/components/common/EmptyState'
import { UserAvatar } from '@/components/common/UserAvatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { exerciseName, type MuscleGroup } from '@/data/exercises'
import { settingsKey, useExerciseMap, useExerciseSettings, type Exercise, type ExerciseSettings } from '@/features/exercises/api'
import { ExerciseHintButton } from '@/features/exercises/guide/ExerciseHintButton'
import { ExerciseThumb } from '@/features/exercises/guide/ExerciseThumb'
import { ExercisePicker } from '@/features/exercises/ExercisePicker'
import { currentLanguage } from '@/i18n'
import { formatVolume } from '@/lib/format'
import { findRowExercise, groupRows, nextGroupPosition, type GroupRow } from '@/lib/groupRows'
import { afterSetDone, joinNeighbour, leaveSuperset, nextSupersetNumber, nextUp, roundCount, toBlocks } from '@/lib/superset'
import { prefillSets } from '@/lib/templatePrefill'
import { autoTitle, workoutTotals } from '@/lib/workoutStats'
import {
  fetchLastPerformance,
  useExerciseRecords,
  useLastPerformance,
  useWorkoutActions,
  workoutKey,
  type Workout,
  type WorkoutExercise,
  type WorkoutSet,
} from './api'
import { ElapsedClock } from './ElapsedClock'
import { SetsTable, SupersetLabel } from './ExerciseCard'
import { FinishDrawer } from './FinishDrawer'
import { useDiscardGroup, useFinishGroup, useGroupMembers, useGroupWorkouts, type GroupMember } from './groupApi'
import { RestTimerBar } from './RestTimerBar'
import { SupersetCard } from './SupersetCard'
import { useRestTimer } from './useRestTimer'
import { useFlushOnLeave } from './useFlushOnLeave'
import { useWakeLock } from './useWakeLock'

type Actions = ReturnType<typeof useWorkoutActions>

interface Entry {
  member: GroupMember
  workout: Workout
}

/** A trainer's split session: shared exercises, each client's own weight and reps. */
export function GroupWorkoutPage() {
  const { t } = useTranslation()
  const { groupId } = useParams()
  const { data: members, isPending } = useGroupMembers(groupId)
  const { workouts, pending } = useGroupWorkouts(members)

  if (isPending || (members?.length && pending)) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-3 px-4 pt-20">
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    )
  }

  const entries: Entry[] = (members ?? []).flatMap((member, i) => (workouts[i] ? [{ member, workout: workouts[i] }] : []))
  if (!groupId || entries.length === 0) {
    return (
      <div className="mx-auto max-w-md px-4 pt-20">
        <EmptyState icon={SearchX} title={t('workout.notFound')}>
          <Button asChild variant="secondary" size="touch">
            <Link to="/trainer">{t('group.toClients')}</Link>
          </Button>
        </EmptyState>
      </div>
    )
  }
  if (entries.every((e) => e.workout.finishedAt)) return <GroupSummary entries={entries} />
  return <ActiveGroup groupId={groupId} entries={entries} />
}

function ActiveGroup({ groupId, entries }: { groupId: string; entries: Entry[] }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { map: exercises } = useExerciseMap()
  const members = entries.map((e) => e.member)
  const workoutIds = entries.map((e) => e.workout.id)
  const registry = useRef(new Map<string, Actions>())
  const rest = useRestTimer(groupId)
  const finish = useFinishGroup(groupId, members)
  const discard = useDiscardGroup(groupId, members)
  const [picker, setPicker] = useState<'one' | 'superset' | null>(null)
  const [finishOpen, setFinishOpen] = useState(false)
  const celebrated = useRef(new Set<string>())
  const saving = useIsMutating({ predicate: (m) => workoutIds.some((id) => m.options.scope?.id === `workout:${id}`) }) > 0
  const lang = currentLanguage()

  useWakeLock(true)
  useFlushOnLeave(workoutIds)

  const register = useCallback((workoutId: string, actions: Actions | null) => {
    if (actions) registry.current.set(workoutId, actions)
    else registry.current.delete(workoutId)
  }, [])

  const open = entries.filter((e) => !e.workout.finishedAt)
  const rows = groupRows(entries.map((e) => e.workout))
  const startedAt = entries.map((e) => e.workout.startedAt).sort()[0]
  const names = members.map((m) => m.name).join(', ')

  const addFor = async (entry: Entry, exerciseId: string, position: number, superset: number | null = null) => {
    const { athleteId, id: workoutId } = entry.workout
    let previous = [] as Awaited<ReturnType<typeof fetchLastPerformance>>
    try {
      previous = await queryClient.fetchQuery({
        queryKey: ['last-performance', athleteId, exerciseId, workoutId],
        queryFn: () => fetchLastPerformance(athleteId, exerciseId, workoutId),
        staleTime: 5 * 60_000,
      })
    } catch {
      // no history available — start with empty sets
    }
    const workingCount = previous.filter((s) => !s.isWarmup).length
    const planned = prefillSets(
      { targetSets: workingCount || 3, targetRepsMin: null, targetRepsMax: null, targetWeightKg: null },
      previous,
    )
    registry.current.get(workoutId)?.addExercise(exerciseId, planned, position, superset)
  }

  // One exercise for everyone, at the same place; each client's sets come from their own history.
  const addExercise = (exercise: Exercise) => {
    const position = nextGroupPosition(entries.map((e) => e.workout))
    for (const entry of open) void addFor(entry, exercise.id, position)
  }

  // A superset for everyone: the exercises one after another, with one new number for all clients.
  const addSuperset = (list: Exercise[]) => {
    const all = entries.map((e) => e.workout)
    const position = nextGroupPosition(all)
    const superset = nextSupersetNumber(all.flatMap((w) => w.exercises))
    for (const entry of open) list.forEach((e, i) => void addFor(entry, e.id, position + i, superset))
  }

  const removeRow = (row: GroupRow) => {
    for (const { workout } of open) {
      const item = findRowExercise(workout.exercises, row)
      if (item) registry.current.get(workout.id)?.removeExercise(item.id)
    }
  }

  /** The same superset change for every client (rows → that client's exercises). */
  const regroup = (changes: Map<GroupRow, number | null>) => {
    for (const { workout } of open) {
      const byExercise = new Map<string, number | null>()
      for (const [row, superset] of changes) {
        const item = findRowExercise(workout.exercises, row)
        if (item) byExercise.set(item.id, superset)
      }
      registry.current.get(workout.id)?.setSupersets(byExercise)
    }
  }

  const addRound = (members: GroupRow[]) => {
    for (const { workout } of open) {
      for (const row of members) {
        const item = findRowExercise(workout.exercises, row)
        if (item) registry.current.get(workout.id)?.addSet(item.id)
      }
    }
  }

  /** A client's rest for an exercise: their setting for this machine → the exercise default. */
  const restOf = (entry: Entry, exerciseId: string) =>
    queryClient.getQueryData<Map<string, ExerciseSettings>>(settingsKey(entry.workout.athleteId))?.get(exerciseId)?.restS ??
    exercises.get(exerciseId)?.defaultRestS ??
    90

  /** This client's exercises of a superset (only the ones they have). */
  const membersOf = (workout: Workout, members: GroupRow[]) =>
    members.flatMap((row) => findRowExercise(workout.exercises, row) ?? [])

  const onSetCompleted = (entry: Entry, row: GroupRow, set: WorkoutSet, restS: number, isPr: boolean) => {
    const { member } = entry
    const exerciseId = row.exerciseId
    const block = toBlocks(rows).find((b) => b.kind === 'superset' && b.items.includes(row))
    if (block?.kind === 'superset') {
      // The set is already done in the cache; this render's workout may not show it yet.
      const now = queryClient.getQueryData<Workout>(workoutKey(entry.workout.id)) ?? entry.workout
      const { rest: roundClosed, next } = afterSetDone(membersOf(now, block.items), set.id)
      if (roundClosed) {
        rest.start(Math.max(restS, ...block.items.map((r) => restOf(entry, r.exerciseId))))
      } else if (next) {
        // The shared timer may be someone else's rest: leave it running.
        const at = block.items.findIndex((r) => findRowExercise(now.exercises, r)?.id === next.exerciseId)
        const exercise = exercises.get(block.items[at]?.exerciseId ?? '')
        toast(
          `${member.name}: ${t('superset.next', {
            name: `${block.letter}${at + 1} ${exercise ? exerciseName(exercise, lang) : ''}`.trim(),
            set: next.round,
          })}`,
          { duration: 2500 },
        )
        requestAnimationFrame(() => document.getElementById(`set-${next.setId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
      }
    } else {
      rest.start(restS)
    }
    const key = `${member.athleteId}:${exerciseId}`
    if (isPr && !celebrated.current.has(key)) {
      celebrated.current.add(key)
      toast.success(t('group.prFor', { name: member.name }))
    }
  }

  const perClient = open.map(({ member, workout }) => {
    const sets = workout.exercises.flatMap((e) => e.sets)
    return {
      member,
      workout,
      done: sets.filter((s) => s.completedAt && !s.isWarmup).length,
      doneAny: sets.filter((s) => s.completedAt).length,
      pending: sets.filter((s) => !s.completedAt).length,
    }
  })
  const doneSets = perClient.reduce((n, c) => n + c.done, 0)
  const pendingSets = perClient.filter((c) => c.doneAny > 0).reduce((n, c) => n + c.pending, 0)

  const finishAll = () => {
    const titles: Record<string, string> = {}
    for (const { workout } of open) {
      titles[workout.id] =
        workout.title ||
        autoTitle(
          workout.exercises.map((e) => ({
            exerciseId: e.exerciseId,
            muscle: (exercises.get(e.exerciseId)?.muscle ?? 'other') as MuscleGroup,
            sets: e.sets,
          })),
          (m) => t(`muscle.${m}`),
        )
    }
    // Commit a weight/reps field still being edited before finishing.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    finish.mutate(
      { titles },
      {
        onSuccess: (results) => {
          rest.stop()
          setFinishOpen(false)
          window.scrollTo({ top: 0 })
          const saved = results.filter((r) => r.completedSets > 0).length
          toast.success(t('group.saved', { saved, total: results.length }))
        },
        onError: (error) => {
          toast.error((error as { code?: string }).code === '22023' ? t('workout.nothingSaved') : t('workout.saveError'))
        },
      },
    )
  }

  const discardAll = () => {
    discard.mutate(undefined, {
      onSuccess: () => {
        rest.stop()
        navigate('/trainer', { replace: true })
      },
      onError: () => toast.error(t('workout.saveError')),
    })
  }

  return (
    <div className="min-h-dvh">
      {entries.map((e) => (
        <ActionsBridge key={e.workout.id} workoutId={e.workout.id} register={register} />
      ))}

      <header className="sticky top-0 z-30 border-b bg-background/95 pt-safe backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex h-14 max-w-md items-center justify-between gap-2 px-2">
          <Button asChild variant="ghost" size="icon-touch" aria-label={t('common.back')}>
            <Link to="/trainer">
              <ChevronDown />
            </Link>
          </Button>
          <div className="min-w-0 text-center">
            <ElapsedClock since={startedAt} className="tabular block text-base font-medium" />
            <p className="truncate text-xs text-muted-foreground" aria-live="polite">
              {saving ? t('workout.saving') : open[0]?.workout.title || t('group.title')}
            </p>
          </div>
          <Button size="touch" variant={doneSets > 0 ? 'default' : 'secondary'} onClick={() => setFinishOpen(true)}>
            {t('workout.finish')}
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-md px-4 pt-3">
        <p className="flex items-center gap-2 rounded-xl bg-trainer-muted px-3 py-2 text-xs text-trainer-text">
          <Users className="size-4 shrink-0" aria-hidden />
          <span className="truncate">{t('group.recordingFor', { names })}</span>
        </p>
      </div>

      <main
        className="mx-auto flex max-w-md flex-col gap-3 px-4 pt-3"
        style={{ paddingBottom: rest.running || rest.justFinished ? '9rem' : '2rem' }}
      >
        {rows.length === 0 ? (
          <EmptyState icon={Dumbbell} title={t('workout.emptyTitle')} body={t('group.emptyBody')}>
            <div className="flex flex-col gap-2">
              <Button size="xl" onClick={() => setPicker('one')}>
                <Plus aria-hidden />
                {t('workout.addExercise')}
              </Button>
              <Button variant="secondary" size="touch" onClick={() => setPicker('superset')}>
                <Layers aria-hidden />
                {t('superset.addLong')}
              </Button>
            </div>
          </EmptyState>
        ) : (
          <>
            {toBlocks(rows).map((block) => {
              const join = (row: GroupRow, direction: 'up' | 'down') => (
                <DropdownMenuItem key={direction} onSelect={() => regroup(joinNeighbour(rows, rows.indexOf(row), direction))}>
                  <Link2 />
                  {direction === 'up' ? t('superset.joinUp') : t('superset.joinDown')}
                </DropdownMenuItem>
              )
              const card = (row: GroupRow, extra: Partial<GroupExerciseCardProps> = {}) => (
                <GroupExerciseCard
                  key={`${row.position}:${row.exerciseId}`}
                  row={row}
                  exercise={exercises.get(row.exerciseId)}
                  entries={entries}
                  onRemove={() => removeRow(row)}
                  onAddFor={(entry) => void addFor(entry, row.exerciseId, row.position, row.superset)}
                  onSetCompleted={(entry, set, restS, isPr) => onSetCompleted(entry, row, set, restS, isPr)}
                  {...extra}
                />
              )
              if (block.kind === 'single') {
                const row = block.item
                const at = rows.indexOf(row)
                return card(row, { menuItems: [at > 0 ? join(row, 'up') : null, at < rows.length - 1 ? join(row, 'down') : null] })
              }
              const members = block.items
              return (
                <SupersetCard
                  key={`superset-${members[0].position}:${members[0].exerciseId}`}
                  letter={block.letter}
                  rounds={{ total: Math.max(0, ...entries.map((e) => roundCount(membersOf(e.workout, members)))) }}
                  deleteLabel={t('superset.deleteForAll')}
                  onAddRound={() => addRound(members)}
                  onUngroup={() => regroup(new Map(members.map((r) => [r, null])))}
                  onRemove={() => members.forEach(removeRow)}
                >
                  {members.map((row, i) => {
                    const at = rows.indexOf(row)
                    const edge = i === 0 || i === members.length - 1
                    return card(row, {
                      embedded: true,
                      label: `${block.letter}${i + 1}`,
                      nextSetFor: (entry) => nextUp(membersOf(entry.workout, members))?.setId ?? null,
                      menuItems: [
                        i === 0 && at > 0 ? join(row, 'up') : null,
                        i === members.length - 1 && at < rows.length - 1 ? join(row, 'down') : null,
                        edge ? (
                          <DropdownMenuItem key="leave" onSelect={() => regroup(leaveSuperset(rows, at))}>
                            <Unlink />
                            {t('superset.leave')}
                          </DropdownMenuItem>
                        ) : null,
                      ],
                    })
                  })}
                </SupersetCard>
              )
            })}
            <div className="flex gap-2">
              <Button variant="secondary" size="xl" className="flex-1" onClick={() => setPicker('one')}>
                <Plus aria-hidden />
                {t('workout.addExercise')}
              </Button>
              <Button variant="secondary" size="xl" onClick={() => setPicker('superset')} aria-label={t('superset.addLong')}>
                <Layers aria-hidden />
                {t('superset.add')}
              </Button>
            </div>
          </>
        )}
      </main>

      <RestTimerBar timer={rest} />
      <ExercisePicker
        open={picker !== null}
        onOpenChange={(isOpen) => setPicker(isOpen ? picker : null)}
        multiple={picker === 'superset'}
        onPick={addExercise}
        onPickMany={addSuperset}
      />
      <FinishDrawer
        open={finishOpen}
        onOpenChange={setFinishOpen}
        doneSets={doneSets}
        pendingSets={pendingSets}
        busy={finish.isPending || discard.isPending}
        onFinish={finishAll}
        onDiscard={discardAll}
        discardConfirmText={t('group.discardConfirm')}
        details={
          <>
            <ul className="mb-1 divide-y rounded-xl border">
              {perClient.map(({ member, done }) => (
                <li key={member.workoutId} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <UserAvatar name={member.name} src={member.avatarUrl} className="size-7" />
                  <span className="min-w-0 flex-1 truncate">{member.name}</span>
                  <span className={done ? 'text-muted-foreground' : 'text-warning-text'}>
                    {done ? t('workout.doneSets', { count: done }) : t('group.nothingFor')}
                  </span>
                </li>
              ))}
            </ul>
            {doneSets > 0 && perClient.some((c) => c.doneAny === 0) ? (
              <p className="mb-1 text-xs text-muted-foreground">{t('group.notSavedNote')}</p>
            ) : null}
          </>
        }
      />
    </div>
  )
}

/** Gives the page each client's workout actions (hooks can't be called in a loop). */
function ActionsBridge({ workoutId, register }: { workoutId: string; register: (id: string, a: Actions | null) => void }) {
  const { t } = useTranslation()
  const actions = useWorkoutActions(workoutId, () => toast.error(t('workout.saveError')))
  useEffect(() => {
    register(workoutId, actions)
  })
  useEffect(() => () => register(workoutId, null), [register, workoutId])
  return null
}

interface GroupExerciseCardProps {
  row: GroupRow
  exercise: Exercise | undefined
  entries: Entry[]
  /** "A1", "A2"… inside a superset. */
  label?: string
  /** Inside a superset card: no frame of its own, rounds are added for everyone at once. */
  embedded?: boolean
  /** Each client's next set in the superset, highlighted. */
  nextSetFor?: (entry: Entry) => string | null
  menuItems?: ReactNode
  onRemove: () => void
  onAddFor: (entry: Entry) => void
  onSetCompleted: (entry: Entry, set: WorkoutSet, restS: number, isPr: boolean) => void
}

/** One exercise with a block per client: their last time, their sets. */
function GroupExerciseCard({
  row,
  exercise,
  entries,
  label,
  embedded = false,
  nextSetFor,
  menuItems,
  onRemove,
  onAddFor,
  onSetCompleted,
}: GroupExerciseCardProps) {
  const { t } = useTranslation()
  const lang = currentLanguage()

  return (
    <section className={embedded ? undefined : 'rounded-2xl border bg-card p-3'}>
      <div className="mb-1 flex items-start gap-2">
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-touch" aria-label={t('workout.exerciseMenu')}>
              <EllipsisVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {menuItems}
            <DropdownMenuItem variant="destructive" onSelect={onRemove}>
              {t('group.deleteForAll')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex flex-col divide-y">
        {entries.map((entry) => {
          const item = findRowExercise(entry.workout.exercises, row)
          return (
            <div key={entry.workout.id} className="py-3 last:pb-0">
              {item ? (
                <MemberSets
                  entry={entry}
                  item={item}
                  exercise={exercise}
                  embedded={embedded}
                  nextSetId={nextSetFor?.(entry) ?? null}
                  onSetCompleted={(set, restS, isPr) => onSetCompleted(entry, set, restS, isPr)}
                />
              ) : (
                <div className="flex items-center gap-2">
                  <MemberLabel member={entry.member} />
                  {entry.workout.finishedAt ? null : (
                    <Button variant="ghost" size="sm" className="text-lime-text dark:text-lime" onClick={() => onAddFor(entry)}>
                      <Plus aria-hidden />
                      {t('group.addFor')}
                    </Button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function MemberLabel({ member, extra }: { member: GroupMember; extra?: string }) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <UserAvatar name={member.name} src={member.avatarUrl} className="size-6 text-[10px]" />
      <span className="truncate text-sm font-medium">{member.name}</span>
      {extra ? <span className="truncate text-xs text-muted-foreground">{extra}</span> : null}
    </span>
  )
}

interface MemberSetsProps {
  entry: Entry
  item: WorkoutExercise
  exercise: Exercise | undefined
  embedded: boolean
  nextSetId: string | null
  onSetCompleted: (set: WorkoutSet, restS: number, isPr: boolean) => void
}

/** One client's sets of the exercise, saved into their own workout. */
function MemberSets({ entry, item, exercise, embedded, nextSetId, onSetCompleted }: MemberSetsProps) {
  const { t } = useTranslation()
  const { workout, member } = entry
  const actions = useWorkoutActions(workout.id, () => toast.error(t('workout.saveError')))
  const { data: lastTime } = useLastPerformance(workout.athleteId, item.exerciseId, workout.id)
  const { data: records } = useExerciseRecords(workout.athleteId, workout.id)
  const { data: settings } = useExerciseSettings(workout.athleteId)
  const setting = settings?.get(item.exerciseId)
  const readOnly = Boolean(workout.finishedAt)

  return (
    <>
      <div className="mb-2 flex items-center gap-2">
        <MemberLabel member={member} />
        {setting?.setupNotes ? (
          <span className="flex max-w-[45%] items-center gap-1 truncate text-xs text-muted-foreground">
            <SlidersHorizontal className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{setting.setupNotes}</span>
          </span>
        ) : null}
      </div>
      <SetsTable
        sets={item.sets}
        lastTime={lastTime ?? []}
        records={records?.get(item.exerciseId) ?? null}
        readOnly={readOnly}
        nextSetId={nextSetId}
        hideAddSet={embedded}
        onSetChange={(setId, patch) => actions.updateSet(setId, patch)}
        onSetCompleted={(set, isPr) => onSetCompleted(set, setting?.restS ?? exercise?.defaultRestS ?? 90, isPr)}
        onSetDelete={(setId) => actions.removeSet(setId)}
        onAddSet={() => actions.addSet(item.id)}
      />
    </>
  )
}

/** After the session: each client's own saved workout. */
function GroupSummary({ entries }: { entries: Entry[] }) {
  const { t } = useTranslation()
  const lang = currentLanguage()
  const { map: exercises } = useExerciseMap()

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-4 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-8">
      <div>
        <h1 className="font-heading text-xl">{t('group.finishedTitle')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('group.summaryHint')}</p>
      </div>
      <ul className="divide-y rounded-2xl border bg-card">
        {entries.map(({ member, workout }) => {
          const totals = workoutTotals(
            workout.exercises.map((e) => ({ exerciseId: e.exerciseId, muscle: exercises.get(e.exerciseId)?.muscle ?? 'other', sets: e.sets })),
          )
          return (
            <li key={workout.id}>
              <Link to={`/workout/${workout.id}`} className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary/50">
                <UserAvatar name={member.name} src={member.avatarUrl} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{member.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {workout.title || t('workout.untitled')} · {t('workout.doneSets', { count: totals.setCount })} ·{' '}
                    {formatVolume(totals.volumeKg, lang)} {t('workout.kg')}
                  </span>
                </span>
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          )
        })}
      </ul>
      <Button asChild size="xl">
        <Link to="/trainer">{t('group.toClients')}</Link>
      </Button>
    </div>
  )
}
