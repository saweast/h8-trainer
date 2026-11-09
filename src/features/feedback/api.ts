import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/authContext'
import { useMode } from '@/features/mode/modeContext'
import { supabase } from '@/lib/supabase'

export interface FeedbackItem {
  key: string
  kind: 'exercise' | 'plan' | 'workout'
  createdAt: string
  athleteId: string
  athleteName: string
  authorName: string
  workoutId: string | null
  exerciseId: string | null
  planId: string | null
  week: number | null
  difficulty: number | null
  body: string | null
}

const feedKey = ['feedback-feed'] as const
const seenKey = (userId: string | undefined) => ['feedback-seen', userId] as const

/** Latest feedback from my clients (trainer mode only). Refreshes every few minutes. */
export function useFeedbackFeed() {
  const { isTrainer } = useMode()
  return useQuery({
    queryKey: feedKey,
    enabled: Boolean(supabase) && isTrainer,
    refetchInterval: 3 * 60_000,
    queryFn: async (): Promise<FeedbackItem[]> => {
      const { data, error } = await supabase!.rpc('trainer_feedback_feed', { p_limit: 50 })
      if (error) throw error
      return data.map((r, i) => ({
        key: `${r.kind}:${r.created_at}:${i}`,
        kind: r.kind as FeedbackItem['kind'],
        createdAt: r.created_at,
        athleteId: r.athlete_id,
        athleteName: r.athlete_name,
        authorName: r.author_name ?? '',
        workoutId: r.workout_id,
        exerciseId: r.exercise_id,
        planId: r.plan_id,
        week: r.week,
        difficulty: r.difficulty,
        body: r.body,
      }))
    },
  })
}

export function useFeedbackSeenAt() {
  const { user } = useAuth()
  const { isTrainer } = useMode()
  return useQuery({
    queryKey: seenKey(user?.id),
    enabled: Boolean(supabase && user) && isTrainer,
    queryFn: async () => {
      const { data, error } = await supabase!.from('profiles').select('feedback_seen_at').eq('id', user!.id).single()
      if (error) throw error
      return data.feedback_seen_at
    },
  })
}

/** Items newer than "seen up to", and how many. */
export function useUnseenFeedback() {
  const { data: feed } = useFeedbackFeed()
  const { data: seenAt, isPending } = useFeedbackSeenAt()
  const unseen = isPending ? [] : (feed ?? []).filter((f) => !seenAt || f.createdAt > seenAt)
  return { feed: feed ?? [], unseen, seenAt: seenAt ?? null }
}

export function useMarkFeedbackSeen() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const now = new Date().toISOString()
      const { error } = await supabase!.from('profiles').update({ feedback_seen_at: now }).eq('id', user!.id)
      if (error) throw error
      return now
    },
    onSuccess: (now) => queryClient.setQueryData(seenKey(user?.id), now),
  })
}
