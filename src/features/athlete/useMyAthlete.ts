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
