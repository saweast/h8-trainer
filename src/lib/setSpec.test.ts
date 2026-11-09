import { describe, expect, it } from 'vitest'
import { formatSetSpec, fromSpecSets, parseSetSpec, specVolume, toSpecSets, type SpecSet } from './setSpec'

const short = (sets: SpecSet[]) => sets.map((s) => `${s.weightKg}x${s.reps}${s.isWarmup ? 'w' : ''}`)

describe('parseSetSpec', () => {
  it('reads warm-ups and a working block', () => {
    const { sets, warnings } = parseSetSpec('20x10, 50x5, 80x8x3')
    expect(warnings).toEqual([])
    expect(short(sets)).toEqual(['20x10w', '50x5w', '80x8', '80x8', '80x8'])
  })

  it('handles cells from the trainer sheet', () => {
    expect(short(parseSetSpec('20x10,50x5,80x3,85x6x3').sets)).toEqual([
      '20x10w', '50x5w', '80x3w', '85x6', '85x6', '85x6',
    ])
    expect(short(parseSetSpec('20x10,50x6,80x4,100x3x4').sets)).toEqual([
      '20x10w', '50x6w', '80x4w', '100x3', '100x3', '100x3', '100x3',
    ])
    expect(short(parseSetSpec('10x10, 30x10x3').sets)).toEqual(['10x10w', '30x10', '30x10', '30x10'])
    expect(short(parseSetSpec('20x10,50x5,60x8x4').sets)).toEqual(['20x10w', '50x5w', '60x8', '60x8', '60x8', '60x8'])
  })

  it('flags "weight x sets x reps" written the other way round', () => {
    const { sets, warnings } = parseSetSpec('7x12,10x3x12')
    expect(sets).toHaveLength(13)
    expect(warnings).toEqual([{ kind: 'swapped', token: '10x3x12', suggestion: '10x12x3' }])
  })

  it('reads bodyweight as reps x sets', () => {
    expect(short(parseSetSpec('12x4', { bodyweight: true }).sets)).toEqual(['0x12', '0x12', '0x12', '0x12'])
    const hyper = parseSetSpec('4x12', { bodyweight: true })
    expect(hyper.warnings).toEqual([{ kind: 'swapped', token: '4x12', suggestion: '12x4' }])
  })

  it('keeps notes and treats a lone number as bodyweight reps', () => {
    const { sets, warnings } = parseSetSpec('10(с резиной),8x3', { bodyweight: true })
    expect(warnings).toEqual([])
    expect(sets).toEqual([
      { weightKg: 0, reps: 10, isWarmup: false, note: 'с резиной' },
      { weightKg: 0, reps: 8, isWarmup: false },
      { weightKg: 0, reps: 8, isWarmup: false },
      { weightKg: 0, reps: 8, isWarmup: false },
    ])
  })

  it('accepts decimal commas, other separators and spaces', () => {
    expect(short(parseSetSpec('82,5x8').sets)).toEqual(['82.5x8'])
    expect(short(parseSetSpec('20х10; 82,5 × 8 * 2').sets)).toEqual(['20x10w', '82.5x8', '82.5x8'])
    expect(short(parseSetSpec('20x10, 82.5x8x2').sets)).toEqual(['20x10w', '82.5x8', '82.5x8'])
  })

  it('treats lighter singles before the heaviest as warm-ups when there is no block', () => {
    expect(short(parseSetSpec('20x10, 50x5, 80x8').sets)).toEqual(['20x10w', '50x5w', '80x8'])
    expect(short(parseSetSpec('80x8').sets)).toEqual(['80x8'])
  })

  it('lets markers override the guess', () => {
    expect(short(parseSetSpec('20x10р, 50x5x2р, 80x8x3').sets)).toEqual(['20x10w', '50x5w', '50x5w', '80x8', '80x8', '80x8'])
    expect(short(parseSetSpec('20x10, 50x5w, 80x8x3').sets)).toEqual(['20x10', '50x5w', '80x8', '80x8', '80x8'])
  })

  it('reports tokens it cannot read', () => {
    const { sets, warnings } = parseSetSpec('20x10, abc, 60, 80x8x3')
    expect(short(sets)).toEqual(['20x10w', '80x8', '80x8', '80x8'])
    expect(warnings).toEqual([
      { kind: 'invalid', token: 'abc' },
      { kind: 'invalid', token: '60' },
    ])
    expect(parseSetSpec('  ').sets).toEqual([])
    expect(parseSetSpec('20x0').warnings).toEqual([{ kind: 'invalid', token: '20x0' }])
  })

  it('caps the number of sets', () => {
    const { sets, warnings } = parseSetSpec('20x20x20, 30x20x20')
    expect(sets).toHaveLength(30)
    expect(warnings).toEqual([{ kind: 'tooMany' }])
  })
})

describe('formatSetSpec', () => {
  it('groups identical sets', () => {
    expect(formatSetSpec(parseSetSpec('20x10,50x5,80x8x3').sets)).toBe('20x10, 50x5, 80x8x3')
    expect(formatSetSpec(parseSetSpec('82,5x8x2').sets, { locale: 'uk' })).toBe('82,5x8x2')
    expect(formatSetSpec(parseSetSpec('82,5x8x2').sets, { locale: 'en' })).toBe('82.5x8x2')
  })

  it('adds markers only when the guess would be wrong', () => {
    const sets = parseSetSpec('20x10, 50x5x2, 80x8x3').sets
    expect(formatSetSpec(sets)).toBe('20x10, 50x5x2, 80x8x3')
    const toggled = sets.map((s, i) => (i < 3 ? { ...s, isWarmup: true } : s))
    expect(formatSetSpec(toggled)).toBe('20x10р, 50x5x2р, 80x8x3')
    expect(formatSetSpec(toggled, { locale: 'en' })).toBe('20x10w, 50x5x2w, 80x8x3')
  })

  it('writes bodyweight specs', () => {
    expect(formatSetSpec(parseSetSpec('10(с резиной),8x3', { bodyweight: true }).sets, { bodyweight: true })).toBe(
      '10(с резиной), 8x3',
    )
    expect(formatSetSpec([{ weightKg: 10, reps: 8, isWarmup: false }], { bodyweight: true })).toBe('10x8x1')
  })

  it('round-trips', () => {
    const cases: [string, boolean][] = [
      ['20x10, 50x5, 80x3, 85x6x3', false],
      ['20x10р, 50x5x2р, 80x8x3', false],
      ['20x10, 50x5w, 80x8x3', false],
      ['7x12, 10x12x3', false],
      ['62,5x8, 60x10x2', false],
      ['10(с резиной), 8x3', true],
      ['12x4', true],
      ['10x8x3, 12', true],
    ]
    for (const [text, bodyweight] of cases) {
      const once = parseSetSpec(text, { bodyweight }).sets
      const twice = parseSetSpec(formatSetSpec(once, { bodyweight, locale: 'uk' }), { bodyweight }).sets
      expect(twice).toEqual(once)
    }
  })
})

describe('storage helpers', () => {
  it('converts to and from the jsonb shape', () => {
    const sets = parseSetSpec('20x10, 80x8x2(пауза)').sets
    const stored = fromSpecSets(sets)
    expect(stored).toEqual([
      { w: 20, r: 10, warmup: true },
      { w: 80, r: 8, note: 'пауза' },
      { w: 80, r: 8, note: 'пауза' },
    ])
    expect(toSpecSets(JSON.parse(JSON.stringify(stored)))).toEqual(sets)
    expect(toSpecSets(null)).toBeNull()
    expect(toSpecSets([{ w: 'x', r: 1 }])).toBeNull()
  })

  it('counts working volume only', () => {
    expect(specVolume(parseSetSpec('20x10, 80x8x3').sets)).toBe(1920)
  })
})
