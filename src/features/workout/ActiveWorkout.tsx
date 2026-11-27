import { useIsMutating, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Dumbbell, Eye, Layers, Link2, Plus, Unlink, UserStar } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { EmptyState } from '@/components/common/EmptyState'
import { Button } from '@/components/ui/button'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { exerciseName, type MuscleGroup } from '@/data/exercises'
import {
  useExerciseMap,
  useExerciseSettings,
  useSaveExerciseSettings,
  type Exercise,
} from '@/features/exercises/api'
import { ExercisePicker } from '@/features/exercises/ExercisePicker'
import { useTemplate } from '@/features/templates/api'
import { useMyAthleteId } from '@/features/athlete/useMyAthlete'
import { useAuth } from '@/features/auth/authContext'
import { useAthlete } from '@/features/trainer/api'
import { currentLanguage } from '@/i18n'
import type { ExerciseRecords } from '@/lib/records'
import {
  afterSetDone,
  byId,
  joinNeighbour,
  leaveSuperset,
  nextSupersetNumber,
  nextUp,
  roundCount,
  roundsDone,
  toBlocks,
} from '@/lib/superset'
import { prefillSets } from '@/lib/templatePrefill'
import { autoTitle } from '@/lib/workoutStats'
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
import { ExerciseCard } from './ExerciseCard'
import { FinishDrawer } from './FinishDrawer'
import { RestTimerBar } from './RestTimerBar'
import { SupersetCard } from './SupersetCard'
import { useRestTimer } from './useRestTimer'
import { useFlushOnLeave } from './useFlushOnLeave'
import { useWakeLock } from './useWakeLock'

type Actions = ReturnType<typeof useWorkoutActions>

export function ActiveWorkout({ workout }: { workout: Workout }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const athleteId = workout.athleteId

  const { map: exercises } = useExerciseMap()
  const { data: settings } = useExerciseSettings(athleteId)
  const saveSettings = useSaveExerciseSettings(athleteId)
  const { data: records } = useExerciseRecords(athleteId, workout.id)
  const actions = useWorkoutActions(workout.id, () => toast.error(t('workout.saveError')))
  const rest = useRestTimer(workout.id)
  const { data: template } = useTemplate(workout.templateId ?? undefined)
  const { data: myAthleteId } = useMyAthleteId()
  const forSomeoneElse = myAthleteId !== undefined && workout.athleteId !== myAthleteId
  const { data: client } = useAthlete(forSomeoneElse ? workout.athleteId : undefined)
  const { user } = useAuth()
  // Someone else started this session (the trainer, for the client — or the other way round):
  // they record and finish it; here it is a live view, with exercise feedback still allowed.
  const liveView = Boolean(user && workout.createdBy && workout.createdBy !== user.id)
  const [picker, setPicker] = useState<'one' | 'superset' | null>(null)
  const [finishOpen, setFinishOpen] = useState(false)
  const lang = currentLanguage()
  const celebrated = useRef(new Set<string>())
  const saving = useIsMutating({ predicate: (m) => m.options.scope?.id === `workout:${workout.id}` }) > 0

  useWakeLock(true)
  useFlushOnLeave([workout.id])

  /** Sets for a new exercise: as many as last time, with last time's weights. */
  const plannedFor = async (exerciseId: string) => {
    let previous = [] as Awaited<ReturnType<typeof fetchLastPerformance>>
    try {
      previous = await queryClient.fetchQuery({
        queryKey: ['last-performance', athleteId, exerciseId, workout.id],
        queryFn: () => fetchLastPerformance(athleteId, exerciseId, workout.id),
        staleTime: 5 * 60_000,
      })
    } catch {
      // no history available — start with empty sets
    }
    const workingCount = previous.filter((s) => !s.isWarmup).length
    return prefillSets(
      { targetSets: workingCount || 3, targetRepsMin: null, targetRepsMax: null, targetWeightKg: null },
      previous,
    )
  }

  const addExercise = async (exercise: Exercise) => {
    actions.addExercise(exercise.id, await plannedFor(exercise.id))
  }

  /** The exercises go in one after another, in the order picked, sharing a new superset number. */
  const addSuperset = async (list: Exercise[]) => {
    const planned = await Promise.all(list.map((e) => plannedFor(e.id)))
    const now = queryClient.getQueryData<Workout>(workoutKey(workout.id)) ?? workout
    const superset = nextSupersetNumber(now.exercises)
    list.forEach((e, i) => actions.addExercise(e.id, planned[i], undefined, superset))
  }

  // Rest: template setting → my setting for this machine → exercise default.
  const restFor = (exerciseId: string) =>
    template?.items.find((i) => i.exerciseId === exerciseId)?.restS ??
    settings?.get(exerciseId)?.restS ??
    exercises.get(exerciseId)?.defaultRestS ??
    90

  const onSetCompleted = (item: WorkoutExercise, set: WorkoutSet, isPr: boolean) => {
    // The set is already marked done in the cache; this render's `workout` may not show it yet.
    const now = queryClient.getQueryData<Workout>(workoutKey(workout.id)) ?? workout
    const block = toBlocks(now.exercises).find((b) => b.kind === 'superset' && b.items.some((e) => e.id === item.id))
    if (block?.kind === 'superset') {
      // A superset rests only after the round, as long as its longest rest.
      const { rest: roundClosed, next } = afterSetDone(block.items, set.id)
      if (roundClosed) {
        rest.start(Math.max(...block.items.map((e) => restFor(e.exerciseId))))
      } else if (next) {
        rest.stop()
        const at = block.items.findIndex((e) => e.id === next.exerciseId)
        const exercise = exercises.get(block.items[at].exerciseId)
        toast(t('superset.next', { name: `${block.letter}${at + 1} ${exercise ? exerciseName(exercise, lang) : ''}`.trim(), set: next.round }), {
          duration: 2500,
        })
        requestAnimationFrame(() =>
          document.getElementById(`set-${next.setId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
        )
      }
    } else {
      rest.start(restFor(item.exerciseId))
    }
    if (isPr && !celebrated.current.has(item.exerciseId)) {
      celebrated.current.add(item.exerciseId)
      toast.success(t('workout.pr'))
    }
  }

  const allSets = workout.exercises.flatMap((e) => e.sets)
  const doneSets = allSets.filter((s) => s.completedAt && !s.isWarmup).length
  const pendingSets = allSets.filter((s) => !s.completedAt).length

  const finish = () => {
    const title =
      workout.title ||
      autoTitle(
        workout.exercises.map((e) => ({
          exerciseId: e.exerciseId,
          muscle: (exercises.get(e.exerciseId)?.muscle ?? 'other') as MuscleGroup,
          sets: e.sets,
        })),
        (m) => t(`muscle.${m}`),
      )
    // Commit a weight/reps field still being edited before the finish joins the queue.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    actions.finish.mutate(
      { title },
      {
        onSuccess: ({ savedSets, doneHere }) => {
          rest.stop()
          setFinishOpen(false)
          window.scrollTo({ top: 0 })
          if (savedSets < doneHere) toast.warning(t('workout.savedPartly', { saved: savedSets, total: doneHere }))
          else toast.success(t('workout.saved', { count: savedSets }))
        },
        onError: (error) => {
          if ((error as { code?: string }).code === '22023') toast.error(t('workout.nothingSaved'))
        },
      },
    )
  }

  const discard = () => {
    actions.discard.mutate(undefined, {
      onSuccess: () => {
        rest.stop()
        navigate('/', { replace: true })
      },
    })
  }

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b bg-background/95 pt-safe backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex h-14 max-w-md items-center justify-between gap-2 px-2">
          <Button asChild variant="ghost" size="icon-touch" aria-label={t('common.back')}>
            <Link to="/">
              <ChevronDown />
            </Link>
          </Button>
          <div className="min-w-0 text-center">
            <ElapsedClock since={workout.startedAt} className="tabular block text-base font-medium" />
            <p className="truncate text-xs text-muted-foreground" aria-live="polite">
              {saving ? t('workout.saving') : workout.title || t('workout.untitled')}
            </p>
          </div>
          {liveView ? (
            <span className="flex h-11 items-center gap-1.5 rounded-full bg-secondary px-3 text-xs font-medium text-muted-foreground">
              <span className="size-2 animate-pulse rounded-full bg-primary" aria-hidden />
              {t('workout.live')}
            </span>
          ) : (
            <Button size="touch" variant={doneSets > 0 ? 'default' : 'secondary'} onClick={() => setFinishOpen(true)}>
              {t('workout.finish')}
            </Button>
          )}
        </div>
      </header>

      {liveView ? (
        <div className="mx-auto max-w-md px-4 pt-3">
          <p className="flex items-center gap-2 rounded-xl bg-secondary px-3 py-2 text-xs text-muted-foreground">
            <Eye className="size-4 shrink-0" aria-hidden />
            <span>{forSomeoneElse ? t('workout.liveViewClient') : t('workout.liveViewTrainer')}</span>
          </p>
        </div>
      ) : forSomeoneElse ? (
        <div className="mx-auto max-w-md px-4 pt-3">
          <p className="flex items-center gap-2 rounded-xl bg-trainer-muted px-3 py-2 text-xs text-trainer-text">
            <UserStar className="size-4 shrink-0" aria-hidden />
            <span className="truncate">
              {t('trainer.recordingFor', { name: client?.displayName ?? '…' })}
              {workout.membershipId ? ` · ${t('trainer.recordingCharged')}` : ''}
            </span>
          </p>
        </div>
      ) : null}

      <main
        className="mx-auto flex max-w-md flex-col gap-3 px-4 pt-3"
        style={{ paddingBottom: rest.running || rest.justFinished ? '9rem' : '2rem' }}
      >
        {workout.exercises.length === 0 ? (
          <EmptyState
            icon={Dumbbell}
            title={t('workout.emptyTitle')}
            body={liveView ? t('workout.liveEmptyBody') : t('workout.emptyBody')}
          >
            {liveView ? null : (
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
            )}
          </EmptyState>
        ) : (
          <>
            {toBlocks(workout.exercises).map((block) => {
              const list = workout.exercises
              const card = (item: WorkoutExercise, extra: Partial<ContainerProps> = {}) => (
                <ExerciseCardContainer
                  key={item.id}
                  workout={workout}
                  item={item}
                  exercise={exercises.get(item.exerciseId)}
                  records={records?.get(item.exerciseId) ?? null}
                  setupNotes={settings?.get(item.exerciseId)?.setupNotes ?? null}
                  actions={actions}
                  readOnly={liveView}
                  onSetCompleted={(set, isPr) => onSetCompleted(item, set, isPr)}
                  onSaveSetup={(notes) =>
                    saveSettings.mutate({
                      exerciseId: item.exerciseId,
                      setupNotes: notes,
                      restS: settings?.get(item.exerciseId)?.restS ?? null,
                    })
                  }
                  {...extra}
                />
              )
              const join = (item: WorkoutExercise, direction: 'up' | 'down') => (
                <DropdownMenuItem
                  key={direction}
                  onSelect={() => actions.setSupersets(byId(joinNeighbour(list, list.indexOf(item), direction)))}
                >
                  <Link2 />
                  {direction === 'up' ? t('superset.joinUp') : t('superset.joinDown')}
                </DropdownMenuItem>
              )
              const isFirst = (item: WorkoutExercise) => list.indexOf(item) === 0
              const isLast = (item: WorkoutExercise) => list.indexOf(item) === list.length - 1

              if (block.kind === 'single') {
                const { item } = block
                return card(item, {
                  menuItems: [isFirst(item) ? null : join(item, 'up'), isLast(item) ? null : join(item, 'down')],
                })
              }

              const members = block.items
              const next = nextUp(members)
              return (
                <SupersetCard
                  key={`superset-${members[0].id}`}
                  letter={block.letter}
                  rounds={{ done: roundsDone(members), total: roundCount(members) }}
                  readOnly={liveView}
                  onAddRound={() => members.forEach((e) => actions.addSet(e.id))}
                  onUngroup={() => actions.setSupersets(new Map(members.map((e) => [e.id, null])))}
                  onRemove={() => members.forEach((e) => actions.removeExercise(e.id))}
                >
                  {members.map((item, i) => {
                    const edge = i === 0 || i === members.length - 1
                    const menu: ReactNode[] = [
                      i === 0 && !isFirst(item) ? join(item, 'up') : null,
                      i === members.length - 1 && !isLast(item) ? join(item, 'down') : null,
                      edge ? (
                        <DropdownMenuItem
                          key="leave"
                          onSelect={() => actions.setSupersets(byId(leaveSuperset(list, list.indexOf(item))))}
                        >
                          <Unlink />
                          {t('superset.leave')}
                        </DropdownMenuItem>
                      ) : null,
                    ]
                    return card(item, {
                      embedded: true,
                      label: `${block.letter}${i + 1}`,
                      nextSetId: next?.setId ?? null,
                      menuItems: menu,
                    })
                  })}
                </SupersetCard>
              )
            })}
            {liveView ? null : (
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
            )}
          </>
        )}
      </main>

      <RestTimerBar timer={rest} />
      <ExercisePicker
        open={picker !== null}
        onOpenChange={(open) => setPicker(open ? picker : null)}
        multiple={picker === 'superset'}
        onPick={(e) => void addExercise(e)}
        onPickMany={(list) => void addSuperset(list)}
        athleteId={athleteId}
      />
      <FinishDrawer
        open={finishOpen}
        onOpenChange={setFinishOpen}
        doneSets={doneSets}
        pendingSets={pendingSets}
        busy={actions.finish.isPending || actions.discard.isPending}
        onFinish={finish}
        onDiscard={discard}
      />
    </div>
  )
}

interface ContainerProps {
  workout: Workout
  item: WorkoutExercise
  exercise: Exercise | undefined
  records: ExerciseRecords | null
  setupNotes: string | null
  actions: Actions
  readOnly: boolean
  label?: string
  embedded?: boolean
  nextSetId?: string | null
  menuItems?: ReactNode
  onSetCompleted: (set: WorkoutSet, isPr: boolean) => void
  onSaveSetup: (notes: string) => void
}

/** Loads "last time" for one exercise and wires the card to the workout actions. */
function ExerciseCardContainer({
  workout,
  item,
  exercise,
  records,
  setupNotes,
  actions,
  readOnly,
  label,
  embedded,
  nextSetId,
  menuItems,
  onSetCompleted,
  onSaveSetup,
}: ContainerProps) {
  const { data: lastTime } = useLastPerformance(workout.athleteId, item.exerciseId, workout.id)
  return (
    <ExerciseCard
      item={item}
      exercise={exercise}
      lastTime={lastTime ?? []}
      records={records}
      setupNotes={setupNotes}
      readOnly={readOnly}
      label={label}
      embedded={embedded}
      nextSetId={nextSetId}
      menuItems={menuItems}
      onSetChange={(setId, patch) => actions.updateSet(setId, patch)}
      onSetCompleted={onSetCompleted}
      onSetDelete={(setId) => actions.removeSet(setId)}
      onAddSet={() => actions.addSet(item.id)}
      onRemove={() => actions.removeExercise(item.id)}
      onSaveSetup={onSaveSetup}
      onFeedback={(patch) => actions.setFeedback(item.id, patch)}
    />
  )
}
