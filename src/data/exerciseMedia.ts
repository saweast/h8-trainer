import { useQuery } from '@tanstack/react-query'
import type { Language } from '@/i18n'
import media from './exercise-media.json'

/** Muscle names as free-exercise-db uses them (snake_case), translated under `muscleDetail.*`. */
export const MUSCLE_DETAILS = [
  'chest',
  'shoulders',
  'triceps',
  'biceps',
  'forearms',
  'lats',
  'middle_back',
  'lower_back',
  'traps',
  'abdominals',
  'glutes',
  'quadriceps',
  'hamstrings',
  'adductors',
  'abductors',
  'calves',
] as const
export type MuscleDetail = (typeof MUSCLE_DETAILS)[number]

export interface ExerciseMedia {
  /** free-exercise-db exercise the photos come from, or null when there are none. */
  source: string | null
  images: boolean
  thumb?: 'end'
  primary: MuscleDetail[]
  secondary: MuscleDetail[]
  video: { id: string; channel: string } | null
}

export interface ExerciseGuide {
  summary: string
  steps: string[]
  tips: string[]
}

const MEDIA = media as Record<string, ExerciseMedia>

/** Photos, muscles and video for a catalog exercise; custom exercises have none. */
export function mediaFor(slug: string | null | undefined): ExerciseMedia | null {
  return (slug && MEDIA[slug]) || null
}

// Not public/exercises/: that folder would shadow the /exercises route on GitHub Pages.
const base = import.meta.env.BASE_URL

export function thumbUrl(slug: string): string {
  return `${base}exercise-photos/${slug}/thumb.webp`
}

export function photoUrls(slug: string): { start: string; end: string } {
  return { start: `${base}exercise-photos/${slug}/start.webp`, end: `${base}exercise-photos/${slug}/end.webp` }
}

/** Step-by-step texts live in their own chunks and load the first time a guide opens. */
const loaders: Record<Language, () => Promise<Record<string, ExerciseGuide>>> = {
  uk: () => import('./exercise-guides/uk.json').then((m) => m.default as Record<string, ExerciseGuide>),
  en: () => import('./exercise-guides/en.json').then((m) => m.default as Record<string, ExerciseGuide>),
}

export function useExerciseGuide(slug: string | null | undefined, lang: Language) {
  return useQuery({
    queryKey: ['exercise-guides', lang],
    enabled: Boolean(slug && MEDIA[slug]),
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: loaders[lang],
    select: (all) => (slug ? (all[slug] ?? null) : null),
  })
}
