import { describe, expect, it } from 'vitest'
import { formatKg, formatVolume, parseWeight } from './format'

describe('format', () => {
  it('formats weights per locale', () => {
    expect(formatKg(62.5, 'uk')).toBe('62,5')
    expect(formatKg(62.5, 'en')).toBe('62.5')
    expect(formatKg(1.25, 'en')).toBe('1.25')
  })

  it('groups volume thousands', () => {
    expect(formatVolume(8450.4, 'en')).toBe('8,450')
    expect(formatVolume(8450.4, 'uk').replace(/\s/g, ' ')).toBe('8 450')
  })

  it('parses comma and dot decimals', () => {
    expect(parseWeight('62,5')).toBe(62.5)
    expect(parseWeight(' 100 ')).toBe(100)
    expect(parseWeight('1.25')).toBe(1.25)
    expect(parseWeight('')).toBeNull()
    expect(parseWeight('-5')).toBeNull()
    expect(parseWeight('1.234')).toBeNull()
    expect(parseWeight('1500')).toBeNull()
  })
})
