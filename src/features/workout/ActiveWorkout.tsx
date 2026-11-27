import { useIsMutating, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Dumbbell, Eye, Plus, UserStar } from 'lucide-react'
import { useRef, useState } from 'react'
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
  type ExerciseSettings,
} from '@/features/exercises/api'
import { ExercisePicker } from '@/features/exercises/ExercisePicker'
import { useTemplate } from '@/features/templates/api'
import { useMyAthleteId } from '@/features/athlete/useMyAthlete'
import { useAuth } from '@/features/auth/authContext'
import { useAthlete } from '@/features/trainer/api'
import { DROP_CHANGE_S } from '@/lib/dropSets'
import type { ExerciseRecords } from '@/lib/records'
import { continuesRound, supersetPlaces, type SupersetPlace } from '@/lib/supersets'
import { prefillSets } from '@/lib/templatePrefill'
import { autoTitle } from '@/lib/workoutStats'
import {
  fetchLastPerformance,
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
  const [pickerOpen, setPickerOpen] = useState(false)
  const [finishOpen, setFinishOpen] = useState(false)
  const celebrated = useRef(new Set<string>())
  const saving = useIsMutating({ predicate: (m) => m.options.scope?.id === `workout:${workout.id}` }) > 0

  useWakeLock(true)
  useFlushOnLeave([workout.id])

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
    const workingCount = previous.filter((s) => !s.isWarmup && !s.isDrop).length
    const planned = prefillSets(
      { targetSets: workingCount || 3, targetRepsMin: null, targetRepsMax: null, targetWeightKg: null },
      previous,
    )
    actions.addExercise(exercise.id, planned)
  }

  const onSetCompleted = (item: WorkoutExercise, isPr: boolean, dropNext: boolean) => {
    const exercise = exercises.get(item.exerciseId)
    // Rest: template setting → my setting for this machine → exercise default. Before a drop only a
    // short countdown to lower the weight; in a superset, rest comes after the round.
    const fromTemplate = template?.items.find((i) => i.exerciseId === item.exerciseId)?.restS
    const restS = fromTemplate ?? settings?.get(item.exerciseId)?.restS ?? exercise?.defaultRestS ?? 90
    const index = workout.exercises.findIndex((e) => e.id === item.id)
    if (dropNext) rest.start(DROP_CHANGE_S, 'drop')
    else if (continuesRound(workout.exercises, index)) {
      rest.stop()
      const next = workout.exercises[index + 1]
      document.getElementById(`exercise-${next.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } else rest.start(restS)
    if (isPr && !celebrated.current.has(item.exerciseId)) {
      celebrated.current.add(item.exerciseId)
      toast.success(t('workout.pr'))
    }
  }

  // One setting changes, the rest of the row stays as it is.
  const saveSetting = (exerciseId: string, patch: Partial<ExerciseSettings>) => {
    const current = settings?.get(exerciseId)
    saveSettings.mutate({
      exerciseId,
      setupNotes: current?.setupNotes ?? null,
      restS: current?.restS ?? null,
      dropPct: current?.dropPct ?? null,
      ...patch,
    })
  }

  const places = new Map(supersetPlaces(workout.exercises.map((e) => e.superset)).map((p, i) => [workout.exercises[i].id, p]))

  const renderCard = (item: WorkoutExercise) => {
    const index = workout.exercises.indexOf(item)
    const place = places.get(item.id) ?? null
    const hasNext = index + 1 < workout.exercises.length
    return (
      <ExerciseCardContainer
        key={item.id}
        workout={workout}
        item={item}
        exercise={exercises.get(item.exerciseId)}
        records={records?.get(item.exerciseId) ?? null}
        setupNotes={settings?.get(item.exerciseId)?.setupNotes ?? null}
        dropPct={settings?.get(item.exerciseId)?.dropPct ?? null}
        actions={actions}
        readOnly={liveView}
        superset={place}
        onLinkNext={hasNext && !(place && !place.last) ? () => actions.linkSuperset(item.id) : undefined}
        onUnlinkSuperset={() => actions.unlinkSuperset(item.id)}
        onSetCompleted={(_set, isPr, dropNext) => onSetCompleted(item, isPr, dropNext)}
        onSaveSetup={(notes) => saveSetting(item.exerciseId, { setupNotes: notes })}
        onSaveDropPct={(dropPct) => saveSetting(item.exerciseId, { dropPct })}
      />
    )
  }

  const allSets = workout.exercises.flatMap((e) => e.sets)
  // a drop chain is one set
  const doneSets = allSets.filter((s) => s.completedAt && !s.isWarmup && !s.isDrop).length
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
            {segments(workout.exercises).map((segment) =>
              segment.length > 1 ? (
                <div key={segment[0].id} className="relative flex flex-col gap-2 pl-3">
                  <span className="absolute inset-y-1 left-0 w-1 rounded-full bg-primary" aria-hidden />
                  <p className="pl-1 text-xs font-medium text-lime-text dark:text-lime">
                    {t('workout.supersetCaption', { letter: places.get(segment[0].id)?.letter })}
                  </p>
                  {segment.map(renderCard)}
                </div>
              ) : (
                renderCard(segment[0])
              ),
            )}
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

/** Exercises in order; the exercises of a superset come as one segment. */
function segments(exercises: WorkoutExercise[]): WorkoutExercise[][] {
  const places = supersetPlaces(exercises.map((e) => e.superset))
  const out: WorkoutExercise[][] = []
  exercises.forEach((e, i) => {
    const last = out.at(-1)
    if (places[i] && !places[i].first && last) last.push(e)
    else out.push([e])
  })
  return out
}

interface ContainerProps {
  workout: Workout
  item: WorkoutExercise
  exercise: Exercise | undefined
  records: ExerciseRecords | null
  setupNotes: string | null
  dropPct: number | null
  actions: Actions
  readOnly: boolean
  superset: SupersetPlace | null
  onLinkNext?: () => void
  onUnlinkSuperset: () => void
  onSetCompleted: (set: WorkoutSet, isPr: boolean, dropNext: boolean) => void
  onSaveSetup: (notes: string) => void
  onSaveDropPct: (pct: number) => void
}

/** Loads "last time" for one exercise and wires the card to the workout actions. */
function ExerciseCardContainer({
  workout,
  item,
  exercise,
  records,
  setupNotes,
  dropPct,
  actions,
  readOnly,
  superset,
  onLinkNext,
  onUnlinkSuperset,
  onSetCompleted,
  onSaveSetup,
  onSaveDropPct,
}: ContainerProps) {
  const { data: lastTime } = useLastPerformance(workout.athleteId, item.exerciseId, workout.id)
  return (
    <ExerciseCard
      id={`exercise-${item.id}`}
      item={item}
      exercise={exercise}
      lastTime={lastTime ?? []}
      records={records}
      setupNotes={setupNotes}
      dropPct={dropPct}
      readOnly={readOnly}
      superset={superset}
      onLinkNext={onLinkNext}
      onUnlinkSuperset={onUnlinkSuperset}
      onSetChange={(setId, patch) => actions.updateSet(setId, patch)}
      onSetCompleted={onSetCompleted}
      onSetDelete={(setId) => actions.removeSet(setId)}
      onAddSet={() => actions.addSet(item.id)}
      onAddDrop={(afterSetId, weightKg) => actions.addDrop(afterSetId, weightKg)}
      onRemove={() => actions.removeExercise(item.id)}
      onSaveSetup={onSaveSetup}
      onSaveDropPct={onSaveDropPct}
      onFeedback={(patch) => actions.setFeedback(item.id, patch)}
    />
  )
}
