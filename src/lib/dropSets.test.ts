import { describe, expect, it } from 'vitest'
import { chainEnd, dropsAfter, groupChains, suggestDropWeight, workingChains } from './dropSets'

const set = (kg: number, flags: { warm?: boolean; drop?: boolean } = {}) => ({
  kg,
  isWarmup: flags.warm ?? false,
  isDrop: flags.drop ?? false,
})

describe('workingChains', () => {
  it('hangs drops on the working set they continue and leaves warm-ups out', () => {
    const sets = [set(40, { warm: true }), set(80), set(60, { drop: true }), set(40, { drop: true }), set(80)]
    expect(workingChains(sets).map((c) => [c.head.kg, c.drops.map((d) => d.kg)])).toEqual([
      [80, [60, 40]],
      [80, []],
    ])
  })

  it('reads a drop with nothing before it as a set of its own', () => {
    expect(workingChains([set(60, { drop: true }), set(50, { drop: true })]).map((c) => c.head.kg)).toEqual([60])
  })
})

describe('chainEnd / dropsAfter', () => {
  const sets = [set(80), set(60, { drop: true }), set(40, { drop: true }), set(80), set(20, { warm: true })]

  it('finds where a new drop goes', () => {
    expect(chainEnd(sets, 0)).toBe(2)
    expect(chainEnd(sets, 1)).toBe(2)
    expect(chainEnd(sets, 3)).toBe(3)
  })

  it("lists a chain's drops from its first set only", () => {
    expect(dropsAfter(sets, 0).map((s) => s.kg)).toEqual([60, 40])
    expect(dropsAfter(sets, 1)).toEqual([])
    expect(dropsAfter(sets, 3)).toEqual([])
    expect(dropsAfter(sets, 4)).toEqual([])
  })
})

describe('suggestDropWeight', () => {
  it('takes 20% off on the machine step', () => {
    expect(suggestDropWeight(80, 2.5)).toBe(65) // 64 → 65
    expect(suggestDropWeight(100, 2.5)).toBe(80)
    expect(suggestDropWeight(60, 5)).toBe(50) // 48 → 50
    expect(suggestDropWeight(22.5, 1.25)).toBe(17.5) // 18 → 17.5
  })

  it('always goes at least one step lighter, never below zero', () => {
    expect(suggestDropWeight(5, 2.5)).toBe(2.5)
    expect(suggestDropWeight(2.5, 2.5)).toBe(0)
    expect(suggestDropWeight(0, 2.5)).toBe(0)
  })

  it("repeats last time's drop while it is lighter than the set before", () => {
    expect(suggestDropWeight(80, 2.5, 55)).toBe(55)
    expect(suggestDropWeight(60, 2.5, 70)).toBe(47.5) // last time started heavier: 48 → 47.5
  })
})

describe('groupChains', () => {
  it('keeps the order, warm-ups alone, drops on their set', () => {
    const sets = [set(40, { warm: true }), set(30, { drop: true }), set(80), set(60, { drop: true }), set(80)]
    expect(groupChains(sets).map((g) => [g.head.kg, g.drops.map((d) => d.kg)])).toEqual([
      [40, []],
      [30, []], // nothing to continue: a warm-up has no drops
      [80, [60]],
      [80, []],
    ])
  })
})
