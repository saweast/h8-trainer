import { describe, expect, it } from 'vitest'
import { findRowExercise, groupRows, nextGroupPosition } from './groupRows'

const w = (...list: [number, string][]) => ({ exercises: list.map(([position, exerciseId]) => ({ position, exerciseId })) })

describe('groupRows', () => {
  it('lists each shared exercise once, in order', () => {
    expect(groupRows([w([0, 'bench'], [1, 'squat']), w([0, 'bench'], [1, 'squat'])])).toEqual([
      { position: 0, exerciseId: 'bench' },
      { position: 1, exerciseId: 'squat' },
    ])
  })

  it('keeps an exercise only some clients have, and removed gaps', () => {
    expect(groupRows([w([0, 'bench'], [2, 'row']), w([2, 'row'], [3, 'curl'])])).toEqual([
      { position: 0, exerciseId: 'bench' },
      { position: 2, exerciseId: 'row' },
      { position: 3, exerciseId: 'curl' },
    ])
  })

  it('places a new exercise after the last one anyone has', () => {
    expect(nextGroupPosition([])).toBe(0)
    expect(nextGroupPosition([w([0, 'bench']), w([0, 'bench'], [4, 'curl'])])).toBe(5)
  })

  it("finds a client's exercise for a row", () => {
    const { exercises } = w([0, 'bench'], [1, 'squat'])
    expect(findRowExercise(exercises, { position: 1, exerciseId: 'squat' })).toEqual({ position: 1, exerciseId: 'squat' })
    expect(findRowExercise(exercises, { position: 1, exerciseId: 'bench' })).toBeUndefined()
  })
})
