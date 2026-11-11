import { useIsMutating, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Dumbbell, Eye, Plus, UserStar } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { EmptyState } from '@/components/common/EmptyState'
import { Button } from '@/components/ui/button'
import type { MuscleGroup } from '@/data/exercises'
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
import type { ExerciseRecords } from '@/lib/records'
import { prefillSets } from '@/lib/templatePrefill'
import { autoTitle } from '@/lib/workoutStats'
import {
  fetchLastPerformance,
  pendingWrites,
  useExerciseRecords,
  useLastPerformance,
  useWorkoutActions,
  type Workout,
  type WorkoutExercise,
  type WorkoutSet,
} from './api'
import { ElapsedClock } from './ElapsedClock'
import { ExerciseCard } from './ExerciseCard'
import { FinishDrawer } from './FinishDrawer'
import { RestTimerBar } from './RestTimerBar'
import { useRestTimer } from './useRestTimer'
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
  const [pickerOpen, setPickerOpen] = useState(false)
  const [finishOpen, setFinishOpen] = useState(false)
  const celebrated = useRef(new Set<string>())
  const saving = useIsMutating({ predicate: (m) => m.options.scope?.id === `workout:${workout.id}` }) > 0

  useWakeLock(true)
  useFlushOnLeave(workout.id)

  const addExercise = async (exercise: Exercise) => {
    let previous = [] as Awaited<ReturnType<typeof fetchLastPerformance>>
    try {
      previous = await queryClient.fetchQuery({
        queryKey: ['last-performance', athleteId, exercise.id, workout.id],
        queryFn: () => fetchLastPerformance(athleteId, exercise.id, workout.id),
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
    actions.addExercise(exercise.id, planned)
  }

  const onSetCompleted = (item: WorkoutExercise, isPr: boolean) => {
    const exercise = exercises.get(item.exerciseId)
    // Rest: template setting → my setting for this machine → exercise default.
    const fromTemplate = template?.items.find((i) => i.exerciseId === item.exerciseId)?.restS
    const restS = fromTemplate ?? settings?.get(item.exerciseId)?.restS ?? exercise?.defaultRestS ?? 90
    rest.start(restS)
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
              <Button size="xl" onClick={() => setPickerOpen(true)}>
                <Plus aria-hidden />
                {t('workout.addExercise')}
              </Button>
            )}
          </EmptyState>
        ) : (
          <>
            {workout.exercises.map((item) => (
              <ExerciseCardContainer
                key={item.id}
                workout={workout}
                item={item}
                exercise={exercises.get(item.exerciseId)}
                records={records?.get(item.exerciseId) ?? null}
                setupNotes={settings?.get(item.exerciseId)?.setupNotes ?? null}
                actions={actions}
                readOnly={liveView}
                onSetCompleted={(_set, isPr) => onSetCompleted(item, isPr)}
                onSaveSetup={(notes) =>
                  saveSettings.mutate({
                    exerciseId: item.exerciseId,
                    setupNotes: notes,
                    restS: settings?.get(item.exerciseId)?.restS ?? null,
                  })
                }
              />
            ))}
            {liveView ? null : (
              <Button variant="secondary" size="xl" onClick={() => setPickerOpen(true)}>
                <Plus aria-hidden />
                {t('workout.addExercise')}
              </Button>
            )}
          </>
        )}
      </main>

      <RestTimerBar timer={rest} />
      <ExercisePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={(e) => void addExercise(e)}
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

/**
 * Leaving the page must not lose the last change: a field still being typed in is committed when
 * the tab is hidden, and closing the tab asks first while changes are still on their way.
 */
function useFlushOnLeave(workoutId: string) {
  const queryClient = useQueryClient()
  useEffect(() => {
    const flush = () => {
      if (document.activeElement instanceof HTMLInputElement) document.activeElement.blur()
    }
    const onHidden = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      flush()
      if (pendingWrites(queryClient, workoutId) > 0) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    document.addEventListener('visibilitychange', onHidden)
    window.addEventListener('pagehide', flush)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      document.removeEventListener('visibilitychange', onHidden)
      window.removeEventListener('pagehide', flush)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [queryClient, workoutId])
}

interface ContainerProps {
  workout: Workout
  item: WorkoutExercise
  exercise: Exercise | undefined
  records: ExerciseRecords | null
  setupNotes: string | null
  actions: Actions
  readOnly: boolean
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
