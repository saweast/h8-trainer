/**
 * Supersets: two or more exercises done back to back, with rest only after the round. Each
 * exercise (workout exercise, template item, plan row) has a `superset` group number;
 * consecutive items with the same number form one superset. A number used by a single item on
 * its own means nothing. Supersets are lettered in order (A, B…), items numbered inside (A1, A2).
 */

export type SupersetGroup = number | null | undefined

export interface SupersetPlace {
  /** "A1", "A2", "B1"… */
  label: string
  letter: string
  /** 0-based place inside the superset. */
  index: number
  size: number
  first: boolean
  last: boolean
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/** Runs of consecutive equal non-null groups: [start, end) pairs, two items or more. */
function runs(groups: SupersetGroup[]): [number, number][] {
  const out: [number, number][] = []
  let i = 0
  while (i < groups.length) {
    const g = groups[i]
    let j = i + 1
    if (g !== null && g !== undefined) while (j < groups.length && groups[j] === g) j++
    if (j - i >= 2) out.push([i, j])
    i = j
  }
  return out
}

/** Where each item sits in its superset, or null when it isn't in one. */
export function supersetPlaces(groups: SupersetGroup[]): (SupersetPlace | null)[] {
  const places: (SupersetPlace | null)[] = groups.map(() => null)
  runs(groups).forEach(([start, end], n) => {
    const letter = LETTERS[n % LETTERS.length]
    for (let i = start; i < end; i++) {
      places[i] = { label: `${letter}${i - start + 1}`, letter, index: i - start, size: end - start, first: i === start, last: i === end - 1 }
    }
  })
  return places
}

/** Supersets only where two or more items share a group, numbered 1, 2… in order; the rest null. */
export function normalizeSupersets(groups: SupersetGroup[]): (number | null)[] {
  const out: (number | null)[] = groups.map(() => null)
  runs(groups).forEach(([start, end], n) => {
    for (let i = start; i < end; i++) out[i] = n + 1
  })
  return out
}

/** Joins item `i` and the one after it (with the rest of either's superset). */
export function linkWithNext(groups: SupersetGroup[], i: number): (number | null)[] {
  const g = groups.map((x) => x ?? null)
  if (i < 0 || i + 1 >= g.length) return g
  const next = g[i + 1]
  const target = g[i] ?? next ?? Math.max(0, ...g.map((x) => x ?? 0)) + 1
  g[i] = target
  if (next !== null && next !== target) {
    for (let j = i + 1; j < g.length && g[j] === next; j++) g[j] = target
  } else {
    g[i + 1] = target
  }
  return clearSingles(g)
}

/** Takes item `i` out of its superset; a superset left with one item dissolves. */
export function unlinkItem(groups: SupersetGroup[], i: number): (number | null)[] {
  const g = groups.map((x) => x ?? null)
  if (i >= 0 && i < g.length) g[i] = null
  return clearSingles(g)
}

/** Group numbers that no longer form a superset become null. */
function clearSingles(g: (number | null)[]): (number | null)[] {
  const places = supersetPlaces(g)
  return g.map((x, i) => (places[i] ? x : null))
}

export interface RoundExercise {
  superset?: number | null
  sets: { completedAt: string | null; isWarmup: boolean }[]
}

/**
 * True when, after a set of exercise `index`, the round goes on to the next exercise of its
 * superset (no rest): some later exercise of the superset still has a working set to do.
 */
export function continuesRound(exercises: RoundExercise[], index: number): boolean {
  const places = supersetPlaces(exercises.map((e) => e.superset))
  const place = places[index]
  if (!place || place.last) return false
  for (let j = index + 1; j < index + (place.size - place.index); j++) {
    if (exercises[j].sets.some((s) => s.completedAt === null && !s.isWarmup)) return true
  }
  return false
}
