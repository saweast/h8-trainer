import type { Equipment, MuscleGroup } from '@/data/exercises'
import { mediaFor } from '@/data/exerciseMedia'

/** What a guide needs to know about an exercise (a catalog row, a custom one or a demo row). */
export interface GuideExercise {
  id: string | null
  slug: string | null
  name: string
  muscle: MuscleGroup
  equipment: Equipment
  ownerId: string | null
  description: string | null
  videoUrl: string | null
}

/**
 * Catalog exercises always have a guide. A custom one has a guide once its owner wrote
 * something, and its owner always gets the button so they can add one.
 */
export function hasGuide(exercise: GuideExercise, mine: boolean): boolean {
  if (mediaFor(exercise.slug)) return true
  if (!exercise.ownerId || !exercise.id) return false
  return mine || Boolean(exercise.description || exercise.videoUrl)
}
