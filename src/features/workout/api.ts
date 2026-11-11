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
  /** Client feedback: 1 easy · 2 ok · 3 hard. */
  difficulty: number | null
  athleteFeedback: string | null
  sets: WorkoutSet[]
}

export interface ExerciseFeedbackPatch {
  difficulty?: number | null
  athleteFeedback?: string | null
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
  /** Last change to the workout's exercises or sets (server time); drives auto-finish. */
  lastActivityAt: string
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

/** A workout left without changes this long is finished automatically (also on the server). */
export const AUTO_FINISH_IDLE_MS = 30 * 60_000
/** How often an open workout re-reads the server, so trainer and client see each other's sets. */
const LIVE_SYNC_MS = 5_000

const workoutScope = (workoutId: string) => `workout:${workoutId}`

/** A write that reached the server but changed nothing: the row is gone or not ours anymore. */
export class NotSavedError extends Error {
  constructor(what: string) {
    super(`${what}: nothing was saved`)
    this.name = 'NotSavedError'
  }
}

/** Retry only when the request didn't get an answer; a refusal from the database won't change. */
function retryNetwork(failures: number, error: unknown) {
  if (error instanceof NotSavedError) return false
  const code = (error as { code?: string } | null)?.code
  return !code && failures < 3
}

/** Awaits an update/delete with `.select('id')` and fails unless it touched at least one row. */
async function expectRows(
  request: PromiseLike<{ data: unknown[] | null; error: unknown }>,
  what: string,
): Promise<void> {
  const { data, error } = await request
  if (error) throw error
  if (!data?.length) throw new NotSavedError(what)
}

// Local edits per workout, so a live refetch that started before an edit doesn't undo it.
const localEdits = new Map<string, number>()
const bumpLocalEdits = (workoutId: string) => localEdits.set(workoutId, (localEdits.get(workoutId) ?? 0) + 1)

/** Writes for this workout still queued or in flight. */
export function pendingWrites(queryClient: QueryClient, workoutId: string) {
  return queryClient.isMutating({ predicate: (m) => m.options.scope?.id === workoutScope(workoutId) })
}

const WORKOUT_SELECT = `id, athlete_id, title, started_at, finished_at, notes, template_id, program_id, membership_id, created_by, last_activity_at,
  workout_exercises (id, exercise_id, position, notes, difficulty, athlete_feedback,
    sets (id, workout_exercise_id, position, weight_kg, reps, is_warmup, completed_at))`

/** The workout doesn't exist (deleted) or isn't visible to me. */
export class WorkoutGoneError extends Error {
  constructor() {
    super('workout not found')
    this.name = 'WorkoutGoneError'
  }
}

/** Workouts finished from this screen (vs. by the other device or automatically). */
export const finishedHere = new Set<string>()

async function fetchWorkout(id: string): Promise<Workout> {
  const { data, error } = await supabase!.from('workouts').select(WORKOUT_SELECT).eq('id', id).maybeSingle()
  if (error) throw error
  if (!data) throw new WorkoutGoneError()
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
    lastActivityAt: data.last_activity_at,
    exercises: data.workout_exercises
      .map((we) => ({
        id: we.id,
        exerciseId: we.exercise_id,
        position: we.position,
        notes: we.notes,
        difficulty: we.difficulty,
        athleteFeedback: we.athlete_feedback,
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
}

// Queries -----------------------------------------------------------------------------------

export function useWorkout(id: string | undefined) {
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: workoutKey(id ?? ''),
    enabled: Boolean(supabase && id),
    // While the workout is open, keep reading the server: the trainer and the client may both have
    // it open, and each must see the other's sets (and an automatic finish) before acting on them.
    staleTime: 2_000,
    refetchOnWindowFocus: true,
    refetchInterval: (query) => (query.state.data?.finishedAt ? false : LIVE_SYNC_MS),
    retry: (failures, error) => !(error instanceof WorkoutGoneError) && failures < 1,
    queryFn: async (): Promise<Workout> => {
      const editsBefore = localEdits.get(id!) ?? 0
      let fresh = await fetchWorkout(id!)
      if (!fresh.finishedAt && Date.now() - new Date(fresh.lastActivityAt).getTime() > AUTO_FINISH_IDLE_MS) {
        // Idle too long: the server finishes it (same rule as the background job).
        const { error } = await supabase!.rpc('close_stale_workouts', { p_athlete: fresh.athleteId })
        if (!error) {
          try {
            fresh = await fetchWorkout(id!)
          } catch {
            // deleted: nothing was done in it
          }
        }
      }
      // Optimistic edits not on the server yet win over this snapshot; the next sync catches up.
      const cached = queryClient.getQueryData<Workout>(workoutKey(id!))
      if (cached && (pendingWrites(queryClient, id!) > 0 || (localEdits.get(id!) ?? 0) !== editsBefore)) return cached
      return fresh
    },
  })
}

export interface ActiveWorkoutInfo {
  id: string
  title: string
  startedAt: string
  createdBy: string | null
}

/** The athlete's unfinished workout, if any (resume instead of starting a second one). */
export function useActiveWorkout(athleteId: string | undefined) {
  return useQuery({
    queryKey: activeWorkoutKey(athleteId),
    enabled: Boolean(supabase && athleteId),
    queryFn: async (): Promise<ActiveWorkoutInfo | null> => {
      // Abandoned sessions (30 min without changes) are finished before "in progress" is shown.
      await supabase!.rpc('close_stale_workouts', { p_athlete: athleteId! })
      const { data, error } = await supabase!
        .from('workouts')
        .select('id, title, started_at, created_by')
        .eq('athlete_id', athleteId!)
        .is('finished_at', null)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data ? { id: data.id, title: data.title, startedAt: data.started_at, createdBy: data.created_by } : null
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
  bumpLocalEdits(workoutId)
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
  const scope = { id: workoutScope(workoutId) }
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
    retry: retryNetwork,
    onError,
    mutationFn: async (we: WorkoutExercise) => {
      // Upserts that ignore duplicates: a retry after a lost response must not fail on the same id.
      const { error } = await supabase!
        .from('workout_exercises')
        .upsert(
          { id: we.id, workout_id: workoutId, exercise_id: we.exerciseId, position: we.position },
          { onConflict: 'id', ignoreDuplicates: true },
        )
      if (error) throw error
      if (we.sets.length) {
        const { error: setsError } = await supabase!
          .from('sets')
          .upsert(we.sets.map(toSetRow), { onConflict: 'id', ignoreDuplicates: true })
        if (setsError) throw setsError
      }
    },
  })

  const deleteExercise = useMutation({
    scope,
    retry: retryNetwork,
    onError,
    mutationFn: async (workoutExerciseId: string) => {
      await expectRows(supabase!.from('workout_exercises').delete().eq('id', workoutExerciseId).select('id'), 'delete exercise')
    },
  })

  const insertSet = useMutation({
    scope,
    retry: retryNetwork,
    onError,
    mutationFn: async (set: WorkoutSet) => {
      const { error } = await supabase!.from('sets').upsert(toSetRow(set), { onConflict: 'id', ignoreDuplicates: true })
      if (error) throw error
    },
  })

  const patchSet = useMutation({
    scope,
    retry: retryNetwork,
    onError,
    mutationFn: async ({ setId, patch }: { setId: string; patch: SetPatch }) => {
      const row: TablesUpdate<'sets'> = {}
      if (patch.weightKg !== undefined) row.weight_kg = patch.weightKg
      if (patch.reps !== undefined) row.reps = patch.reps
      if (patch.isWarmup !== undefined) row.is_warmup = patch.isWarmup
      if (patch.completedAt !== undefined) row.completed_at = patch.completedAt
      await expectRows(supabase!.from('sets').update(row).eq('id', setId).select('id'), 'update set')
    },
  })

  const patchExercise = useMutation({
    scope,
    retry: retryNetwork,
    onError,
    mutationFn: async ({ id, patch }: { id: string; patch: ExerciseFeedbackPatch }) => {
      const row: TablesUpdate<'workout_exercises'> = {}
      if (patch.difficulty !== undefined) row.difficulty = patch.difficulty
      if (patch.athleteFeedback !== undefined) row.athlete_feedback = patch.athleteFeedback?.trim() || null
      await expectRows(supabase!.from('workout_exercises').update(row).eq('id', id).select('id'), 'exercise feedback')
    },
  })

  const deleteSet = useMutation({
    scope,
    retry: retryNetwork,
    onError,
    mutationFn: async (setId: string) => {
      await expectRows(supabase!.from('sets').delete().eq('id', setId).select('id'), 'delete set')
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
      difficulty: null,
      athleteFeedback: null,
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

  const setFeedback = (workoutExerciseId: string, patch: ExerciseFeedbackPatch) => {
    updateCached(queryClient, workoutId, (old) => ({
      ...old,
      exercises: old.exercises.map((e) => (e.id === workoutExerciseId ? { ...e, ...patch } : e)),
    }))
    patchExercise.mutate({ id: workoutExerciseId, patch })
    void queryClient.invalidateQueries({ queryKey: ['plan-facts'] })
  }

  const removeSet = (setId: string) => {
    updateCached(queryClient, workoutId, (old) => mapSets(old, (s) => (s.id === setId ? null : s)))
    deleteSet.mutate(setId)
  }

  const finish = useMutation({
    scope,
    retry: retryNetwork,
    onError,
    // Queued behind every edit above, so the server already has all of them. The server decides
    // what was done: a stale screen (the other device) can't drop sets it hasn't seen yet.
    mutationFn: async ({ title }: { title: string }) => {
      const before = current()
      const doneHere = before?.exercises.flatMap((e) => e.sets).filter((s) => s.completedAt).length ?? 0
      finishedHere.add(workoutId)
      const { data, error } = await supabase!.rpc('finish_workout', { p_workout: workoutId, p_title: title })
      if (error) throw error
      const result = data[0]
      if (!result?.finished_at) throw new NotSavedError('finish workout')
      const saved = await fetchWorkout(workoutId)
      if (!saved.finishedAt) throw new NotSavedError('finish workout')
      bumpLocalEdits(workoutId)
      queryClient.setQueryData(workoutKey(workoutId), saved)
      return { athleteId: saved.athleteId, savedSets: result.completed_sets, doneHere }
    },
    onSuccess: ({ athleteId }) => {
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
    retry: retryNetwork,
    onError: () => notifyError?.(),
    mutationFn: async () => {
      const athleteId = current()?.athleteId
      // Zero rows deleted = not allowed (someone else's live session, a charged one) or already gone.
      await expectRows(supabase!.from('workouts').delete().eq('id', workoutId).select('id'), 'discard workout')
      return athleteId
    },
    onSuccess: (athleteId) => {
      queryClient.removeQueries({ queryKey: workoutKey(workoutId) })
      for (const key of ['active-workout', 'recent-workouts', 'workouts-range', 'exercise-records', 'exercise-sessions', 'last-performance']) {
        void queryClient.invalidateQueries({ queryKey: [key, athleteId] })
      }
    },
  })

  return { addExercise, removeExercise, addSet, updateSet, removeSet, setFeedback, finish, discard }
}
