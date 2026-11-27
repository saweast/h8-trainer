import { workingChains } from './dropSets'

export interface TemplateTargets {
  targetSets: number
  targetRepsMin: number | null
  targetRepsMax: number | null
  targetWeightKg: number | null
}

export interface PreviousSet {
  position: number
  weightKg: number
  reps: number
  isWarmup: boolean
  isDrop?: boolean
}

export interface PlannedSet {
  position: number
  weightKg: number
  reps: number
  isDrop?: boolean
}

/**
 * Planned sets for an exercise started from a template. Each set copies the same-numbered
 * working set from last time (or the last one, if last time had fewer sets); without history
 * it falls back to the template targets. Drops that continued a set last time come back on the
 * same set (not on the repeats), at last time's weights. Same rules as start_workout_from_template.
 */
export function prefillSets(targets: TemplateTargets, previous: PreviousSet[]): PlannedSet[] {
  const chains = workingChains([...previous].sort((a, b) => a.position - b.position))
  const count = Math.max(1, Math.floor(targets.targetSets))
  const fallbackReps = targets.targetRepsMax ?? targets.targetRepsMin ?? 0

  const planned: PlannedSet[] = []
  for (let i = 0; i < count; i++) {
    const prev = (chains[i] ?? chains.at(-1))?.head
    planned.push({
      position: planned.length + 1,
      weightKg: prev?.weightKg ?? targets.targetWeightKg ?? 0,
      reps: prev?.reps ?? fallbackReps,
    })
    for (const d of chains[i]?.drops ?? []) {
      planned.push({ position: planned.length + 1, weightKg: d.weightKg, reps: d.reps, isDrop: true })
    }
  }
  return planned
}
