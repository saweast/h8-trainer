import type { SpecSet } from './setSpec'
import { normalizeSupersets } from './supersets'
import { isSetDone, type StatSet } from './workoutStats'

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
  /** Consecutive items with the same number are a superset (src/lib/supersets.ts). */
  superset?: number | null
}

interface WorkoutExerciseLike {
  exerciseId: string
  superset?: number | null
  sets: StatSet[]
}

/**
 * Template items that reproduce a finished workout: one item per exercise that had completed
 * working sets, with that many sets and the rep range actually done (a drop chain is one set),
 * and the supersets that are still together. Weights are left empty on purpose — starting the
 * template fills them in from last time (drops included).
 */
export function templateItemsFromWorkout(exercises: WorkoutExerciseLike[]): TemplateItemInput[] {
  const items = exercises.flatMap((e) => {
    const done = e.sets.filter(isSetDone)
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
  const groups = normalizeSupersets(items.map((i) => i.superset))
  return items.map(({ superset: _superset, ...item }, i) => (groups[i] ? { ...item, superset: groups[i] } : item))
}

/** True when the workout followed the template: same exercises, order, set counts and supersets. */
export function workoutMatchesTemplate(
  template: { exerciseId: string; targetSets: number; superset?: number | null }[],
  exercises: WorkoutExerciseLike[],
): boolean {
  const done = templateItemsFromWorkout(exercises)
  const planned = normalizeSupersets(template.map((t) => t.superset))
  return (
    done.length === template.length &&
    done.every(
      (d, i) => d.exerciseId === template[i].exerciseId && d.targetSets === template[i].targetSets && (d.superset ?? null) === planned[i],
    )
  )
}

/** "4 × 8–10" / "3 × 12" / "3 × —" */
export function formatTargets(item: Pick<TemplateItemInput, 'targetSets' | 'targetRepsMin' | 'targetRepsMax'>): string {
  const { targetRepsMin: min, targetRepsMax: max } = item
  const reps = min !== null && max !== null && min !== max ? `${min}–${max}` : String(max ?? min ?? '—')
  return `${item.targetSets} × ${reps}`
}
