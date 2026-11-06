import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Equipment, MuscleGroup } from '@/data/exercises'
import { useAuth } from '@/features/auth/authContext'
import { supabase } from '@/lib/supabase'

export interface Exercise {
  id: string
  slug: string | null
  name: string
  muscle: MuscleGroup
  equipment: Equipment
  weightStepKg: number
  defaultRestS: number
  ownerId: string | null
  /** Custom exercises only: the owner's own guide. Catalog guides ship with the app. */
  description: string | null
  videoUrl: string | null
}

export const exercisesKey = ['exercises'] as const

/** Global catalog + my custom exercises + those of my trainers/clients (RLS decides). */
export function useExercises() {
  return useQuery({
    queryKey: exercisesKey,
    enabled: Boolean(supabase),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Exercise[]> => {
      const { data, error } = await supabase!
        .from('exercises')
        .select('id, slug, name, muscle_group, equipment, weight_step_kg, default_rest_s, owner_id, description, video_url')
        .is('archived_at', null)
      if (error) throw error
      return data.map((r) => ({
        id: r.id,
        slug: r.slug,
        name: r.name,
        muscle: r.muscle_group,
        equipment: r.equipment,
        weightStepKg: Number(r.weight_step_kg),
        defaultRestS: r.default_rest_s,
        ownerId: r.owner_id,
        description: r.description,
        videoUrl: r.video_url,
      }))
    },
  })
}

export function useExerciseMap() {
  const query = useExercises()
  const map = new Map((query.data ?? []).map((e) => [e.id, e]))
  return { ...query, map }
}

export interface NewExercise {
  name: string
  muscle: MuscleGroup
  equipment: Equipment
  weightStepKg: number
  defaultRestS: number
  description?: string | null
  videoUrl?: string | null
}

export function useCreateExercise() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: NewExercise): Promise<Exercise> => {
      const { data, error } = await supabase!
        .from('exercises')
        .insert({
          name: input.name.trim(),
          muscle_group: input.muscle,
          equipment: input.equipment,
          weight_step_kg: input.weightStepKg,
          default_rest_s: input.defaultRestS,
          owner_id: user!.id,
          description: input.description?.trim() || null,
          video_url: input.videoUrl || null,
        })
        .select('id')
        .single()
      if (error) throw error
      return {
        ...input,
        id: data.id,
        slug: null,
        ownerId: user!.id,
        description: input.description?.trim() || null,
        videoUrl: input.videoUrl || null,
      }
    },
    onSuccess: (exercise) => {
      queryClient.setQueryData<Exercise[]>(exercisesKey, (old) => (old ? [...old, exercise] : [exercise]))
    },
  })
}

export interface ExerciseGuideInput {
  id: string
  description: string | null
  /** Canonical YouTube link (youtubeWatchUrl) or null. */
  videoUrl: string | null
}

/** The owner edits the description and video of a custom exercise. */
export function useUpdateExerciseGuide() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, description, videoUrl }: ExerciseGuideInput) => {
      const { error } = await supabase!
        .from('exercises')
        .update({ description: description?.trim() || null, video_url: videoUrl || null })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: (_data, { id, description, videoUrl }) => {
      queryClient.setQueryData<Exercise[]>(exercisesKey, (old) =>
        old?.map((e) => (e.id === id ? { ...e, description: description?.trim() || null, videoUrl: videoUrl || null } : e)),
      )
    },
  })
}

export interface ExerciseSettings {
  setupNotes: string | null
  restS: number | null
}

const settingsKey = (athleteId: string | undefined) => ['exercise-settings', athleteId] as const

/** Per-athlete machine setup notes and preferred rest, keyed by exercise id. */
export function useExerciseSettings(athleteId: string | undefined) {
  return useQuery({
    queryKey: settingsKey(athleteId),
    enabled: Boolean(supabase && athleteId),
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('athlete_exercise_settings')
        .select('exercise_id, setup_notes, rest_s')
        .eq('athlete_id', athleteId!)
      if (error) throw error
      return new Map<string, ExerciseSettings>(
        data.map((r) => [r.exercise_id, { setupNotes: r.setup_notes, restS: r.rest_s }]),
      )
    },
  })
}

export function useSaveExerciseSettings(athleteId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ exerciseId, ...settings }: ExerciseSettings & { exerciseId: string }) => {
      const { error } = await supabase!.from('athlete_exercise_settings').upsert({
        athlete_id: athleteId!,
        exercise_id: exerciseId,
        setup_notes: settings.setupNotes?.trim() || null,
        rest_s: settings.restS,
      })
      if (error) throw error
    },
    onMutate: ({ exerciseId, ...settings }) => {
      queryClient.setQueryData<Map<string, ExerciseSettings>>(settingsKey(athleteId), (old) => {
        const next = new Map(old)
        next.set(exerciseId, settings)
        return next
      })
    },
    onError: () => queryClient.invalidateQueries({ queryKey: settingsKey(athleteId) }),
  })
}

/** Sensible defaults for a new exercise, matching scripts/gen-exercise-seed.mjs. */
export function exerciseDefaults(equipment: Equipment, muscle: MuscleGroup): { weightStepKg: number; defaultRestS: number } {
  const step: Record<Equipment, number> = { machine: 5, cable: 5, barbell: 2.5, dumbbell: 2, bodyweight: 2.5, other: 2.5 }
  return {
    weightStepKg: step[equipment],
    defaultRestS: muscle === 'core' ? 60 : equipment === 'barbell' ? 120 : 90,
  }
}
