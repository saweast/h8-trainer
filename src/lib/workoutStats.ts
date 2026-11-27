import { detectPrs, type ExerciseRecords } from './records'

export interface StatSet {
  weightKg: number
  reps: number
  isWarmup: boolean
  /** Continues the set before it (a drop set): volume yes, a set of its own no. */
  isDrop?: boolean
  completedAt: string | null
}

export interface StatExercise<M extends string = string> {
  exerciseId: string
  muscle: M
  sets: StatSet[]
}

/** Done and not a warm-up: counts in volume (drops too). */
export function isWorkingDone(s: StatSet): boolean {
  return s.completedAt !== null && !s.isWarmup
}

/** Done and counts as a set: a drop chain is one set, so drops don't. */
export function isSetDone(s: StatSet): boolean {
  return isWorkingDone(s) && !s.isDrop
}

export interface WorkoutTotals {
  volumeKg: number
  setCount: number
  exerciseCount: number
}

/** Volume and counts over completed working sets only; a drop chain is one set. */
export function workoutTotals(exercises: StatExercise[]): WorkoutTotals {
  let volumeKg = 0
  let setCount = 0
  let exerciseCount = 0
  for (const e of exercises) {
    const done = e.sets.filter(isWorkingDone)
    if (done.length) exerciseCount++
    setCount += done.filter(isSetDone).length
    for (const s of done) volumeKg += s.weightKg * s.reps
  }
  return { volumeKg, setCount, exerciseCount }
}

/**
 * Auto title from the two muscle groups with the most completed working sets,
 * e.g. "Груди + Трицепс". Ties keep the order the groups first appeared in.
 */
export function autoTitle<M extends string>(exercises: StatExercise<M>[], label: (m: M) => string): string {
  const counts = new Map<M, number>()
  for (const e of exercises) {
    const n = e.sets.filter(isSetDone).length
    if (n) counts.set(e.muscle, (counts.get(e.muscle) ?? 0) + n)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([m]) => label(m))
    .join(' + ')
}

/** Exercises in which at least one completed set beat the previous records. */
export function exercisesWithPr(
  exercises: StatExercise[],
  records: Map<string, ExerciseRecords>,
): Set<string> {
  const result = new Set<string>()
  for (const e of exercises) {
    const previous = records.get(e.exerciseId) ?? null
    if (e.sets.some((s) => s.completedAt !== null && detectPrs(s, previous).length > 0)) result.add(e.exerciseId)
  }
  return result
}
