import { describe, expect, it } from 'vitest'
import { detectPrs, type ExerciseRecords } from './records'

const previous: ExerciseRecords = { bestWeightKg: 100, bestE1rmKg: 120, bestSetVolumeKg: 800 }

describe('detectPrs', () => {
  it('flags every record a set beats', () => {
    expect(detectPrs({ weightKg: 105, reps: 8, isWarmup: false }, previous)).toEqual(['weight', 'e1rm', 'volume'])
  })

  it('flags an e1RM record without a heavier weight', () => {
    // 95 × 8 → e1RM 120.3 > 120, volume 760 < 800
    expect(detectPrs({ weightKg: 95, reps: 8, isWarmup: false }, previous)).toEqual(['e1rm'])
  })

  it('needs to strictly beat a record', () => {
    expect(detectPrs({ weightKg: 100, reps: 6, isWarmup: false }, previous)).toEqual([])
  })

  it('ignores warm-ups, empty sets and first-ever sessions', () => {
    expect(detectPrs({ weightKg: 200, reps: 5, isWarmup: true }, previous)).toEqual([])
    expect(detectPrs({ weightKg: 200, reps: 0, isWarmup: false }, previous)).toEqual([])
    expect(detectPrs({ weightKg: 200, reps: 5, isWarmup: false }, null)).toEqual([])
    expect(
      detectPrs({ weightKg: 200, reps: 5, isWarmup: false }, { bestWeightKg: null, bestE1rmKg: null, bestSetVolumeKg: null }),
    ).toEqual([])
  })
})
