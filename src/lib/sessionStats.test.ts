import { describe, expect, it } from 'vitest'
import { sessionStats } from './sessionStats'

const done = '2026-11-04T10:00:00Z'

describe('sessionStats', () => {
  it('summarises completed working sets', () => {
    const stats = sessionStats([
      { weightKg: 40, reps: 12, isWarmup: true, completedAt: done },
      { weightKg: 100, reps: 10, isWarmup: false, completedAt: done },
      { weightKg: 110, reps: 6, isWarmup: false, completedAt: done },
      { weightKg: 110, reps: 8, isWarmup: false, completedAt: done },
      { weightKg: 150, reps: 5, isWarmup: false, completedAt: null },
    ])
    expect(stats).toEqual({
      bestWeightKg: 110,
      bestE1rmKg: 139.3, // 110 × (1 + 8/30)
      volumeKg: 1000 + 660 + 880,
      topSet: { weightKg: 110, reps: 8 },
      workingSets: 3,
    })
  })

  it('adds the volume of drops but takes bests and the set count from the sets they continue', () => {
    const stats = sessionStats([
      { weightKg: 80, reps: 6, isWarmup: false, completedAt: done },
      { weightKg: 60, reps: 12, isWarmup: false, isDrop: true, completedAt: done },
    ])
    expect(stats).toEqual({
      bestWeightKg: 80,
      bestE1rmKg: 96, // 80 × 1.2; the drop's 60 × 1.4 = 84 doesn't count either way
      volumeKg: 480 + 720,
      topSet: { weightKg: 80, reps: 6 },
      workingSets: 1,
    })
  })

  it('handles bodyweight and empty sessions', () => {
    expect(sessionStats([{ weightKg: 0, reps: 15, isWarmup: false, completedAt: done }])).toEqual({
      bestWeightKg: null,
      bestE1rmKg: null,
      volumeKg: 0,
      topSet: { weightKg: 0, reps: 15 },
      workingSets: 1,
    })
    expect(sessionStats([]).workingSets).toBe(0)
  })
})
