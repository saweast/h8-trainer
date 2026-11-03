import { describe, expect, it } from 'vitest'
import { prefillSets } from './templatePrefill'

const targets = { targetSets: 3, targetRepsMin: 8, targetRepsMax: 10, targetWeightKg: 60 }

describe('prefillSets', () => {
  it('copies last time by set number, ignoring warm-ups', () => {
    const previous = [
      { position: 1, weightKg: 30, reps: 12, isWarmup: true },
      { position: 2, weightKg: 62.5, reps: 10, isWarmup: false },
      { position: 3, weightKg: 65, reps: 8, isWarmup: false },
      { position: 4, weightKg: 65, reps: 7, isWarmup: false },
    ]
    expect(prefillSets(targets, previous)).toEqual([
      { position: 1, weightKg: 62.5, reps: 10 },
      { position: 2, weightKg: 65, reps: 8 },
      { position: 3, weightKg: 65, reps: 7 },
    ])
  })

  it('repeats the last set when last time had fewer sets', () => {
    const previous = [{ position: 1, weightKg: 70, reps: 6, isWarmup: false }]
    expect(prefillSets(targets, previous).map((s) => s.weightKg)).toEqual([70, 70, 70])
  })

  it('falls back to template targets without history', () => {
    expect(prefillSets(targets, [])).toEqual([
      { position: 1, weightKg: 60, reps: 10 },
      { position: 2, weightKg: 60, reps: 10 },
      { position: 3, weightKg: 60, reps: 10 },
    ])
    expect(prefillSets({ targetSets: 1, targetRepsMin: null, targetRepsMax: null, targetWeightKg: null }, [])).toEqual([
      { position: 1, weightKg: 0, reps: 0 },
    ])
  })
})
