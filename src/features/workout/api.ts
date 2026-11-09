import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { ExerciseRecords } from '@/lib/records'
import type { TablesUpdate } from '@/lib/db.types'
import { supabase } from '@/lib/supabase'
import type { PlannedSet, PreviousSet } from '@/lib/templatePrefill'

// Types -------------------------------------------------------------------------------------

export interface WorkoutSet {
  id: string
  workoutExerciseId: string
  position: number
  weightKg: number
  reps: number
  isWarmup: boolean
  completedAt: string | null
}

export interface WorkoutExercise {
  id: string
  exerciseId: string
  position: number
  notes: string | null
  sets: WorkoutSet[]
}

export interface Workout {
  id: string
  athleteId: string
  title: string
  startedAt: string
  finishedAt: string | null
  notes: string | null
  templateId: string | null
  programId: string | null
  membershipId: string | null
  createdBy: string | null
  exercises: WorkoutExercise[]
}

export interface ExerciseRecordSummary extends ExerciseRecords {
  bestReps: number | null
  workoutsCount: number
  lastPerformedAt: string
}

export interface WorkoutSummary {
  id: string
  title: string
  startedAt: string
  finishedAt: string | null
  membershipId: string | null
  exerciseCount: number
  setCount: number
  volumeKg: number
}

// Keys --------------------------------------------------------------------------------------

export const workoutKey = (id: string) => ['workout', id] as const
export const activeWorkoutKey = (athleteId: string | undefined) => ['active-workout', athleteId] as const
export const recentWorkoutsKey = (athleteId: string | undefined) => ['recent-workouts', athleteId] as const

const byPosition = <T extends { position: number }>(a: T, b: T) => a.position - b.position
const newId = () => crypto.randomUUID()

// Queries -----------------------------------------------------------------------------------

export function useWorkout(id: string | undefined) {
  return useQuery({
    queryKey: workoutKey(id ?? ''),
    enabled: Boolean(supabase && id),
    // This screen owns the cache (optimistic edits); a background refetch could briefly revert
    // changes still queued for the server.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<Workout> => {
      const { data, error } = await supabase!
        .from('workouts')
        .select(
          `id, athlete_id, title, started_at, finished_at, notes, template_id, program_id, membership_id, created_by,
           workout_exercises (id, exercise_id, position, notes,
             sets (id, workout_exercise_id, position, weight_kg, reps, is_warmup, completed_at))`,
        )
        .eq('id', id!)
        .single()
      if (error) throw error
      return {
        id: data.id,
        athleteId: data.athlete_id,
        title: data.title,
        startedAt: data.started_at,
        finishedAt: data.finished_at,
        notes: data.notes,
        templateId: data.template_id,
        programId: data.program_id,
        membershipId: data.membership_id,
        createdBy: data.created_by,
        exercises: data.workout_exercises
          .map((we) => ({
            id: we.id,
            exerciseId: we.exercise_id,
            position: we.position,
            notes: we.notes,
            sets: we.sets
              .map((s) => ({
                id: s.id,
                workoutExerciseId: s.workout_exercise_id,
                position: s.position,
                weightKg: Number(s.weight_kg),
                reps: s.reps,
                isWarmup: s.is_warmup,
                completedAt: s.completed_at,
              }))
              .sort(byPosition),
          }))
          .sort(byPosition),
      }
    },
  })
}

/** The athlete's unfinished workout, if any (resume instead of starting a second one). */
export function useActiveWorkout(athleteId: string | undefined) {
  return useQuery({
    queryKey: activeWorkoutKey(athleteId),
    enabled: Boolean(supabase && athleteId),
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('workouts')
        .select('id, title, started_at')
        .eq('athlete_id', athleteId!)
        .is('finished_at', null)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data ? { id: data.id, title: data.title, startedAt: data.started_at } : null
    },
  })
}

export function useRecentWorkouts(athleteId: string | undefined, limit = 5) {
  return useQuery({
    queryKey: [...recentWorkoutsKey(athleteId), limit],
    enabled: Boolean(supabase && athleteId),
    queryFn: async (): Promise<WorkoutSummary[]> => {
      const { data, error } = await supabase!
        .from('workout_summaries')
        .select('id, title, started_at, finished_at, membership_id, exercise_count, set_count, volume_kg')
        .eq('athlete_id', athleteId!)
        .not('finished_at', 'is', null)
        .order('started_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return data.map((r) => ({
        id: r.id!,
        title: r.title ?? '',
        startedAt: r.started_at!,
        finishedAt: r.finished_at,
        membershipId: r.membership_id,
        exerciseCount: r.exercise_count ?? 0,
        setCount: r.set_count ?? 0,
        volumeKg: Number(r.volume_kg ?? 0),
      }))
    },
  })
}

/** "Last time": completed sets from the latest other workout with this exercise. */
export function useLastPerformance(athleteId: string | undefined, exerciseId: string, excludeWorkoutId?: string) {
  return useQuery({
    queryKey: ['last-performance', athleteId, exerciseId, excludeWorkoutId],
    enabled: Boolean(supabase && athleteId),
    staleTime: 5 * 60_000,
    queryFn: () => fetchLastPerformance(athleteId!, exerciseId, excludeWorkoutId),
  })
}

export async function fetchLastPerformance(
  athleteId: string,
  exerciseId: string,
  excludeWorkoutId?: string,
): Promise<PreviousSet[]> {
  const { data, error } = await supabase!.rpc('last_performance', {
    p_athlete: athleteId,
    p_exercise: exerciseId,
    p_exclude_workout: excludeWorkoutId,
  })
  if (error) throw error
  return data.map((r) => ({ position: r.position, weightKg: Number(r.weight_kg), reps: r.reps, isWarmup: r.is_warmup }))
}

/** Records before this workout, so new sets can be flagged as PRs. */
export function useExerciseRecords(athleteId: string | undefined, excludeWorkoutId?: string) {
  return useQuery({
    queryKey: ['exercise-records', athleteId, excludeWorkoutId],
    enabled: Boolean(supabase && athleteId),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('exercise_records', {
        p_athlete: athleteId!,
        p_exclude_workout: excludeWorkoutId,
      })
      if (error) throw error
      return new Map<string, ExerciseRecordSummary>(
        data.map((r) => [
          r.exercise_id,
          {
            bestWeightKg: r.best_weight_kg === null ? null : Number(r.best_weight_kg),
            bestE1rmKg: r.best_e1rm_kg === null ? null : Number(r.best_e1rm_kg),
            bestSetVolumeKg: r.best_set_volume_kg === null ? null : Number(r.best_set_volume_kg),
            bestReps: r.best_reps,
            workoutsCount: Number(r.workouts_count),
            lastPerformedAt: r.last_performed_at,
          },
        ]),
      )
    },
  })
}

// Starting ----------------------------------------------------------------------------------

export function useStartWorkout(athleteId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { title?: string; membershipId?: string | null } = {}) => {
      const id = newId()
      const { error } = await supabase!
        .from('workouts')
        .insert({ id, athlete_id: athleteId!, title: input.title ?? '', membership_id: input.membershipId ?? null })
      if (error) throw error
      return id
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: activeWorkoutKey(athleteId) }),
  })
}

// Editing a workout -------------------------------------------------------------------------
// Every change updates the cached workout first (instant UI) and runs in one serial queue per
// workout, so a set added and immediately edited reaches the server in order.

type SetPatch = Partial<Pick<WorkoutSet, 'weightKg' | 'reps' | 'isWarmup' | 'completedAt'>>

function updateCached(queryClient: QueryClient, workoutId: string, fn: (w: Workout) => Workout) {
  queryClient.setQueryData<Workout>(workoutKey(workoutId), (old) => (old ? fn(old) : old))
}

function mapSets(w: Workout, fn: (s: WorkoutSet) => WorkoutSet | null): Workout {
  return {
    ...w,
    exercises: w.exercises.map((e) => ({
      ...e,
      sets: e.sets.map(fn).filter((s): s is WorkoutSet => s !== null),
    })),
  }
}

function toSetRow(s: WorkoutSet) {
  return {
    id: s.id,
    workout_exercise_id: s.workoutExerciseId,
    position: s.position,
    weight_kg: s.weightKg,
    reps: s.reps,
    is_warmup: s.isWarmup,
    completed_at: s.completedAt,
  }
}

export function useWorkoutActions(workoutId: string, notifyError?: () => void) {
  const queryClient = useQueryClient()
  const scope = { id: `workout:${workoutId}` }
  // On failure: tell the user and reload the workout so the screen matches the server.
  const onError = () => {
    notifyError?.()
    void queryClient.invalidateQueries({ queryKey: workoutKey(workoutId) })
  }
  const current = () => queryClient.getQueryData<Workout>(workoutKey(workoutId))

  // The cache is updated synchronously in the wrappers below; the mutations only talk to the
  // server, queued in order behind each other.
  const insertExercise = useMutation({
    scope,
    onError,
    mutationFn: async (we: WorkoutExercise) => {
      const { error } = await supabase!
        .from('workout_exercises')
        .insert({ id: we.id, workout_id: workoutId, exercise_id: we.exerciseId, position: we.position })
      if (error) throw error
      if (we.sets.length) {
        const { error: setsError } = await supabase!.from('sets').insert(we.sets.map(toSetRow))
        if (setsError) throw setsError
      }
    },
  })

  const deleteExercise = useMutation({
    scope,
    onError,
    mutationFn: async (workoutExerciseId: string) => {
      const { error } = await supabase!.from('workout_exercises').delete().eq('id', workoutExerciseId)
      if (error) throw error
    },
  })

  const insertSet = useMutation({
    scope,
    onError,
    mutationFn: async (set: WorkoutSet) => {
      const { error } = await supabase!.from('sets').insert(toSetRow(set))
      if (error) throw error
    },
  })

  const patchSet = useMutation({
    scope,
    onError,
    mutationFn: async ({ setId, patch }: { setId: string; patch: SetPatch }) => {
      const row: TablesUpdate<'sets'> = {}
      if (patch.weightKg !== undefined) row.weight_kg = patch.weightKg
      if (patch.reps !== undefined) row.reps = patch.reps
      if (patch.isWarmup !== undefined) row.is_warmup = patch.isWarmup
      if (patch.completedAt !== undefined) row.completed_at = patch.completedAt
      const { error } = await supabase!.from('sets').update(row).eq('id', setId)
      if (error) throw error
    },
  })

  const deleteSet = useMutation({
    scope,
    onError,
    mutationFn: async (setId: string) => {
      const { error } = await supabase!.from('sets').delete().eq('id', setId)
      if (error) throw error
    },
  })

  const addExercise = (exerciseId: string, planned: PlannedSet[]) => {
    const w = current()
    const position = Math.max(-1, ...(w?.exercises.map((e) => e.position) ?? [])) + 1
    const weId = newId()
    const we: WorkoutExercise = {
      id: weId,
      exerciseId,
      position,
      notes: null,
      sets: planned.map((p) => ({
        id: newId(),
        workoutExerciseId: weId,
        position: p.position,
        weightKg: p.weightKg,
        reps: p.reps,
        isWarmup: false,
        completedAt: null,
      })),
    }
    updateCached(queryClient, workoutId, (old) => ({ ...old, exercises: [...old.exercises, we] }))
    insertExercise.mutate(we)
  }

  const removeExercise = (workoutExerciseId: string) => {
    updateCached(queryClient, workoutId, (old) => ({
      ...old,
      exercises: old.exercises.filter((e) => e.id !== workoutExerciseId),
    }))
    deleteExercise.mutate(workoutExerciseId)
  }

  /** New set copying the previous one, so the next set is one tap away. */
  const addSet = (workoutExerciseId: string) => {
    const last = current()?.exercises.find((e) => e.id === workoutExerciseId)?.sets.at(-1)
    const set: WorkoutSet = {
      id: newId(),
      workoutExerciseId,
      position: (last?.position ?? 0) + 1,
      weightKg: last?.weightKg ?? 0,
      reps: last?.reps ?? 0,
      isWarmup: false,
      completedAt: null,
    }
    updateCached(queryClient, workoutId, (old) => ({
      ...old,
      exercises: old.exercises.map((e) => (e.id === workoutExerciseId ? { ...e, sets: [...e.sets, set] } : e)),
    }))
    insertSet.mutate(set)
  }

  const updateSet = (setId: string, patch: SetPatch) => {
    updateCached(queryClient, workoutId, (old) => mapSets(old, (s) => (s.id === setId ? { ...s, ...patch } : s)))
    patchSet.mutate({ setId, patch })
  }

  const removeSet = (setId: string) => {
    updateCached(queryClient, workoutId, (old) => mapSets(old, (s) => (s.id === setId ? null : s)))
    deleteSet.mutate(setId)
  }

  const finish = useMutation({
    scope,
    onError,
    mutationFn: async ({ title }: { title: string }) => {
      const w = current()
      if (!w) throw new Error('workout not loaded')
      // Drop planned-but-not-done sets and exercises left empty.
      const pendingSetIds = w.exercises.flatMap((e) => e.sets.filter((s) => !s.completedAt).map((s) => s.id))
      const emptyExerciseIds = w.exercises.filter((e) => !e.sets.some((s) => s.completedAt)).map((e) => e.id)
      if (pendingSetIds.length) {
        const { error } = await supabase!.from('sets').delete().in('id', pendingSetIds)
        if (error) throw error
      }
      if (emptyExerciseIds.length) {
        const { error } = await supabase!.from('workout_exercises').delete().in('id', emptyExerciseIds)
        if (error) throw error
      }
      const finishedAt = new Date().toISOString()
      const { error } = await supabase!.from('workouts').update({ finished_at: finishedAt, title }).eq('id', workoutId)
      if (error) throw error
      updateCached(queryClient, workoutId, (old) => ({
        ...mapSets(old, (s) => (s.completedAt ? s : null)),
        title,
        finishedAt,
      }))
      updateCached(queryClient, workoutId, (old) => ({
        ...old,
        exercises: old.exercises.filter((e) => e.sets.length > 0),
      }))
      return w.athleteId
    },
    onSuccess: (athleteId) => {
      void queryClient.invalidateQueries({ queryKey: activeWorkoutKey(athleteId) })
      void queryClient.invalidateQueries({ queryKey: recentWorkoutsKey(athleteId) })
      void queryClient.invalidateQueries({ queryKey: ['exercise-records', athleteId] })
      void queryClient.invalidateQueries({ queryKey: ['last-performance', athleteId] })
      void queryClient.invalidateQueries({ queryKey: ['workouts-range', athleteId] })
      void queryClient.invalidateQueries({ queryKey: ['plan-facts'] })
      void queryClient.invalidateQueries({ queryKey: ['plan-next-slot'] })
      void queryClient.invalidateQueries({ queryKey: ['exercise-sessions', athleteId] })
    },
  })

  const discard = useMutation({
    scope,
    onError: () => notifyError?.(),
    mutationFn: async () => {
      const athleteId = current()?.athleteId
      const { error } = await supabase!.from('workouts').delete().eq('id', workoutId)
      if (error) throw error
      return athleteId
    },
    onSuccess: (athleteId) => {
      queryClient.removeQueries({ queryKey: workoutKey(workoutId) })
      for (const key of ['active-workout', 'recent-workouts', 'workouts-range', 'exercise-records', 'exercise-sessions', 'last-performance']) {
        void queryClient.invalidateQueries({ queryKey: [key, athleteId] })
      }
    },
  })

  return { addExercise, removeExercise, addSet, updateSet, removeSet, finish, discard }
}
