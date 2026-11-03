import { describe, expect, it } from 'vitest'
import { autoTitle, exercisesWithPr, workoutTotals, type StatExercise } from './workoutStats'

const done = '2026-11-04T10:00:00Z'
const exercises: StatExercise[] = [
  {
    exerciseId: 'bench',
    muscle: 'chest',
    sets: [
      { weightKg: 40, reps: 12, isWarmup: true, completedAt: done },
      { weightKg: 80, reps: 8, isWarmup: false, completedAt: done },
      { weightKg: 85, reps: 6, isWarmup: false, completedAt: done },
      { weightKg: 85, reps: 6, isWarmup: false, completedAt: null },
    ],
  },
  {
    exerciseId: 'pushdown',
    muscle: 'triceps',
    sets: [{ weightKg: 30, reps: 12, isWarmup: false, completedAt: done }],
  },
  { exerciseId: 'fly', muscle: 'chest', sets: [{ weightKg: 14, reps: 12, isWarmup: false, completedAt: done }] },
  { exerciseId: 'curl', muscle: 'biceps', sets: [{ weightKg: 12, reps: 10, isWarmup: false, completedAt: null }] },
]

describe('workoutTotals', () => {
  it('counts only completed working sets', () => {
    expect(workoutTotals(exercises)).toEqual({ volumeKg: 640 + 510 + 360 + 168, setCount: 4, exerciseCount: 3 })
  })
})

describe('autoTitle', () => {
  it('names the two busiest muscle groups', () => {
    const label = (m: string) => ({ chest: 'Груди', triceps: 'Трицепс', biceps: 'Біцепс' })[m] ?? m
    expect(autoTitle(exercises, label)).toBe('Груди + Трицепс')
    expect(autoTitle([], label)).toBe('')
  })
})

describe('exercisesWithPr', () => {
  it('finds exercises that beat previous records', () => {
    const records = new Map([
      ['bench', { bestWeightKg: 82.5, bestE1rmKg: 105, bestSetVolumeKg: 700 }],
      ['pushdown', { bestWeightKg: 35, bestE1rmKg: 45, bestSetVolumeKg: 420 }],
    ])
    expect([...exercisesWithPr(exercises, records)]).toEqual(['bench'])
  })
})
