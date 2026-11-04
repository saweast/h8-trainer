import { estimateOneRepMax } from './oneRepMax'
import { isWorkingDone, type StatSet } from './workoutStats'

export interface SessionStats {
  bestWeightKg: number | null
  bestE1rmKg: number | null
  volumeKg: number
  /** Heaviest working set (ties → more reps). */
  topSet: { weightKg: number; reps: number } | null
  workingSets: number
}

/** Per-session numbers for one exercise, over completed working sets. */
export function sessionStats(sets: StatSet[]): SessionStats {
  const done = sets.filter(isWorkingDone)
  let bestWeightKg: number | null = null
  let bestE1rmKg: number | null = null
  let volumeKg = 0
  let topSet: SessionStats['topSet'] = null
  for (const s of done) {
    volumeKg += s.weightKg * s.reps
    if (s.weightKg > 0 && (bestWeightKg === null || s.weightKg > bestWeightKg)) bestWeightKg = s.weightKg
    const e1rm = estimateOneRepMax(s.weightKg, s.reps)
    if (e1rm !== null && (bestE1rmKg === null || e1rm > bestE1rmKg)) bestE1rmKg = e1rm
    if (!topSet || s.weightKg > topSet.weightKg || (s.weightKg === topSet.weightKg && s.reps > topSet.reps)) {
      topSet = { weightKg: s.weightKg, reps: s.reps }
    }
  }
  return { bestWeightKg, bestE1rmKg, volumeKg, topSet, workingSets: done.length }
}
