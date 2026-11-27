import type { SpecSet } from './setSpec'
import { toBlocks } from './superset'
import { isWorkingDone, type StatSet } from './workoutStats'

export interface TemplateItemInput {
  exerciseId: string
  targetSets: number
  targetRepsMin: number | null
  targetRepsMax: number | null
  targetWeightKg: number | null
  restS: number | null
  notes: string | null
  /** Exact planned sets (warm-ups included); overrides the uniform targets when present. */
  sets?: SpecSet[] | null
  /** Neighbours with the same number form a superset (src/lib/superset.ts). */
  superset?: number | null
}

interface WorkoutExerciseLike {
  exerciseId: string
  superset?: number | null
  sets: StatSet[]
}

/**
 * Template items that reproduce a finished workout: one item per exercise that had completed
 * working sets, with that many sets and the rep range actually done. Weights are left empty on
 * purpose — starting the template fills them in from last time.
 */
export function templateItemsFromWorkout(exercises: WorkoutExerciseLike[]): TemplateItemInput[] {
  return exercises.flatMap((e) => {
    const done = e.sets.filter(isWorkingDone)
    if (!done.length) return []
    const reps = done.map((s) => s.reps)
    const min = Math.min(...reps)
    const max = Math.max(...reps)
    return [
      {
        exerciseId: e.exerciseId,
        targetSets: Math.min(done.length, 20),
        targetRepsMin: min === max ? null : min,
        targetRepsMax: max,
        targetWeightKg: null,
        restS: null,
        notes: null,
        superset: e.superset ?? null,
      },
    ]
  })
}

/** Which superset (by order) each item is in, -1 for plain ones: compares grouping, not numbers. */
function grouping(list: { superset?: number | null }[]): number[] {
  return toBlocks(list.map((i) => ({ superset: i.superset ?? null }))).flatMap((b, n) =>
    b.kind === 'single' ? [-1] : b.items.map(() => n),
  )
}

/** True when the workout followed the template: same exercises, order, set counts and supersets. */
export function workoutMatchesTemplate(
  template: { exerciseId: string; targetSets: number; superset?: number | null }[],
  exercises: WorkoutExerciseLike[],
): boolean {
  const done = templateItemsFromWorkout(exercises)
  return (
    done.length === template.length &&
    done.every((d, i) => d.exerciseId === template[i].exerciseId && d.targetSets === template[i].targetSets) &&
    grouping(done).join() === grouping(template).join()
  )
}

/** "4 × 8–10" / "3 × 12" / "3 × —" */
export function formatTargets(item: Pick<TemplateItemInput, 'targetSets' | 'targetRepsMin' | 'targetRepsMax'>): string {
  const { targetRepsMin: min, targetRepsMax: max } = item
  const reps = min !== null && max !== null && min !== max ? `${min}–${max}` : String(max ?? min ?? '—')
  return `${item.targetSets} × ${reps}`
}
