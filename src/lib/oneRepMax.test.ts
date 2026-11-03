import { describe, expect, it } from 'vitest'
import { E1RM_MAX_REPS, estimateOneRepMax } from './oneRepMax'

describe('estimateOneRepMax', () => {
  it('returns the weight itself for a single rep', () => {
    expect(estimateOneRepMax(100, 1)).toBe(100)
  })

  it('applies the Epley formula for 2..12 reps', () => {
    expect(estimateOneRepMax(100, 10)).toBe(133.3)
    expect(estimateOneRepMax(60, 8)).toBe(76)
    expect(estimateOneRepMax(80, E1RM_MAX_REPS)).toBe(112)
  })

  it('refuses to estimate high-rep sets', () => {
    expect(estimateOneRepMax(40, 13)).toBeNull()
  })

  it('rejects invalid input', () => {
    expect(estimateOneRepMax(0, 5)).toBeNull()
    expect(estimateOneRepMax(50, 0)).toBeNull()
    expect(estimateOneRepMax(50, 2.5)).toBeNull()
    expect(estimateOneRepMax(Number.NaN, 5)).toBeNull()
  })
})
