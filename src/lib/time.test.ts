import { describe, expect, it } from 'vitest'
import { formatClock, minutesBetween, secondsUntil } from './time'

describe('time helpers', () => {
  it('formats clocks', () => {
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(84)).toBe('1:24')
    expect(formatClock(3725)).toBe('1:02:05')
    expect(formatClock(-5)).toBe('0:00')
  })

  it('counts down in whole seconds', () => {
    expect(secondsUntil(10_000, 8_200)).toBe(2)
    expect(secondsUntil(10_000, 12_000)).toBe(0)
  })

  it('rounds workout duration to minutes', () => {
    expect(minutesBetween('2026-11-04T10:00:00Z', '2026-11-04T10:58:20Z')).toBe(58)
    expect(minutesBetween('2026-11-04T10:00:00Z', '2026-11-04T10:00:10Z')).toBe(1)
  })
})
