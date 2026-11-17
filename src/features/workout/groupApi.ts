import { useMutation, useQueries, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/authContext'
import { supabase } from '@/lib/supabase'
import {
  activeWorkoutKey,
  finishedHere,
  recentWorkoutsKey,
  waitForWrites,
  workoutKey,
  workoutQueryOptions,
} from './api'

// A split session: one trainer, several clients at once. Each client has a workout of their own
// (history, records and package charge stay per client); the workouts share a group id.

export interface GroupMember {
  workoutId: string
  athleteId: string
  name: string
  avatarUrl: string | null
}

export interface ActiveGroup {
  groupId: string
  startedAt: string
  title: string
  names: string[]
}

export const groupKey = (groupId: string) => ['workout-group', groupId] as const
export const activeGroupsKey = ['active-workout-groups'] as const

/** Clients of the session I run, in a stable order (by name). */
export function useGroupMembers(groupId: string | undefined) {
  const { user } = useAuth()
  return useQuery({
    queryKey: groupKey(groupId ?? ''),
    enabled: Boolean(supabase && groupId && user),
    queryFn: async (): Promise<GroupMember[]> => {
      const { data, error } = await supabase!
        .from('workouts')
        .select('id, athlete_id, athletes (display_name, profiles!athletes_user_id_fkey (avatar_url))')
        .eq('group_id', groupId!)
        .eq('created_by', user!.id)
      if (error) throw error
      return data
        .map((r) => ({
          workoutId: r.id,
          athleteId: r.athlete_id,
          name: r.athletes?.display_name ?? '',
          avatarUrl: r.athletes?.profiles?.avatar_url ?? null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'uk'))
    },
  })
}

/** Each member's workout, live-synced like a single workout. A deleted one comes back undefined. */
export function useGroupWorkouts(members: GroupMember[] | undefined) {
  const queryClient = useQueryClient()
  return useQueries({
    queries: (members ?? []).map((m) => workoutQueryOptions(queryClient, m.workoutId)),
    combine: (results) => ({
      workouts: results.map((r) => r.data),
      pending: results.some((r) => r.isPending),
    }),
  })
}

/** Split sessions I started that are still going (to get back into them). */
export function useActiveGroups(enabled = true) {
  const { user } = useAuth()
  return useQuery({
    queryKey: activeGroupsKey,
    enabled: Boolean(supabase && user) && enabled,
    queryFn: async (): Promise<ActiveGroup[]> => {
      const { data, error } = await supabase!
        .from('workouts')
        .select('group_id, started_at, title, last_activity_at, athletes (display_name)')
        .eq('created_by', user!.id)
        .not('group_id', 'is', null)
        .is('finished_at', null)
        .order('started_at', { ascending: false })
      if (error) throw error
      const groups = new Map<string, ActiveGroup>()
      for (const r of data) {
        // Abandoned ones are closed by the server on the next sweep; don't offer them.
        if (Date.now() - new Date(r.last_activity_at).getTime() > 30 * 60_000) continue
        const g = groups.get(r.group_id!) ?? { groupId: r.group_id!, startedAt: r.started_at, title: r.title, names: [] }
        g.names.push(r.athletes?.display_name ?? '')
        groups.set(r.group_id!, g)
      }
      return [...groups.values()].map((g) => ({ ...g, names: g.names.sort((a, b) => a.localeCompare(b, 'uk')) }))
    },
  })
}

/** Which athletes I can see are training right now (an unfinished, not abandoned workout). */
export function useTrainingNow(enabled = true) {
  return useQuery({
    queryKey: ['training-now'],
    enabled: Boolean(supabase) && enabled,
    staleTime: 10_000,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase!.from('workouts').select('athlete_id, last_activity_at').is('finished_at', null)
      if (error) throw error
      return new Set(data.filter((r) => Date.now() - new Date(r.last_activity_at).getTime() <= 30 * 60_000).map((r) => r.athlete_id))
    },
  })
}

export interface StartGroupInput {
  athleteIds: string[]
  /** Package to charge per client (same order), null = not charged. */
  membershipIds: (string | null)[]
  templateId?: string | null
}

export function useStartGroupWorkout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ athleteIds, membershipIds, templateId }: StartGroupInput) => {
      const { data, error } = await supabase!.rpc('start_group_workout', {
        p_athletes: athleteIds,
        p_memberships: membershipIds as string[],
        p_template: templateId ?? undefined,
      })
      if (error) throw error
      return data
    },
    onSuccess: (_id, { athleteIds }) => {
      void queryClient.invalidateQueries({ queryKey: activeGroupsKey })
      void queryClient.invalidateQueries({ queryKey: ['training-now'] })
      for (const id of athleteIds) void queryClient.invalidateQueries({ queryKey: activeWorkoutKey(id) })
    },
  })
}

function invalidateAfter(queryClient: QueryClient, athleteIds: string[]) {
  void queryClient.invalidateQueries({ queryKey: activeGroupsKey })
  void queryClient.invalidateQueries({ queryKey: ['training-now'] })
  void queryClient.invalidateQueries({ queryKey: ['trainer-clients'] })
  for (const athleteId of athleteIds) {
    for (const key of [activeWorkoutKey(athleteId), recentWorkoutsKey(athleteId)]) void queryClient.invalidateQueries({ queryKey: key })
    for (const key of ['exercise-records', 'last-performance', 'workouts-range', 'exercise-sessions']) {
      void queryClient.invalidateQueries({ queryKey: [key, athleteId] })
    }
  }
  void queryClient.invalidateQueries({ queryKey: ['memberships'] })
}

export interface GroupFinishResult {
  workoutId: string
  athleteId: string
  completedSets: number
}

/** Finishes every client's workout once all their edits reached the server. */
export function useFinishGroup(groupId: string, members: GroupMember[]) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ titles }: { titles: Record<string, string> }): Promise<GroupFinishResult[]> => {
      await waitForWrites(
        queryClient,
        members.map((m) => m.workoutId),
      )
      for (const m of members) finishedHere.add(m.workoutId)
      const { data, error } = await supabase!.rpc('finish_group_workout', { p_group: groupId, p_titles: titles })
      if (error) throw error
      return data.map((r) => ({ workoutId: r.workout_id, athleteId: r.athlete_id, completedSets: r.completed_sets }))
    },
    onSuccess: (results) => {
      for (const r of results) {
        if (r.completedSets > 0) void queryClient.invalidateQueries({ queryKey: workoutKey(r.workoutId) })
        else queryClient.removeQueries({ queryKey: workoutKey(r.workoutId) })
      }
      void queryClient.invalidateQueries({ queryKey: groupKey(groupId) })
      invalidateAfter(
        queryClient,
        members.map((m) => m.athleteId),
      )
    },
  })
}

/** Deletes the whole session (nothing is kept for anyone). */
export function useDiscardGroup(groupId: string, members: GroupMember[]) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      await waitForWrites(
        queryClient,
        members.map((m) => m.workoutId),
      )
      const { error } = await supabase!.from('workouts').delete().eq('group_id', groupId).is('finished_at', null)
      if (error) throw error
    },
    onSuccess: () => {
      for (const m of members) queryClient.removeQueries({ queryKey: workoutKey(m.workoutId) })
      queryClient.removeQueries({ queryKey: groupKey(groupId) })
      invalidateAfter(
        queryClient,
        members.map((m) => m.athleteId),
      )
    },
  })
}

