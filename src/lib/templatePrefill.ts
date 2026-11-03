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
}

export interface PlannedSet {
  position: number
  weightKg: number
  reps: number
}

/**
 * Planned sets for an exercise started from a template. Each set copies the same-numbered
 * working set from last time (or the last one, if last time had fewer sets); without history
 * it falls back to the template targets.
 */
export function prefillSets(targets: TemplateTargets, previous: PreviousSet[]): PlannedSet[] {
  const working = previous.filter((s) => !s.isWarmup).sort((a, b) => a.position - b.position)
  const count = Math.max(1, Math.floor(targets.targetSets))
  const fallbackReps = targets.targetRepsMax ?? targets.targetRepsMin ?? 0

  return Array.from({ length: count }, (_, i) => {
    const prev = working[i] ?? working.at(-1)
    return {
      position: i + 1,
      weightKg: prev?.weightKg ?? targets.targetWeightKg ?? 0,
      reps: prev?.reps ?? fallbackReps,
    }
  })
}
