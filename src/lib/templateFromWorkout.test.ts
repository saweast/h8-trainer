import { describe, expect, it } from 'vitest'
import { formatTargets, templateItemsFromWorkout, workoutMatchesTemplate } from './templateFromWorkout'

const done = '2026-11-05T10:00:00Z'
const workout = [
  {
    exerciseId: 'bench',
    sets: [
      { weightKg: 40, reps: 12, isWarmup: true, completedAt: done },
      { weightKg: 80, reps: 10, isWarmup: false, completedAt: done },
      { weightKg: 85, reps: 8, isWarmup: false, completedAt: done },
      { weightKg: 85, reps: 8, isWarmup: false, completedAt: null },
    ],
  },
  { exerciseId: 'fly', sets: [{ weightKg: 14, reps: 12, isWarmup: false, completedAt: done }] },
  { exerciseId: 'skipped', sets: [{ weightKg: 20, reps: 10, isWarmup: false, completedAt: null }] },
]

describe('templateItemsFromWorkout', () => {
  it('keeps exercises with completed working sets and their rep range', () => {
    expect(templateItemsFromWorkout(workout)).toEqual([
      { exerciseId: 'bench', targetSets: 2, targetRepsMin: 8, targetRepsMax: 10, targetWeightKg: null, restS: null, notes: null },
      { exerciseId: 'fly', targetSets: 1, targetRepsMin: null, targetRepsMax: 12, targetWeightKg: null, restS: null, notes: null },
    ])
  })
})

describe('workoutMatchesTemplate', () => {
  it('compares order and set counts', () => {
    expect(workoutMatchesTemplate([{ exerciseId: 'bench', targetSets: 2 }, { exerciseId: 'fly', targetSets: 1 }], workout)).toBe(true)
    expect(workoutMatchesTemplate([{ exerciseId: 'bench', targetSets: 3 }, { exerciseId: 'fly', targetSets: 1 }], workout)).toBe(false)
    expect(workoutMatchesTemplate([{ exerciseId: 'fly', targetSets: 1 }, { exerciseId: 'bench', targetSets: 2 }], workout)).toBe(false)
  })
})

describe('formatTargets', () => {
  it('formats sets and rep ranges', () => {
    expect(formatTargets({ targetSets: 4, targetRepsMin: 8, targetRepsMax: 10 })).toBe('4 × 8–10')
    expect(formatTargets({ targetSets: 3, targetRepsMin: null, targetRepsMax: 12 })).toBe('3 × 12')
    expect(formatTargets({ targetSets: 3, targetRepsMin: 5, targetRepsMax: 5 })).toBe('3 × 5')
    expect(formatTargets({ targetSets: 3, targetRepsMin: null, targetRepsMax: null })).toBe('3 × —')
  })
})
