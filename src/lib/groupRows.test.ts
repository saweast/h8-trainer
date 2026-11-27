import { describe, expect, it } from 'vitest'
import { findRowExercise, groupRows, nextGroupPosition } from './groupRows'

const w = (...list: [number, string][]) => ({ exercises: list.map(([position, exerciseId]) => ({ position, exerciseId })) })

describe('groupRows', () => {
  it('lists each shared exercise once, in order', () => {
    expect(groupRows([w([0, 'bench'], [1, 'squat']), w([0, 'bench'], [1, 'squat'])])).toEqual([
      { position: 0, exerciseId: 'bench', superset: null },
      { position: 1, exerciseId: 'squat', superset: null },
    ])
  })

  it('keeps an exercise only some clients have, and removed gaps', () => {
    expect(groupRows([w([0, 'bench'], [2, 'row']), w([2, 'row'], [3, 'curl'])])).toEqual([
      { position: 0, exerciseId: 'bench', superset: null },
      { position: 2, exerciseId: 'row', superset: null },
      { position: 3, exerciseId: 'curl', superset: null },
    ])
  })

  it('carries the superset of each row', () => {
    const client = { exercises: [{ position: 0, exerciseId: 'bench', superset: 2 }, { position: 1, exerciseId: 'row', superset: 2 }] }
    expect(groupRows([client, client]).map((r) => r.superset)).toEqual([2, 2])
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
