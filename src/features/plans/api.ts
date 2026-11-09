import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { activeWorkoutKey } from '@/features/workout/api'
import type { DoneSet, PlanDraft } from '@/lib/planGrid'
import { toSavePayload } from '@/lib/planGrid'
import { toSpecSets, type SpecSet } from '@/lib/setSpec'
import { supabase } from '@/lib/supabase'

export interface PlanSummary {
  id: string
  name: string
  ownerId: string
  athleteId: string | null
  weeks: number
  archivedAt: string | null
  dayCount: number
}

export interface Plan extends PlanDraft {
  id: string
  ownerId: string
  athleteId: string | null
  archivedAt: string | null
}

/** What was actually done in one cell: the latest workout of that week × row. */
export interface PlanFact {
  workoutId: string
  workoutExerciseId: string
  finishedAt: string | null
  sets: DoneSet[]
  difficulty: number | null
  athleteFeedback: string | null
}

export interface PlanComment {
  id: string
  rowId: string | null
  week: number | null
  authorId: string
  authorName: string
  body: string
  createdAt: string
}

export const plansKey = ['plans'] as const
const planKey = (id: string) => ['plan', id] as const
const athletePlanKey = (athleteId: string | undefined) => ['athlete-plan', athleteId] as const
const factsKey = (planId: string) => ['plan-facts', planId] as const
const nextSlotKey = (planId: string | undefined) => ['plan-next-slot', planId] as const

const summarySelect = 'id, name, owner_id, athlete_id, weeks, archived_at, plan_days(count)'

type SummaryRow = {
  id: string
  name: string
  owner_id: string
  athlete_id: string | null
  weeks: number
  archived_at: string | null
  plan_days: unknown
}

const toSummary = (p: SummaryRow): PlanSummary => ({
  id: p.id,
  name: p.name,
  ownerId: p.owner_id,
  athleteId: p.athlete_id,
  weeks: p.weeks,
  archivedAt: p.archived_at,
  dayCount: (p.plan_days as { count: number }[])[0]?.count ?? 0,
})

/** Every plan I can see: my plan templates, my clients' plans, the ones made for me. */
export function usePlans() {
  return useQuery({
    queryKey: plansKey,
    enabled: Boolean(supabase),
    queryFn: async (): Promise<PlanSummary[]> => {
      const { data, error } = await supabase!.from('plans').select(summarySelect).order('name')
      if (error) throw error
      return data.map(toSummary)
    },
  })
}

/** The athlete's active plan, if any. */
export function useAthletePlan(athleteId: string | undefined) {
  return useQuery({
    queryKey: athletePlanKey(athleteId),
    enabled: Boolean(supabase && athleteId),
    queryFn: async (): Promise<PlanSummary | null> => {
      const { data, error } = await supabase!
        .from('plans')
        .select(summarySelect)
        .eq('athlete_id', athleteId!)
        .is('archived_at', null)
        .maybeSingle()
      if (error) throw error
      return data ? toSummary(data) : null
    },
  })
}

export function usePlan(id: string | undefined) {
  return useQuery({
    queryKey: planKey(id ?? ''),
    enabled: Boolean(supabase && id),
    queryFn: async (): Promise<Plan> => {
      const { data, error } = await supabase!
        .from('plans')
        .select(
          `id, name, notes, weeks, owner_id, athlete_id, archived_at,
           plan_days (id, position, name,
             plan_rows (id, position, exercise_id, rest_s, notes,
               plan_cells (week, sets)))`,
        )
        .eq('id', id!)
        .single()
      if (error) throw error
      return {
        id: data.id,
        name: data.name,
        notes: data.notes ?? '',
        weeks: data.weeks,
        ownerId: data.owner_id,
        athleteId: data.athlete_id,
        archivedAt: data.archived_at,
        days: [...data.plan_days]
          .sort((a, b) => a.position - b.position)
          .map((d) => ({
            id: d.id,
            name: d.name,
            rows: [...d.plan_rows]
              .sort((a, b) => a.position - b.position)
              .map((r) => ({
                id: r.id,
                exerciseId: r.exercise_id,
                restS: r.rest_s,
                notes: r.notes,
                cells: Object.fromEntries(
                  r.plan_cells.flatMap((c): [number, SpecSet[]][] => {
                    const sets = toSpecSets(c.sets)
                    return sets ? [[c.week, sets]] : []
                  }),
                ),
              })),
          })),
      }
    },
  })
}

/** Performed sets per `${rowId}:${week}`, from the plan athlete's workouts. */
export function usePlanFacts(planId: string | undefined, athleteId: string | null | undefined) {
  return useQuery({
    queryKey: factsKey(planId ?? ''),
    enabled: Boolean(supabase && planId && athleteId),
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('workouts')
        .select(
          `id, plan_week, started_at, finished_at,
           workout_exercises (id, plan_row_id, difficulty, athlete_feedback, sets (position, weight_kg, reps, is_warmup, completed_at))`,
        )
        .eq('plan_id', planId!)
        .eq('athlete_id', athleteId!)
        .order('started_at')
      if (error) throw error
      const facts = new Map<string, PlanFact>()
      for (const w of data) {
        if (!w.plan_week) continue
        for (const we of w.workout_exercises) {
          if (!we.plan_row_id) continue
          facts.set(`${we.plan_row_id}:${w.plan_week}`, {
            workoutId: w.id,
            workoutExerciseId: we.id,
            finishedAt: w.finished_at,
            difficulty: we.difficulty,
            athleteFeedback: we.athlete_feedback,
            sets: [...we.sets]
              .sort((a, b) => a.position - b.position)
              .map((s) => ({
                weightKg: Number(s.weight_kg),
                reps: s.reps,
                isWarmup: s.is_warmup,
                completed: s.completed_at !== null,
              })),
          })
        }
      }
      return facts
    },
  })
}

export function useNextPlanSlot(planId: string | undefined) {
  return useQuery({
    queryKey: nextSlotKey(planId),
    enabled: Boolean(supabase && planId),
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('next_plan_slot', { p_plan: planId! })
      if (error) throw error
      const slot = data[0]
      return slot ? { week: slot.week, dayId: slot.plan_day_id } : null
    },
  })
}

function useInvalidatePlans() {
  const queryClient = useQueryClient()
  return (planId?: string) => {
    void queryClient.invalidateQueries({ queryKey: plansKey })
    void queryClient.invalidateQueries({ queryKey: ['athlete-plan'] })
    if (planId) {
      void queryClient.invalidateQueries({ queryKey: planKey(planId) })
      void queryClient.invalidateQueries({ queryKey: nextSlotKey(planId) })
    }
  }
}

export function useSavePlan() {
  const invalidate = useInvalidatePlans()
  return useMutation({
    mutationFn: async ({ id, athleteId, draft }: { id: string; athleteId: string | null; draft: PlanDraft }) => {
      const { data, error } = await supabase!.rpc('save_plan', {
        p_id: id,
        p_athlete: athleteId as string,
        p_name: draft.name,
        p_notes: draft.notes,
        p_weeks: draft.weeks,
        p_days: toSavePayload(draft),
      })
      if (error) throw error
      return data as string
    },
    onSuccess: (id) => invalidate(id),
  })
}

export function useCopyPlan() {
  const invalidate = useInvalidatePlans()
  return useMutation({
    mutationFn: async ({ sourceId, athleteId, name }: { sourceId: string; athleteId: string | null; name?: string }) => {
      const { data, error } = await supabase!.rpc('copy_plan', {
        p_source: sourceId,
        p_athlete: athleteId as string,
        p_name: name,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: (id) => invalidate(id),
  })
}

export function useCreatePlanFromTemplates() {
  const invalidate = useInvalidatePlans()
  return useMutation({
    mutationFn: async (input: { athleteId: string | null; name: string; weeks: number; templateIds: string[] }) => {
      const { data, error } = await supabase!.rpc('create_plan_from_templates', {
        p_athlete: input.athleteId as string,
        p_name: input.name,
        p_weeks: input.weeks,
        p_template_ids: input.templateIds,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: (id) => invalidate(id),
  })
}

export function useArchivePlan() {
  const invalidate = useInvalidatePlans()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase!.from('plans').update({ archived_at: new Date().toISOString() }).eq('id', id)
      if (error) throw error
      return id
    },
    onSuccess: (id) => invalidate(id),
  })
}

export function useDeletePlan() {
  const invalidate = useInvalidatePlans()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase!.from('plans').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidate(),
  })
}

export function useStartFromPlan(athleteId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { planId: string; week: number; dayId: string; membershipId?: string | null }) => {
      const { data, error } = await supabase!.rpc('start_workout_from_plan', {
        p_plan: input.planId,
        p_week: input.week,
        p_day: input.dayId,
        p_membership: input.membershipId ?? undefined,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: (_id, input) => {
      void queryClient.invalidateQueries({ queryKey: activeWorkoutKey(athleteId) })
      void queryClient.invalidateQueries({ queryKey: factsKey(input.planId) })
      void queryClient.invalidateQueries({ queryKey: nextSlotKey(input.planId) })
    },
  })
}

// Comments ----------------------------------------------------------------------------------

const commentsKey = (planId: string) => ['plan-comments', planId] as const

export function usePlanComments(planId: string | undefined) {
  return useQuery({
    queryKey: commentsKey(planId ?? ''),
    enabled: Boolean(supabase && planId),
    queryFn: async (): Promise<PlanComment[]> => {
      const { data, error } = await supabase!
        .from('plan_comments')
        .select('id, plan_row_id, week, author_id, body, created_at, profiles (display_name)')
        .eq('plan_id', planId!)
        .order('created_at')
      if (error) throw error
      return data.map((c) => ({
        id: c.id,
        rowId: c.plan_row_id,
        week: c.week,
        authorId: c.author_id,
        authorName: c.profiles?.display_name ?? '',
        body: c.body,
        createdAt: c.created_at,
      }))
    },
  })
}

export function useAddPlanComment(planId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { rowId: string | null; week: number | null; body: string }) => {
      const { error } = await supabase!
        .from('plan_comments')
        .insert({ plan_id: planId, plan_row_id: input.rowId, week: input.week, body: input.body.trim() })
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: commentsKey(planId) }),
  })
}

export function useDeletePlanComment(planId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase!.from('plan_comments').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: commentsKey(planId) }),
  })
}
