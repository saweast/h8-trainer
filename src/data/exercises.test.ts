import { describe, expect, it } from 'vitest'
import { EXERCISE_CATALOG, MUSCLE_GROUPS, EQUIPMENT, exerciseName, matchesQuery } from './exercises'

describe('exercise catalog', () => {
  it('uses known muscle groups and equipment with unique slugs', () => {
    const slugs = new Set<string>()
    for (const e of EXERCISE_CATALOG) {
      expect(MUSCLE_GROUPS).toContain(e.muscle)
      expect(EQUIPMENT).toContain(e.equipment)
      expect(slugs.has(e.slug)).toBe(false)
      slugs.add(e.slug)
      expect(e.uk.length).toBeGreaterThan(1)
      expect(e.en.length).toBeGreaterThan(1)
    }
  })

  it('translates global exercises and keeps custom names', () => {
    expect(exerciseName({ slug: 'leg_press', name: 'Leg press' }, 'uk')).toBe('Жим ногами')
    expect(exerciseName({ slug: 'leg_press', name: 'Leg press' }, 'en')).toBe('Leg press')
    expect(exerciseName({ slug: null, name: 'Жим Hammer' }, 'en')).toBe('Жим Hammer')
  })

  it('searches both languages', () => {
    const legPress = EXERCISE_CATALOG.find((e) => e.slug === 'leg_press')!
    expect(matchesQuery(legPress, 'жим ног')).toBe(true)
    expect(matchesQuery(legPress, 'LEG')).toBe(true)
    expect(matchesQuery(legPress, 'тяга')).toBe(false)
    const farmers = EXERCISE_CATALOG.find((e) => e.slug === 'farmers_walk')!
    expect(matchesQuery(farmers, 'farmers')).toBe(true)
  })
})
