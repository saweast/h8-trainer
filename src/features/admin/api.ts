import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { WorkoutSummary } from '@/features/workout/api'
import { supabase } from '@/lib/supabase'

// All admin reads go through security-definer RPCs that check `is_admin` in the database.

export interface AdminUser {
  id: string
  displayName: string
  avatarUrl: string | null
  isAdmin: boolean
  canBeTrainer: boolean
  isTrainer: boolean
  createdAt: string
  clientsCount: number
}

const usersKey = ['admin', 'users'] as const

export function useAdminUsers(enabled = true) {
  return useQuery({
    queryKey: usersKey,
    enabled: Boolean(supabase) && enabled,
    queryFn: async (): Promise<AdminUser[]> => {
      const { data, error } = await supabase!.rpc('admin_users')
      if (error) throw error
      return data.map((r) => ({
        id: r.id,
        displayName: r.display_name,
        avatarUrl: r.avatar_url,
        isAdmin: r.is_admin,
        canBeTrainer: r.can_be_trainer,
        isTrainer: r.is_trainer,
        createdAt: r.created_at,
        clientsCount: r.clients_count,
      }))
    },
  })
}

/** Allow / forbid becoming a trainer. Forbidding also switches trainer mode off. */
export function useSetCanBeTrainer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId, allowed }: { userId: string; allowed: boolean }) => {
      const { error } = await supabase!.rpc('admin_set_can_be_trainer', { p_user: userId, p_allowed: allowed })
      if (error) throw error
    },
    // Optimistic: the switch flips immediately, rolls back on error.
    onMutate: async ({ userId, allowed }) => {
      await queryClient.cancelQueries({ queryKey: usersKey })
      const previous = queryClient.getQueryData<AdminUser[]>(usersKey)
      queryClient.setQueryData<AdminUser[]>(usersKey, (old) =>
        old?.map((u) => (u.id === userId ? { ...u, canBeTrainer: allowed, isTrainer: u.isTrainer && allowed } : u)),
      )
      return { previous }
    },
    onError: (_error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(usersKey, context.previous)
    },
    onSettled: (_data, _error, { userId }) => {
      void queryClient.invalidateQueries({ queryKey: usersKey })
      // The admin may have changed their own permission.
      void queryClient.invalidateQueries({ queryKey: ['profile', userId] })
    },
  })
}

export interface AdminClient {
  athleteId: string
  displayName: string
  avatarUrl: string | null
  /** false = created by the trainer without an account, true = joined through an invite */
  hasAccount: boolean
  linkedAt: string
  workoutsCount: number
  lastWorkoutAt: string | null
}

export function useAdminTrainerClients(trainerId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['admin', 'trainer-clients', trainerId],
    enabled: Boolean(supabase && trainerId) && enabled,
    queryFn: async (): Promise<AdminClient[]> => {
      const { data, error } = await supabase!.rpc('admin_trainer_clients', { p_trainer: trainerId! })
      if (error) throw error
      return data.map((r) => ({
        athleteId: r.athlete_id,
        displayName: r.display_name,
        avatarUrl: r.avatar_url,
        hasAccount: r.has_account,
        linkedAt: r.linked_at,
        workoutsCount: r.workouts_count,
        lastWorkoutAt: r.last_workout_at,
      }))
    },
  })
}

export function useAdminAthleteWorkouts(athleteId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['admin', 'athlete-workouts', athleteId],
    enabled: Boolean(supabase && athleteId) && enabled,
    queryFn: async (): Promise<WorkoutSummary[]> => {
      const { data, error } = await supabase!.rpc('admin_athlete_workouts', { p_athlete: athleteId! })
      if (error) throw error
      return data.map((r) => ({
        id: r.id,
        title: r.title ?? '',
        startedAt: r.started_at,
        finishedAt: r.finished_at,
        membershipId: r.membership_id,
        exerciseCount: r.exercise_count ?? 0,
        setCount: r.set_count ?? 0,
        volumeKg: Number(r.volume_kg ?? 0),
      }))
    },
  })
}

export interface AdminWorkoutSet {
  id: string
  position: number
  weightKg: number
  reps: number
  isWarmup: boolean
  completed: boolean
}

export interface AdminWorkout {
  id: string
  athleteId: string
  athleteName: string
  title: string
  startedAt: string
  finishedAt: string | null
  notes: string | null
  membershipId: string | null
  exercises: { id: string; slug: string | null; name: string; notes: string | null; sets: AdminWorkoutSet[] }[]
}

interface AdminWorkoutJson {
  id: string
  athlete_id: string
  athlete_name: string
  title: string
  started_at: string
  finished_at: string | null
  notes: string | null
  membership_id: string | null
  exercises: {
    id: string
    slug: string | null
    name: string
    notes: string | null
    sets: { id: string; position: number; weight_kg: number | string; reps: number; is_warmup: boolean; completed: boolean }[]
  }[]
}

export function useAdminWorkout(workoutId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['admin', 'workout', workoutId],
    enabled: Boolean(supabase && workoutId) && enabled,
    queryFn: async (): Promise<AdminWorkout | null> => {
      const { data, error } = await supabase!.rpc('admin_workout', { p_workout: workoutId! })
      if (error) throw error
      if (!data) return null
      const w = data as unknown as AdminWorkoutJson
      return {
        id: w.id,
        athleteId: w.athlete_id,
        athleteName: w.athlete_name,
        title: w.title,
        startedAt: w.started_at,
        finishedAt: w.finished_at,
        notes: w.notes,
        membershipId: w.membership_id,
        exercises: w.exercises.map((e) => ({
          id: e.id,
          slug: e.slug,
          name: e.name,
          notes: e.notes,
          sets: e.sets.map((s) => ({
            id: s.id,
            position: s.position,
            weightKg: Number(s.weight_kg),
            reps: s.reps,
            isWarmup: s.is_warmup,
            completed: s.completed,
          })),
        })),
      }
    },
  })
}
