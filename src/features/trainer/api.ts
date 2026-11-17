import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface ClientOverview {
  athleteId: string
  displayName: string
  avatarUrl: string | null
  hasAccount: boolean
  linkedAt: string
  lastWorkoutId: string | null
  lastWorkoutTitle: string | null
  lastWorkoutAt: string | null
}

const clientsKey = ['trainer-clients'] as const

export function useTrainerClients(enabled = true) {
  return useQuery({
    queryKey: clientsKey,
    enabled: Boolean(supabase) && enabled,
    queryFn: async (): Promise<ClientOverview[]> => {
      const { data, error } = await supabase!.rpc('trainer_clients_overview')
      if (error) throw error
      return data.map((r) => ({
        athleteId: r.athlete_id,
        displayName: r.display_name,
        avatarUrl: r.avatar_url,
        hasAccount: r.has_account,
        linkedAt: r.linked_at,
        lastWorkoutId: r.last_workout_id,
        lastWorkoutTitle: r.last_workout_title,
        lastWorkoutAt: r.last_workout_at,
      }))
    },
  })
}

export interface AthleteInfo {
  id: string
  displayName: string
  userId: string | null
  avatarUrl: string | null
}

/** Any athlete I can access (myself or a client). */
export function useAthlete(athleteId: string | undefined) {
  return useQuery({
    queryKey: ['athlete', athleteId],
    enabled: Boolean(supabase && athleteId),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<AthleteInfo> => {
      const { data, error } = await supabase!
        .from('athletes')
        .select('id, display_name, user_id, profiles!athletes_user_id_fkey (avatar_url)')
        .eq('id', athleteId!)
        .single()
      if (error) throw error
      const profile = data.profiles as { avatar_url: string | null } | null
      return { id: data.id, displayName: data.display_name, userId: data.user_id, avatarUrl: profile?.avatar_url ?? null }
    },
  })
}

export function useCreateOfflineClient() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase!.rpc('create_offline_client', { p_display_name: name })
      if (error) throw error
      return data
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: clientsKey }),
  })
}

export function useRenameAthlete() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ athleteId, name }: { athleteId: string; name: string }) => {
      const { error } = await supabase!.from('athletes').update({ display_name: name.trim() }).eq('id', athleteId)
      if (error) throw error
    },
    onSuccess: (_d, { athleteId }) => {
      void queryClient.invalidateQueries({ queryKey: clientsKey })
      void queryClient.invalidateQueries({ queryKey: ['athlete', athleteId] })
    },
  })
}

/** Offline client: delete with history. Client with an account: just remove the link. */
export function useRemoveClient() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ athleteId, hasAccount, trainerId }: { athleteId: string; hasAccount: boolean; trainerId: string }) => {
      const { error } = hasAccount
        ? await supabase!.from('trainer_athletes').delete().eq('athlete_id', athleteId).eq('trainer_id', trainerId)
        : await supabase!.from('athletes').delete().eq('id', athleteId)
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: clientsKey }),
  })
}

// Invites -----------------------------------------------------------------------------------

export function inviteUrl(code: string): string {
  return new URL(`${import.meta.env.BASE_URL}invite/${code}`, window.location.origin).toString()
}

/** New invite; with an offline athlete the invitee takes over that client's history. */
export function useCreateInvite() {
  return useMutation({
    mutationFn: async (athleteId: string | null) => {
      const { data, error } = await supabase!.from('invites').insert({ athlete_id: athleteId }).select('code').single()
      if (error) throw error
      return data.code
    },
  })
}

export interface InvitePreview {
  trainerName: string
  trainerAvatarUrl: string | null
  athleteName: string | null
  status: 'valid' | 'used' | 'expired' | 'own' | 'not_found'
}

export function useInvite(code: string | undefined) {
  return useQuery({
    queryKey: ['invite', code],
    enabled: Boolean(supabase && code),
    queryFn: async (): Promise<InvitePreview> => {
      const { data, error } = await supabase!.rpc('get_invite', { p_code: code! })
      if (error) throw error
      const row = data[0]
      if (!row) return { trainerName: '', trainerAvatarUrl: null, athleteName: null, status: 'not_found' }
      return {
        trainerName: row.trainer_name,
        trainerAvatarUrl: row.trainer_avatar_url,
        athleteName: row.athlete_name,
        status: row.status as InvitePreview['status'],
      }
    },
  })
}

export function useClaimInvite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (code: string) => {
      const { data, error } = await supabase!.rpc('claim_invite', { p_code: code })
      if (error) throw error
      return data
    },
    // Everything about "me" may have changed (history, packages, templates from the trainer).
    onSuccess: () => void queryClient.invalidateQueries(),
  })
}

// Merging clients ---------------------------------------------------------------------------

/** Moves an offline client's history into another of my clients; the offline one is removed. */
export function useMergeClients() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ fromId, intoId }: { fromId: string; intoId: string }) => {
      const { data, error } = await supabase!.rpc('merge_clients', { p_from: fromId, p_into: intoId })
      if (error) throw error
      return data
    },
    // History, packages, plans and records of the target all changed. The merged-away client's
    // queries are left alone: its page is still mounted until we navigate, and refetching a
    // deleted athlete only fails.
    onSuccess: (_d, { fromId }) =>
      void queryClient.invalidateQueries({ predicate: (q) => !q.queryKey.includes(fromId) }),
  })
}

export interface LinkRequest {
  id: string
  email: string
  createdAt: string
}

const linkRequestKey = (athleteId: string | undefined) => ['link-request', athleteId] as const

/** The open "take over this history" request sent for an offline client, if any. */
export function useLinkRequest(athleteId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: linkRequestKey(athleteId),
    enabled: Boolean(supabase && athleteId) && enabled,
    queryFn: async (): Promise<LinkRequest | null> => {
      const { data, error } = await supabase!
        .from('client_link_requests')
        .select('id, email, created_at')
        .eq('athlete_id', athleteId!)
        .maybeSingle()
      if (error) throw error
      return data ? { id: data.id, email: data.email, createdAt: data.created_at } : null
    },
  })
}

export function useRequestLink(athleteId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (email: string) => {
      const { error } = await supabase!.rpc('request_client_link', { p_athlete: athleteId, p_email: email })
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: linkRequestKey(athleteId) }),
  })
}

export function useCancelLinkRequest(athleteId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase!.from('client_link_requests').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: linkRequestKey(athleteId) }),
  })
}

export interface IncomingLinkRequest {
  id: string
  trainerName: string
  trainerAvatarUrl: string | null
  athleteName: string
  workoutsCount: number
}

const myLinkRequestsKey = ['my-link-requests'] as const

/** Requests from trainers to move an offline client's history into my account (by my email). */
export function useMyLinkRequests() {
  return useQuery({
    queryKey: myLinkRequestsKey,
    enabled: Boolean(supabase),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<IncomingLinkRequest[]> => {
      const { data, error } = await supabase!.rpc('my_link_requests')
      if (error) throw error
      return data.map((r) => ({
        id: r.id,
        trainerName: r.trainer_name,
        trainerAvatarUrl: r.trainer_avatar_url,
        athleteName: r.athlete_name,
        workoutsCount: r.workouts_count,
      }))
    },
  })
}

export function useAnswerLinkRequest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, accept }: { id: string; accept: boolean }) => {
      const { error } = accept
        ? await supabase!.rpc('accept_link_request', { p_id: id })
        : await supabase!.rpc('decline_link_request', { p_id: id })
      if (error) throw error
    },
    // Accepting brings history, packages and a trainer into "me".
    onSuccess: (_d, { accept }) =>
      void (accept ? queryClient.invalidateQueries() : queryClient.invalidateQueries({ queryKey: myLinkRequestsKey })),
  })
}

// Assignments -------------------------------------------------------------------------------

export interface Assignment {
  id: string
  athleteId: string
  templateId: string | null
  programId: string | null
}

export function useAssignments(athleteId: string | undefined) {
  return useQuery({
    queryKey: ['assignments', athleteId],
    enabled: Boolean(supabase && athleteId),
    queryFn: async (): Promise<Assignment[]> => {
      const { data, error } = await supabase!
        .from('assignments')
        .select('id, athlete_id, template_id, program_id')
        .eq('athlete_id', athleteId!)
      if (error) throw error
      return data.map((a) => ({ id: a.id, athleteId: a.athlete_id, templateId: a.template_id, programId: a.program_id }))
    },
  })
}

export function useToggleAssignment(athleteId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { templateId?: string; programId?: string; assignmentId?: string }) => {
      if (input.assignmentId) {
        const { error } = await supabase!.from('assignments').delete().eq('id', input.assignmentId)
        if (error) throw error
        return
      }
      const { error } = await supabase!.from('assignments').insert({
        athlete_id: athleteId!,
        template_id: input.templateId ?? null,
        program_id: input.programId ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['assignments', athleteId] }),
  })
}

// Comments ----------------------------------------------------------------------------------

export interface WorkoutComment {
  id: string
  authorId: string
  authorName: string
  body: string
  createdAt: string
}

export function useWorkoutComments(workoutId: string | undefined) {
  return useQuery({
    queryKey: ['workout-comments', workoutId],
    enabled: Boolean(supabase && workoutId),
    queryFn: async (): Promise<WorkoutComment[]> => {
      const { data, error } = await supabase!
        .from('workout_comments')
        .select('id, author_id, body, created_at, profiles (display_name)')
        .eq('workout_id', workoutId!)
        .order('created_at')
      if (error) throw error
      return data.map((c) => ({
        id: c.id,
        authorId: c.author_id,
        authorName: (c.profiles as { display_name: string } | null)?.display_name ?? '',
        body: c.body,
        createdAt: c.created_at,
      }))
    },
  })
}

export function useAddComment(workoutId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: string) => {
      const { error } = await supabase!.from('workout_comments').insert({ workout_id: workoutId, body: body.trim() })
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['workout-comments', workoutId] }),
  })
}

export function useDeleteComment(workoutId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase!.from('workout_comments').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['workout-comments', workoutId] }),
  })
}
