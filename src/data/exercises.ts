import type { Language } from '@/i18n'
import catalog from './exercise-catalog.json'

export const MUSCLE_GROUPS = [
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'legs',
  'glutes',
  'calves',
  'core',
  'full_body',
  'other',
] as const
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number]

export const EQUIPMENT = ['machine', 'barbell', 'dumbbell', 'cable', 'bodyweight', 'other'] as const
export type Equipment = (typeof EQUIPMENT)[number]

export interface CatalogExercise {
  slug: string
  muscle: MuscleGroup
  equipment: Equipment
  uk: string
  en: string
}

/** Global catalog, the same list that supabase/migrations/*_seed_exercises.sql inserts. */
export const EXERCISE_CATALOG = catalog as CatalogExercise[]

const bySlug = new Map(EXERCISE_CATALOG.map((e) => [e.slug, e]))

/** Global exercises are translated by slug; custom ones show the name their owner typed. */
export function exerciseName(exercise: { slug: string | null; name: string }, lang: Language): string {
  const entry = exercise.slug ? bySlug.get(exercise.slug) : undefined
  return entry ? entry[lang] : exercise.name
}

/** Case- and apostrophe-insensitive search on both languages. */
export function matchesQuery(exercise: CatalogExercise, query: string): boolean {
  const normalize = (s: string) => s.toLocaleLowerCase('uk').replace(/[’'ʼ`]/g, '')
  const q = normalize(query.trim())
  if (!q) return true
  return normalize(exercise.uk).includes(q) || normalize(exercise.en).includes(q)
}

/** Search over any set of display names (e.g. uk + en), ignoring case and apostrophes. */
export function namesMatch(names: string[], query: string): boolean {
  const normalize = (s: string) => s.toLocaleLowerCase('uk').replace(/[’'ʼ`]/g, '')
  const q = normalize(query.trim())
  if (!q) return true
  return names.some((n) => normalize(n).includes(q))
}
