// @vitest-environment node
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import en from '../src/data/exercise-guides/en.json'
import uk from '../src/data/exercise-guides/uk.json'
import media from '../src/data/exercise-media.json'
import { EXERCISE_CATALOG } from '../src/data/exercises'
import { MUSCLE_DETAILS, type ExerciseGuide, type ExerciseMedia } from '../src/data/exerciseMedia'
import enLocale from '../src/i18n/locales/en.json'
import ukLocale from '../src/i18n/locales/uk.json'

// Checks the data behind the exercise guides: texts, muscles, videos and the photo files that
// scripts/build-exercise-media.mjs writes to public/exercises/.

const MEDIA = media as Record<string, ExerciseMedia>
const GUIDES: Record<string, Record<string, ExerciseGuide>> = { uk, en }
const publicDir = join(import.meta.dirname, '..', 'public', 'exercises')
const slugs = EXERCISE_CATALOG.map((e) => e.slug)

describe('exercise guides', () => {
  it('cover exactly the catalog', () => {
    expect(Object.keys(MEDIA).sort()).toEqual([...slugs].sort())
    for (const lang of ['uk', 'en']) expect(Object.keys(GUIDES[lang]).sort()).toEqual([...slugs].sort())
  })

  it.each(slugs)('%s has texts, muscles and a video', (slug) => {
    const m = MEDIA[slug]
    expect(m.primary.length).toBeGreaterThan(0)
    for (const muscle of [...m.primary, ...m.secondary]) expect(MUSCLE_DETAILS).toContain(muscle)
    expect(m.video?.id).toMatch(/^[\w-]{11}$/)
    expect(m.video?.channel).toBeTruthy()
    for (const lang of ['uk', 'en']) {
      const g = GUIDES[lang][slug]
      expect(g.summary.length).toBeGreaterThan(10)
      expect(g.steps.length).toBeGreaterThanOrEqual(3)
      expect(g.tips.length).toBeGreaterThanOrEqual(1)
    }
  })

  it.each(slugs.filter((s) => MEDIA[s].images))('%s has its photos in public/', (slug) => {
    for (const file of ['start.webp', 'end.webp', 'thumb.webp']) {
      expect(existsSync(join(publicDir, slug, file)), `${slug}/${file}`).toBe(true)
    }
  })

  it('translates every muscle', () => {
    for (const m of MUSCLE_DETAILS) {
      expect(ukLocale.muscleDetail[m]).toBeTruthy()
      expect(enLocale.muscleDetail[m]).toBeTruthy()
    }
  })
})
