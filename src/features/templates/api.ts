import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/authContext'
import { activeWorkoutKey } from '@/features/workout/api'
import { fromSpecSets, toSpecSets } from '@/lib/setSpec'
import { supabase } from '@/lib/supabase'
import type { TemplateItemInput } from '@/lib/templateFromWorkout'

export type TemplateItem = TemplateItemInput

export interface TemplateSummary {
  id: string
  name: string
  ownerId: string
  exerciseCount: number
}

export interface Template {
  id: string
  name: string
  notes: string | null
  ownerId: string
  items: TemplateItem[]
}

export interface ProgramSummary {
  id: string
  name: string
  ownerId: string
  days: { templateId: string; name: string }[]
}

const templatesKey = ['templates'] as const
const templateKey = (id: string) => ['template', id] as const
const programsKey = ['programs'] as const

// Templates ---------------------------------------------------------------------------------

/** Mine plus those of my trainers/clients (RLS: linked users). */
export function useTemplates() {
  return useQuery({
    queryKey: templatesKey,
    enabled: Boolean(supabase),
    queryFn: async (): Promise<TemplateSummary[]> => {
      const { data, error } = await supabase!
        .from('templates')
        .select('id, name, owner_id, template_exercises(count)')
        .order('name')
      if (error) throw error
      return data.map((t) => ({
        id: t.id,
        name: t.name,
        ownerId: t.owner_id,
        exerciseCount: (t.template_exercises as unknown as { count: number }[])[0]?.count ?? 0,
      }))
    },
  })
}

export function useTemplate(id: string | undefined) {
  return useQuery({
    queryKey: templateKey(id ?? ''),
    enabled: Boolean(supabase && id),
    queryFn: async (): Promise<Template> => {
      const { data, error } = await supabase!
        .from('templates')
        .select(
          `id, name, notes, owner_id,
           template_exercises (exercise_id, position, target_sets, target_reps_min, target_reps_max, target_weight_kg, rest_s, notes, sets)`,
        )
        .eq('id', id!)
        .single()
      if (error) throw error
      return {
        id: data.id,
        name: data.name,
        notes: data.notes,
        ownerId: data.owner_id,
        items: [...data.template_exercises]
          .sort((a, b) => a.position - b.position)
          .map((te) => ({
            exerciseId: te.exercise_id,
            targetSets: te.target_sets,
            targetRepsMin: te.target_reps_min,
            targetRepsMax: te.target_reps_max,
            targetWeightKg: te.target_weight_kg === null ? null : Number(te.target_weight_kg),
            restS: te.rest_s,
            notes: te.notes,
            sets: te.sets === null ? null : toSpecSets(te.sets),
          })),
      }
    },
  })
}

/** When the athlete last finished each template (for sorting the start sheet). */
export function useTemplateUsage(athleteId: string | undefined) {
  return useQuery({
    queryKey: ['template-usage', athleteId],
    enabled: Boolean(supabase && athleteId),
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('template_usage')
        .select('template_id, last_used_at')
        .eq('athlete_id', athleteId!)
      if (error) throw error
      return new Map(data.map((r) => [r.template_id!, r.last_used_at!]))
    },
  })
}

export interface SaveTemplateInput {
  id: string | null
  name: string
  notes: string | null
  items: TemplateItem[]
}

export function useSaveTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: SaveTemplateInput) => {
      const { data, error } = await supabase!.rpc('save_template', {
        p_id: input.id as string,
        p_name: input.name,
        p_notes: input.notes ?? '',
        p_items: input.items.map((i) => ({
          exercise_id: i.exerciseId,
          target_sets: i.targetSets,
          target_reps_min: i.targetRepsMin,
          target_reps_max: i.targetRepsMax,
          target_weight_kg: i.targetWeightKg,
          rest_s: i.restS,
          notes: i.notes,
          sets: i.sets?.length ? fromSpecSets(i.sets) : null,
        })),
      })
      if (error) throw error
      return data as string
    },
    onSuccess: (id) => {
      void queryClient.invalidateQueries({ queryKey: templatesKey })
      void queryClient.invalidateQueries({ queryKey: templateKey(id) })
      void queryClient.invalidateQueries({ queryKey: programsKey })
    },
  })
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase!.from('templates').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: templatesKey })
      void queryClient.invalidateQueries({ queryKey: programsKey })
    },
  })
}

// Programs ----------------------------------------------------------------------------------

export function usePrograms() {
  return useQuery({
    queryKey: programsKey,
    enabled: Boolean(supabase),
    queryFn: async (): Promise<ProgramSummary[]> => {
      const { data, error } = await supabase!
        .from('programs')
        .select('id, name, owner_id, program_templates (position, template_id, templates (name))')
        .order('name')
      if (error) throw error
      return data.map((p) => ({
        id: p.id,
        name: p.name,
        ownerId: p.owner_id,
        days: [...p.program_templates]
          .sort((a, b) => a.position - b.position)
          .map((d) => ({ templateId: d.template_id, name: d.templates?.name ?? '' })),
      }))
    },
  })
}

export function useSaveProgram() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string | null; name: string; templateIds: string[] }) => {
      const { data, error } = await supabase!.rpc('save_program', {
        p_id: input.id as string,
        p_name: input.name,
        p_template_ids: input.templateIds,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: programsKey }),
  })
}

export function useDeleteProgram() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase!.from('programs').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: programsKey }),
  })
}

/**
 * The program to offer on the start sheet: the one used most recently, else the first one,
 * with the template that comes next in it.
 */
export function useNextProgramDay(athleteId: string | undefined, programs: ProgramSummary[] | undefined) {
  return useQuery({
    queryKey: ['next-program-day', athleteId, programs?.map((p) => p.id).join(',')],
    enabled: Boolean(supabase && athleteId && programs?.some((p) => p.days.length)),
    queryFn: async () => {
      const { data: last, error } = await supabase!
        .from('workouts')
        .select('program_id')
        .eq('athlete_id', athleteId!)
        .not('program_id', 'is', null)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      const usable = programs!.filter((p) => p.days.length)
      const program = usable.find((p) => p.id === last?.program_id) ?? usable[0]
      const { data: templateId, error: nextError } = await supabase!.rpc('next_program_template', {
        p_athlete: athleteId!,
        p_program: program.id,
      })
      if (nextError) throw nextError
      const day = program.days.find((d) => d.templateId === templateId) ?? program.days[0]
      return { program, day }
    },
  })
}

// Starting ----------------------------------------------------------------------------------

export function useStartFromTemplate(athleteId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ templateId, programId, membershipId }: { templateId: string; programId?: string; membershipId?: string | null }) => {
      const { data, error } = await supabase!.rpc('start_workout_from_template', {
        p_athlete: athleteId!,
        p_template: templateId,
        p_program: programId,
        p_membership: membershipId ?? undefined,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: activeWorkoutKey(athleteId) }),
  })
}

export function useIsMine() {
  const { user } = useAuth()
  return (ownerId: string | null | undefined) => Boolean(user && ownerId === user.id)
}
