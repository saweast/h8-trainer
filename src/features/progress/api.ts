import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { StatSet } from '@/lib/workoutStats'
import type { WorkoutSummary } from '@/features/workout/api'

/** Finished workouts that started in [from, to). */
export function useWorkoutsInRange(athleteId: string | undefined, from: Date, to: Date) {
  return useQuery({
    queryKey: ['workouts-range', athleteId, from.toISOString(), to.toISOString()],
    enabled: Boolean(supabase && athleteId),
    placeholderData: (previous) => previous, // keep the old month on screen while the next loads
    queryFn: async (): Promise<WorkoutSummary[]> => {
      const { data, error } = await supabase!
        .from('workout_summaries')
        .select('id, title, started_at, finished_at, membership_id, exercise_count, set_count, volume_kg')
        .eq('athlete_id', athleteId!)
        .not('finished_at', 'is', null)
        .gte('started_at', from.toISOString())
        .lt('started_at', to.toISOString())
        .order('started_at', { ascending: false })
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

export interface ExerciseSession {
  workoutId: string
  startedAt: string
  sets: (StatSet & { position: number })[]
}

/** Every finished session of one exercise for one athlete, oldest first. */
export function useExerciseSessions(athleteId: string | undefined, exerciseId: string | undefined) {
  return useQuery({
    queryKey: ['exercise-sessions', athleteId, exerciseId],
    enabled: Boolean(supabase && athleteId && exerciseId),
    queryFn: async (): Promise<ExerciseSession[]> => {
      const { data, error } = await supabase!
        .from('workout_exercises')
        .select(
          `id, workout:workouts!inner (id, started_at, finished_at, athlete_id),
           sets (position, weight_kg, reps, is_warmup, completed_at)`,
        )
        .eq('exercise_id', exerciseId!)
        .eq('workout.athlete_id', athleteId!)
        .not('workout.finished_at', 'is', null)
      if (error) throw error

      // One workout can contain the same exercise twice; merge them into one session.
      const byWorkout = new Map<string, ExerciseSession>()
      for (const row of data) {
        const w = row.workout
        const session = byWorkout.get(w.id) ?? { workoutId: w.id, startedAt: w.started_at, sets: [] }
        for (const s of row.sets) {
          session.sets.push({
            position: s.position,
            weightKg: Number(s.weight_kg),
            reps: s.reps,
            isWarmup: s.is_warmup,
            completedAt: s.completed_at,
          })
        }
        byWorkout.set(w.id, session)
      }
      return [...byWorkout.values()]
        .map((s) => ({ ...s, sets: s.sets.sort((a, b) => a.position - b.position) }))
        .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    },
  })
}
