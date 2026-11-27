import { describe, expect, it } from 'vitest'
import { continuesRound, linkWithNext, normalizeSupersets, supersetPlaces, unlinkItem } from './supersets'

const labels = (groups: (number | null)[]) => supersetPlaces(groups).map((p) => p?.label ?? '-')

describe('supersetPlaces', () => {
  it('letters runs of two or more in order', () => {
    expect(labels([null, 3, 3, 3, null, 1, 1])).toEqual(['-', 'A1', 'A2', 'A3', '-', 'B1', 'B2'])
  })

  it('ignores a group used by one item or split by another', () => {
    expect(labels([1, null, 1, 2])).toEqual(['-', '-', '-', '-'])
    const [first, , last] = supersetPlaces([5, 5, 5])
    expect(first).toMatchObject({ first: true, last: false, size: 3 })
    expect(last).toMatchObject({ first: false, last: true, index: 2 })
  })
})

describe('linking', () => {
  it('starts a new superset, then grows it', () => {
    const one = linkWithNext([null, null, null, 1, 1], 0)
    expect(one).toEqual([2, 2, null, 1, 1])
    expect(linkWithNext(one, 1)).toEqual([2, 2, 2, 1, 1])
  })

  it('joins the next superset whole', () => {
    expect(linkWithNext([null, 1, 1], 0)).toEqual([1, 1, 1])
    expect(linkWithNext([2, 2, 1, 1], 1)).toEqual([2, 2, 2, 2])
  })

  it('does nothing past the end', () => {
    expect(linkWithNext([null, null], 1)).toEqual([null, null])
  })

  it('takes an item out, and a lone leftover dissolves', () => {
    expect(unlinkItem([1, 1, 1], 2)).toEqual([1, 1, null])
    expect(unlinkItem([1, 1], 0)).toEqual([null, null])
    expect(unlinkItem([1, 1, 1], 1)).toEqual([null, null, null])
  })

  it('renumbers for saving', () => {
    expect(normalizeSupersets([7, 7, null, 7, 3, 3, 9])).toEqual([1, 1, null, null, 2, 2, null])
  })
})

describe('continuesRound', () => {
  const ex = (superset: number | null, pending: number, warmupsPending = 0) => ({
    superset,
    sets: [
      ...Array.from({ length: warmupsPending }, () => ({ completedAt: null, isWarmup: true })),
      { completedAt: '2026-11-27T10:00:00Z', isWarmup: false },
      ...Array.from({ length: pending }, () => ({ completedAt: null, isWarmup: false })),
    ],
  })

  it('goes on to the next exercise while it still has sets to do', () => {
    const workout = [ex(1, 2), ex(1, 2), ex(null, 3)]
    expect(continuesRound(workout, 0)).toBe(true)
    expect(continuesRound(workout, 1)).toBe(false) // the last of the round: rest
    expect(continuesRound(workout, 2)).toBe(false) // not in a superset
  })

  it('rests when the rest of the superset is done (pending warm-ups don’t count)', () => {
    expect(continuesRound([ex(1, 2), ex(1, 0, 1)], 0)).toBe(false)
    expect(continuesRound([ex(1, 1), ex(1, 0), ex(1, 1)], 0)).toBe(true)
  })
})
