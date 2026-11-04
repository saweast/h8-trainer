import { describe, expect, it } from 'vitest'
import { dayKey, monthGrid } from './calendar'

describe('monthGrid', () => {
  it('covers November 2026 in Monday-first weeks', () => {
    const weeks = monthGrid(new Date(2026, 10, 15))
    expect(weeks).toHaveLength(6) // 1 Nov 2026 is a Sunday
    expect(weeks[0][0].key).toBe('2026-10-26')
    expect(weeks[0][6]).toMatchObject({ key: '2026-11-01', inMonth: true })
    expect(weeks.at(-1)!.at(-1)!.key).toBe('2026-12-06')
    expect(weeks.flat().filter((d) => d.inMonth)).toHaveLength(30)
  })

  it('formats local day keys', () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05')
  })
})
