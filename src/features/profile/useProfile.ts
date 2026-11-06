import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Tables } from '@/lib/db.types'
import { supabase } from '@/lib/supabase'

export interface Profile {
  id: string
  displayName: string
  avatarUrl: string | null
  isTrainer: boolean
  /** Granted by an admin; without it "I'm a trainer" can't be switched on. */
  canBeTrainer: boolean
  isAdmin: boolean
  locale: 'uk' | 'en'
}

type ProfileRow = Pick<
  Tables<'profiles'>,
  'id' | 'display_name' | 'avatar_url' | 'is_trainer' | 'can_be_trainer' | 'is_admin' | 'locale'
>

const COLUMNS = 'id, display_name, avatar_url, is_trainer, can_be_trainer, is_admin, locale'

function fromRow(row: ProfileRow): Profile {
  return {
    id: row.id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    isTrainer: row.is_trainer,
    canBeTrainer: row.can_be_trainer,
    isAdmin: row.is_admin,
    locale: row.locale === 'en' ? 'en' : 'uk',
  }
}

export const profileKey = (userId: string | undefined) => ['profile', userId] as const

/** The signed-in user's row from `profiles` (created by the on-signup trigger). */
export function useProfile(userId: string | undefined) {
  return useQuery({
    queryKey: profileKey(userId),
    enabled: Boolean(supabase && userId),
    queryFn: async () => {
      const { data, error } = await supabase!.from('profiles').select(COLUMNS).eq('id', userId!).single()
      if (error) throw error
      return fromRow(data)
    },
  })
}

type ProfilePatch = Partial<Pick<Profile, 'displayName' | 'isTrainer' | 'locale'>>

export function useUpdateProfile(userId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (patch: ProfilePatch) => {
      const row: Partial<Pick<ProfileRow, 'display_name' | 'is_trainer' | 'locale'>> = {}
      if (patch.displayName !== undefined) row.display_name = patch.displayName
      if (patch.isTrainer !== undefined) row.is_trainer = patch.isTrainer
      if (patch.locale !== undefined) row.locale = patch.locale
      const { data, error } = await supabase!
        .from('profiles')
        .update(row)
        .eq('id', userId!)
        .select(COLUMNS)
        .single()
      if (error) throw error
      return fromRow(data)
    },
    // Optimistic: the switch flips immediately, rolls back on error.
    onMutate: async (patch) => {
      const key = profileKey(userId)
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<Profile>(key)
      if (previous) queryClient.setQueryData<Profile>(key, { ...previous, ...patch })
      return { previous }
    },
    onError: (_error, _patch, context) => {
      if (context?.previous) queryClient.setQueryData(profileKey(userId), context.previous)
    },
    onSuccess: (profile) => queryClient.setQueryData(profileKey(userId), profile),
  })
}
