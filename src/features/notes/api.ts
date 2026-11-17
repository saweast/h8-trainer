import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { MuscleGroup } from '@/data/exercises'
import { supabase } from '@/lib/supabase'

export const NOTE_KINDS = ['note', 'avoid', 'prefer'] as const
export type NoteKind = (typeof NOTE_KINDS)[number]

/** A trainer's private note about a client. Only its author ever reads it (RLS). */
export interface ClientNote {
  id: string
  kind: NoteKind
  exerciseId: string | null
  muscle: MuscleGroup | null
  body: string
  updatedAt: string
}

export interface NoteDraft {
  kind: NoteKind
  exerciseId: string | null
  muscle: MuscleGroup | null
  body: string
}

const notesKey = (athleteId: string | undefined) => ['client-notes', athleteId] as const

/** My notes about this client; empty for anyone who isn't their trainer. */
export function useClientNotes(athleteId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: notesKey(athleteId),
    enabled: Boolean(supabase && athleteId) && enabled,
    queryFn: async (): Promise<ClientNote[]> => {
      const { data, error } = await supabase!
        .from('client_notes')
        .select('id, kind, exercise_id, muscle_group, body, updated_at')
        .eq('athlete_id', athleteId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data.map((r) => ({
        id: r.id,
        kind: r.kind as NoteKind,
        exerciseId: r.exercise_id,
        muscle: r.muscle_group,
        body: r.body,
        updatedAt: r.updated_at,
      }))
    },
  })
}

const toRow = (d: NoteDraft) => ({
  kind: d.kind,
  // a plain note isn't about one exercise or group
  exercise_id: d.kind === 'note' ? null : d.exerciseId,
  muscle_group: d.kind === 'note' || d.exerciseId ? null : d.muscle,
  body: d.body.trim(),
})

export function useSaveClientNote(athleteId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, draft }: { id: string | null; draft: NoteDraft }) => {
      const { error } = id
        ? await supabase!.from('client_notes').update(toRow(draft)).eq('id', id)
        : await supabase!.from('client_notes').insert({ athlete_id: athleteId, ...toRow(draft) })
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: notesKey(athleteId) }),
  })
}

export function useDeleteClientNote(athleteId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase!.from('client_notes').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: notesKey(athleteId) }),
  })
}

/** What the client's notes say about one exercise: avoid wins over prefer, the exercise over its group. */
export function noteFlag(notes: ClientNote[], exercise: { id: string; muscle: MuscleGroup }): ClientNote | null {
  const relevant = notes.filter((n) => n.kind !== 'note' && (n.exerciseId === exercise.id || (!n.exerciseId && n.muscle === exercise.muscle)))
  const rank = (n: ClientNote) => (n.kind === 'avoid' ? 0 : 2) + (n.exerciseId ? 0 : 1)
  return relevant.sort((a, b) => rank(a) - rank(b))[0] ?? null
}
