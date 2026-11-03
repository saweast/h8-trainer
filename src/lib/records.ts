import { estimateOneRepMax } from './oneRepMax'

/** Best results for one athlete + exercise, excluding the workout in progress. */
export interface ExerciseRecords {
  bestWeightKg: number | null
  bestE1rmKg: number | null
  bestSetVolumeKg: number | null
}

export type PrKind = 'weight' | 'e1rm' | 'volume'

export interface LoggedSet {
  weightKg: number
  reps: number
  isWarmup: boolean
}

/**
 * Which personal records a completed set beats. Warm-ups never count, and the very first
 * time an exercise is logged (no history) is not treated as a record to avoid badge spam.
 */
export function detectPrs(set: LoggedSet, previous: ExerciseRecords | null): PrKind[] {
  if (set.isWarmup || set.reps <= 0 || set.weightKg <= 0 || !previous) return []
  const hasHistory =
    previous.bestWeightKg !== null || previous.bestE1rmKg !== null || previous.bestSetVolumeKg !== null
  if (!hasHistory) return []

  const kinds: PrKind[] = []
  if (previous.bestWeightKg !== null && set.weightKg > previous.bestWeightKg) kinds.push('weight')

  const e1rm = estimateOneRepMax(set.weightKg, set.reps)
  if (e1rm !== null && previous.bestE1rmKg !== null && e1rm > previous.bestE1rmKg) kinds.push('e1rm')

  const volume = set.weightKg * set.reps
  if (previous.bestSetVolumeKg !== null && volume > previous.bestSetVolumeKg) kinds.push('volume')

  return kinds
}
