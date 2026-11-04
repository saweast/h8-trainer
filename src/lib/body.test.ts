import { describe, expect, it } from 'vitest'
import { hasAnyValue, latestWithDelta, metricByKey, metricSeries, parseMetric, type BodyEntry } from './body'

const empty = { weightKg: null, bodyFatPct: null, chestCm: null, waistCm: null, hipsCm: null, armCm: null, thighCm: null }
const entry = (id: string, measuredAt: string, values: Partial<BodyEntry>): BodyEntry => ({
  id,
  measuredAt,
  notes: null,
  ...empty,
  ...values,
})

// newest first, as the app loads them
const entries = [
  entry('c', '2026-11-05', { weightKg: 78.4, waistCm: 82 }),
  entry('b', '2026-10-29', { waistCm: 83.5 }),
  entry('a', '2026-10-22', { weightKg: 79.6, waistCm: 84 }),
]

describe('parseMetric', () => {
  it('accepts comma or dot decimals within range', () => {
    expect(parseMetric('78,4', metricByKey.weightKg)).toBe(78.4)
    expect(parseMetric(' 82.5 ', metricByKey.waistCm)).toBe(82.5)
    expect(parseMetric('', metricByKey.waistCm)).toBeNull()
  })

  it('rejects out-of-range values and extra decimals', () => {
    expect(parseMetric('5', metricByKey.weightKg)).toBe('invalid')
    expect(parseMetric('82.55', metricByKey.waistCm)).toBe('invalid')
    expect(parseMetric('78.45', metricByKey.weightKg)).toBe(78.45)
    expect(parseMetric('abc', metricByKey.chestCm)).toBe('invalid')
    expect(parseMetric('71', metricByKey.bodyFatPct)).toBe('invalid')
  })
})

describe('latestWithDelta', () => {
  it('compares with the previous entry that has the metric', () => {
    expect(latestWithDelta(entries, 'weightKg')).toEqual({ value: 78.4, measuredAt: '2026-11-05', delta: -1.2 })
    expect(latestWithDelta(entries, 'waistCm')).toEqual({ value: 82, measuredAt: '2026-11-05', delta: -1.5 })
  })

  it('handles single and missing values', () => {
    expect(latestWithDelta([entries[2]], 'weightKg')?.delta).toBeNull()
    expect(latestWithDelta(entries, 'armCm')).toBeNull()
  })
})

describe('metricSeries', () => {
  it('returns oldest-first points that have the metric', () => {
    expect(metricSeries(entries, 'weightKg')).toEqual([
      { measuredAt: '2026-10-22', value: 79.6 },
      { measuredAt: '2026-11-05', value: 78.4 },
    ])
  })
})

describe('hasAnyValue', () => {
  it('needs at least one measurement', () => {
    expect(hasAnyValue(empty)).toBe(false)
    expect(hasAnyValue({ ...empty, armCm: 36 })).toBe(true)
  })
})
