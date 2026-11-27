import { describe, expect, it } from 'vitest'
import {
  afterSetDone,
  joinNeighbour,
  leaveSuperset,
  loneSupersets,
  nextSupersetNumber,
  nextUp,
  regroupAfterMove,
  roundCount,
  roundsDone,
  supersetLetter,
  supersetPlaces,
  toBlocks,
  type RoundExercise,
} from './superset'

const items = (...supersets: (number | null)[]) => supersets.map((superset, i) => ({ id: `e${i}`, superset }))
const shape = (blocks: ReturnType<typeof toBlocks<{ id: string; superset: number | null }>>) =>
  blocks.map((b) => (b.kind === 'single' ? b.item.id : `${b.letter}:${b.items.map((i) => i.id).join('+')}`))
const ids = <T extends { id: string }, V>(changes: Map<T, V>) => Object.fromEntries([...changes].map(([k, v]) => [k.id, v]))

describe('toBlocks', () => {
  it('groups neighbours with the same number and letters the supersets in order', () => {
    expect(shape(toBlocks(items(null, 1, 1, null, 2, 2, 2)))).toEqual(['e0', 'A:e1+e2', 'e3', 'B:e4+e5+e6'])
  })

  it('treats a lone or non-adjacent number as an ordinary exercise', () => {
    expect(shape(toBlocks(items(1, null, 1)))).toEqual(['e0', 'e1', 'e2'])
    expect(shape(toBlocks(items(1, 1, 2, 2)))).toEqual(['A:e0+e1', 'B:e2+e3'])
    expect(loneSupersets(items(1, null, 1, 3, 3)).map((i) => i.id)).toEqual(['e0', 'e2'])
  })

  it('letters past Z', () => {
    expect([0, 1, 25, 26, 27].map(supersetLetter)).toEqual(['A', 'B', 'Z', 'AA', 'AB'])
  })

  it('picks a number nobody uses', () => {
    expect(nextSupersetNumber([])).toBe(1)
    expect(nextSupersetNumber(items(null, 4, 2))).toBe(5)
  })
})

describe('joining and leaving', () => {
  it('starts a new superset from two plain exercises', () => {
    const list = items(null, null, 3, 3)
    expect(ids(joinNeighbour(list, 0, 'down'))).toEqual({ e0: 4, e1: 4 })
  })

  it('joins an existing superset above or below', () => {
    expect(ids(joinNeighbour(items(2, 2, null), 2, 'up'))).toEqual({ e2: 2 })
    expect(ids(joinNeighbour(items(null, 5, 5), 0, 'down'))).toEqual({ e0: 5 })
    // two supersets merge into one
    expect(ids(joinNeighbour(items(1, 1, 2, 2), 1, 'down'))).toEqual({ e0: 2, e1: 2 })
  })

  it('does nothing at the edges or inside the same superset', () => {
    expect(joinNeighbour(items(null, null), 0, 'up').size).toBe(0)
    expect(joinNeighbour(items(null, null), 1, 'down').size).toBe(0)
    expect(joinNeighbour(items(1, 1), 0, 'down').size).toBe(0)
  })

  it('leaves from the edge and keeps the rest together', () => {
    expect(ids(leaveSuperset(items(1, 1, 1), 2))).toEqual({ e2: null })
    // two left → the other one becomes plain as well
    expect(ids(leaveSuperset(items(1, 1), 0))).toEqual({ e0: null, e1: null })
  })

  it('splits when a middle exercise leaves', () => {
    expect(ids(leaveSuperset(items(1, 1, 1, 1, 1), 1))).toEqual({ e1: null, e0: null, e2: 2, e3: 2, e4: 2 })
    expect(ids(leaveSuperset(items(1, 1, 1), 1))).toEqual({ e0: null, e1: null, e2: null })
  })

  it('ignores an exercise that is not in a superset', () => {
    expect(leaveSuperset(items(null, 1, 1), 0).size).toBe(0)
  })
})

describe('editors', () => {
  it("places each superset member", () => {
    const list = items(null, 1, 1, 1)
    const places = supersetPlaces(list)
    expect(places.has(list[0])).toBe(false)
    expect(places.get(list[2])).toEqual({ letter: 'A', index: 1, size: 3 })
  })

  it('regroups after a drag', () => {
    const numbers = (list: { superset: number | null }[]) => list.map((i) => i.superset)
    const move = (list: { id: string; superset: number | null }[], index: number) => numbers(regroupAfterMove(list, list[index]))
    // a plain exercise dropped between two members joins
    expect(move(items(1, null, 1), 1)).toEqual([1, 1, 1])
    expect(move(items(1, 1, null, 1), 2)).toEqual([1, 1, 1, 1])
    // a member dragged out → plain, and a partner left alone too
    expect(move(items(1, 1, null, 1), 3)).toEqual([1, 1, null, null])
    expect(move(items(1, null, 1), 2)).toEqual([null, null, null])
    // a member dropped into another superset joins that one
    expect(move(items(2, 1, 2, 1, 1), 1)).toEqual([2, 2, 2, 1, 1])
    // reordering inside a superset, or a plain exercise at its edge, changes nothing
    const same = items(null, 2, 2)
    expect(regroupAfterMove(same, same[2])).toBe(same)
    expect(regroupAfterMove(same, same[0])).toBe(same)
  })
})

describe('rounds', () => {
  const set = (id: string, done: boolean, isWarmup = false) => ({ id, isWarmup, completedAt: done ? '2026-11-27T10:00:00Z' : null })
  const superset = (a: boolean[], b: boolean[], warmupA = false): RoundExercise[] => [
    { id: 'A1', sets: [...(warmupA ? [set('aw', true, true)] : []), ...a.map((d, i) => set(`a${i + 1}`, d))] },
    { id: 'A2', sets: b.map((d, i) => set(`b${i + 1}`, d)) },
  ]

  it('goes straight to the next exercise until the round is closed, then rests', () => {
    expect(afterSetDone(superset([true, false, false], [false, false, false]), 'a1')).toEqual({
      rest: false,
      next: { exerciseId: 'A2', setId: 'b1', round: 1 },
    })
    expect(afterSetDone(superset([true, false, false], [true, false, false]), 'b1')).toEqual({ rest: true, next: null })
  })

  it('works in any order', () => {
    expect(afterSetDone(superset([false, false], [true, false]), 'b1')).toEqual({
      rest: false,
      next: { exerciseId: 'A1', setId: 'a1', round: 1 },
    })
  })

  it('rests after an extra set only one exercise has', () => {
    expect(afterSetDone(superset([true, true, true, true], [true, true, true]), 'a4')).toEqual({ rest: true, next: null })
  })

  it('keeps warm-ups out of rounds', () => {
    const members = superset([false, false], [false, false], true)
    expect(afterSetDone(members, 'aw')).toEqual({ rest: true, next: null })
    expect(nextUp(members)).toEqual({ exerciseId: 'A1', setId: 'a1', round: 1 })
    expect(roundCount(members)).toBe(2)
  })

  it('keeps drops in the round of the set they continue', () => {
    const drop = (id: string, done: boolean) => ({ ...set(id, done), isDrop: true })
    // A1: 2 sets, the first with two drops; A2: 2 sets
    const members = (a1: boolean, d1: boolean, d2: boolean, b1: boolean): RoundExercise[] => [
      { id: 'A1', sets: [set('a1', a1), drop('a1d1', d1), drop('a1d2', d2), set('a2', false)] },
      { id: 'A2', sets: [set('b1', b1), set('b2', false)] },
    ]
    expect(roundCount(members(false, false, false, false))).toBe(2)
    // the last drop of A1's chain done: on to A2 round 1
    expect(afterSetDone(members(true, true, true, false), 'a1d2')).toEqual({
      rest: false,
      next: { exerciseId: 'A2', setId: 'b1', round: 1 },
    })
    // A2 closed the round before: the last drop ends it, rest
    expect(afterSetDone(members(true, true, true, true), 'a1d2')).toEqual({ rest: true, next: null })
    expect(nextUp(members(true, true, true, true))).toEqual({ exerciseId: 'A1', setId: 'a2', round: 2 })
    expect(roundsDone(members(true, true, true, true))).toBe(1)
  })

  it('points at a drop still to do before the next exercise, and keeps its round open', () => {
    const drop = (id: string, done: boolean) => ({ ...set(id, done), isDrop: true })
    const members: RoundExercise[] = [
      { id: 'A1', sets: [set('a1', true), drop('a1d1', false), set('a2', false)] },
      { id: 'A2', sets: [set('b1', true), set('b2', false)] },
    ]
    expect(nextUp(members)).toEqual({ exerciseId: 'A1', setId: 'a1d1', round: 1 })
    expect(roundsDone(members)).toBe(0)
    // A2 done while A1's drop is still open: not the end of the round yet
    expect(afterSetDone(members, 'b1')).toEqual({ rest: false, next: { exerciseId: 'A1', setId: 'a1d1', round: 1 } })
  })

  it('counts done rounds and finds the next set', () => {
    expect(roundsDone(superset([true, true, false], [true, false, false]))).toBe(1)
    expect(nextUp(superset([true, true, false], [true, false, false]))).toEqual({ exerciseId: 'A2', setId: 'b2', round: 2 })
    expect(roundsDone(superset([true, true], [true, true]))).toBe(2)
    expect(nextUp(superset([true], [true]))).toBeNull()
  })
})
