import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/authContext'
import type { MembershipKind, MembershipWithUsage } from '@/lib/membership'
import { supabase } from '@/lib/supabase'

export interface Membership extends MembershipWithUsage {
  athleteId: string
  title: string | null
  paidOn: string | null
  notes: string | null
}

const membershipsKey = ['memberships'] as const

function fromRow(r: Record<string, unknown>): Membership {
  return {
    id: r.id as string,
    athleteId: r.athlete_id as string,
    kind: r.kind as MembershipKind,
    trainerId: (r.trainer_id as string | null) ?? null,
    title: (r.title as string | null) ?? null,
    startsOn: r.starts_on as string,
    endsOn: (r.ends_on as string | null) ?? null,
    sessionsTotal: (r.sessions_total as number | null) ?? null,
    sessionsUsed: Number(r.sessions_used ?? 0),
    paidOn: (r.paid_on as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
  }
}

/**
 * Memberships with usage. Without an athlete: everything RLS lets me see (my own, packages I
 * sold, gym memberships of my clients) — the trainer dashboard groups them by athlete.
 */
export function useMemberships(athleteId?: string) {
  return useQuery({
    queryKey: [...membershipsKey, athleteId ?? 'all'],
    enabled: Boolean(supabase),
    queryFn: async (): Promise<Membership[]> => {
      let query = supabase!
        .from('membership_usage')
        .select('id, athlete_id, kind, trainer_id, title, starts_on, ends_on, sessions_total, sessions_used, paid_on, notes')
        .order('starts_on', { ascending: false })
      if (athleteId) query = query.eq('athlete_id', athleteId)
      const { data, error } = await query
      if (error) throw error
      return (data as Record<string, unknown>[]).map(fromRow)
    },
  })
}

export interface SaveMembershipInput {
  id: string | null
  athleteId: string
  kind: MembershipKind
  title: string | null
  startsOn: string
  endsOn: string | null
  sessionsTotal: number | null
  paidOn: string | null
  notes: string | null
}

export function useSaveMembership() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (input: SaveMembershipInput) => {
      const row = {
        athlete_id: input.athleteId,
        kind: input.kind,
        trainer_id: input.kind === 'trainer' ? user!.id : null,
        title: input.title?.trim() || null,
        starts_on: input.startsOn,
        ends_on: input.endsOn,
        sessions_total: input.sessionsTotal,
        paid_on: input.paidOn,
        notes: input.notes?.trim() || null,
      }
      const { error } = input.id
        ? await supabase!.from('memberships').update(row).eq('id', input.id)
        : await supabase!.from('memberships').insert(row)
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: membershipsKey }),
  })
}

export function useDeleteMembership() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase!.from('memberships').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: membershipsKey }),
  })
}
