import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BODY_METRICS, type BodyEntry, type BodyValues } from '@/lib/body'
import type { TablesInsert } from '@/lib/db.types'
import { supabase } from '@/lib/supabase'

const bodyKey = (athleteId: string | undefined) => ['body-measurements', athleteId] as const

const COLUMNS = `id, measured_at, notes, ${BODY_METRICS.map((m) => m.column).join(', ')}`

/** All measurements of one athlete, newest first. */
export function useBodyMeasurements(athleteId: string | undefined) {
  return useQuery({
    queryKey: bodyKey(athleteId),
    enabled: Boolean(supabase && athleteId),
    queryFn: async (): Promise<BodyEntry[]> => {
      const { data, error } = await supabase!
        .from('body_measurements')
        .select(COLUMNS)
        .eq('athlete_id', athleteId!)
        .order('measured_at', { ascending: false })
        .order('created_at', { ascending: false })
        .returns<Record<string, unknown>[]>()
      if (error) throw error
      return data.map((row) => {
        const entry = { id: row.id as string, measuredAt: row.measured_at as string, notes: (row.notes as string | null) ?? null } as BodyEntry
        for (const m of BODY_METRICS) {
          const v = row[m.column]
          entry[m.key] = v === null || v === undefined ? null : Number(v)
        }
        return entry
      })
    },
  })
}

export interface SaveBodyInput extends BodyValues {
  id: string | null
  measuredAt: string
  notes: string | null
}

export function useSaveMeasurement(athleteId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, measuredAt, notes, ...values }: SaveBodyInput) => {
      const row: TablesInsert<'body_measurements'> = {
        athlete_id: athleteId!,
        measured_at: measuredAt,
        notes: notes?.trim() || null,
      }
      for (const m of BODY_METRICS) (row as Record<string, unknown>)[m.column] = values[m.key]
      const { error } = id
        ? await supabase!.from('body_measurements').update(row).eq('id', id)
        : await supabase!.from('body_measurements').insert(row)
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: bodyKey(athleteId) }),
  })
}

export function useDeleteMeasurement(athleteId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase!.from('body_measurements').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: bodyKey(athleteId) }),
  })
}
