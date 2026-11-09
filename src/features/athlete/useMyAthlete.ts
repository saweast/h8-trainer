import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/authContext'
import { supabase } from '@/lib/supabase'

/** The signed-in user's own athlete row (created by the on-signup trigger). */
export function useMyAthleteId() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['my-athlete', user?.id],
    enabled: Boolean(supabase && user),
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase!.from('athletes').select('id').eq('user_id', user!.id).single()
      if (error) throw error
      return data.id
    },
  })
}

/** Whether the signed-in athlete is linked to at least one trainer. */
export function useHasTrainer() {
  const { data: athleteId } = useMyAthleteId()
  return useQuery({
    queryKey: ['has-trainer', athleteId],
    enabled: Boolean(supabase && athleteId),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { count, error } = await supabase!
        .from('trainer_athletes')
        .select('trainer_id', { count: 'exact', head: true })
        .eq('athlete_id', athleteId!)
      if (error) throw error
      return (count ?? 0) > 0
    },
  })
}
