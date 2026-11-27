/**
 * Supersets: two or more exercises done back to back, with rest only after the round.
 *
 * An exercise's `superset` is a number shared by its neighbours in the same superset. Only
 * neighbours count: exercises next to each other with the same number form one superset, and a
 * number left on a single exercise means nothing (it is an ordinary exercise). Round N of a
 * superset is the N-th working set of each of its exercises; warm-ups are not part of rounds, and
 * drops belong to the round of the set they continue (src/lib/dropSets.ts).
 */

export interface Groupable {
  superset: number | null
}

export type Block<T> =
  | { kind: 'single'; item: T }
  | { kind: 'superset'; superset: number; letter: string; items: T[] }

/** Ordered items as blocks; supersets get letters A, B, C… in order. */
export function toBlocks<T extends Groupable>(items: T[]): Block<T>[] {
  const runs: T[][] = []
  for (const item of items) {
    const last = runs.at(-1)
    if (last && item.superset !== null && last[0].superset === item.superset) last.push(item)
    else runs.push([item])
  }
  let supersets = 0
  return runs.map((run) =>
    run.length > 1
      ? { kind: 'superset', superset: run[0].superset!, letter: supersetLetter(supersets++), items: run }
      : { kind: 'single', item: run[0] },
  )
}

/** A, B, … Z, AA, AB… */
export function supersetLetter(index: number): string {
  const letter = String.fromCharCode(65 + (index % 26))
  return index < 26 ? letter : supersetLetter(Math.floor(index / 26) - 1) + letter
}

/** A number no exercise uses yet. */
export function nextSupersetNumber(items: Groupable[]): number {
  return Math.max(0, ...items.map((i) => i.superset ?? 0)) + 1
}

/** Items that carry a superset number but stand alone (should be cleared to plain exercises). */
export function loneSupersets<T extends Groupable>(items: T[]): T[] {
  return toBlocks(items).flatMap((b) => (b.kind === 'single' && b.item.superset !== null ? [b.item] : []))
}

/** New superset numbers for joining `items[index]` with its neighbour above or below. */
export function joinNeighbour<T extends Groupable>(items: T[], index: number, direction: 'up' | 'down'): Map<T, number> {
  const other = direction === 'up' ? index - 1 : index + 1
  const changes = new Map<T, number>()
  if (other < 0 || other >= items.length) return changes
  const blocks = toBlocks(items)
  const blockOf = (i: number) => blocks.find((b) => (b.kind === 'single' ? b.item === items[i] : b.items.includes(items[i])))!
  const mine = blockOf(index)
  const theirs = blockOf(other)
  if (mine === theirs) return changes
  const members = (b: Block<T>) => (b.kind === 'single' ? [b.item] : b.items)
  // Join an existing superset when there is one; otherwise start a new one.
  const number = theirs.kind === 'superset' ? theirs.superset : mine.kind === 'superset' ? mine.superset : nextSupersetNumber(items)
  for (const item of [...members(mine), ...members(theirs)]) if (item.superset !== number) changes.set(item, number)
  return changes
}

/** Superset numbers after `items[index]` leaves its superset: the rest stay together. */
export function leaveSuperset<T extends Groupable>(items: T[], index: number): Map<T, number | null> {
  const changes = new Map<T, number | null>()
  const block = toBlocks(items).find((b) => b.kind === 'superset' && b.items.includes(items[index]))
  if (!block || block.kind !== 'superset') return changes
  changes.set(items[index], null)
  const at = block.items.indexOf(items[index])
  const before = block.items.slice(0, at)
  const after = block.items.slice(at + 1)
  // Taking out a middle exercise splits the superset: the part below gets a number of its own.
  if (before.length && after.length) {
    const number = nextSupersetNumber(items)
    for (const item of after) changes.set(item, number)
  }
  for (const part of [before, after]) {
    if (part.length === 1) changes.set(part[0], null)
  }
  return changes
}

/** Each superset member's place: "A" + index 0, 1… of size n. Plain exercises aren't in the map. */
export function supersetPlaces<T extends Groupable>(items: T[]): Map<T, { letter: string; index: number; size: number }> {
  const places = new Map<T, { letter: string; index: number; size: number }>()
  for (const block of toBlocks(items)) {
    if (block.kind !== 'superset') continue
    block.items.forEach((item, index) => places.set(item, { letter: block.letter, index, size: block.items.length }))
  }
  return places
}

/**
 * Superset numbers after `moved` was dragged to a new place in an editor: dropped between two
 * exercises of one superset it joins it; dragged out of its own superset it becomes plain.
 */
export function regroupAfterMove<T extends Groupable>(items: T[], moved: T): T[] {
  const at = items.indexOf(moved)
  const before = items[at - 1]?.superset ?? null
  const after = items[at + 1]?.superset ?? null
  let superset = moved.superset
  if (before !== null && before === after) superset = before
  else if (superset !== null && before !== superset && after !== superset) superset = null
  const placed = superset === moved.superset ? items : items.map((item) => (item === moved ? { ...item, superset } : item))
  const lone = new Set(loneSupersets(placed))
  return lone.size ? placed.map((item) => (lone.has(item) ? { ...item, superset: null } : item)) : placed
}

/** Changes keyed by item → keyed by item id. */
export const byId = <T extends { id: string }, V>(changes: Map<T, V>) => new Map([...changes].map(([item, v]) => [item.id, v]))

// Rounds ---------------------------------------------------------------------------------------

export interface RoundSet {
  id: string
  isWarmup: boolean
  /** Continues the set before it: part of that set's round, not a round of its own. */
  isDrop?: boolean
  completedAt: string | null
}

export interface RoundExercise {
  id: string
  sets: RoundSet[]
}

const working = (e: RoundExercise) => e.sets.filter((s) => !s.isWarmup && !s.isDrop)

/** The set a drop continues (the drop itself when it has none); any other set as it is. */
function chainHead(sets: RoundSet[], index: number): RoundSet | undefined {
  let i = index
  while (i > 0 && sets[i].isDrop) i--
  return sets[i]?.isDrop ? undefined : sets[i]
}

/** Rounds in the superset: the most working sets any of its exercises has. */
export function roundCount(members: RoundExercise[]): number {
  return Math.max(0, ...members.map((m) => working(m).length))
}

/** The first drop still to do right after this set, if drops continue it. */
function openDrop(e: RoundExercise, set: RoundSet): RoundSet | undefined {
  for (let i = e.sets.indexOf(set) + 1; e.sets[i]?.isDrop; i++) {
    if (!e.sets[i].completedAt) return e.sets[i]
  }
  return undefined
}

/**
 * The next set to do: the first exercise, in order, with an open set in the earliest open round
 * (a set done but with a drop still to do: that drop).
 */
export function nextUp(members: RoundExercise[]): { exerciseId: string; setId: string; round: number } | null {
  const rounds = roundCount(members)
  for (let r = 0; r < rounds; r++) {
    for (const m of members) {
      const set = working(m)[r]
      if (!set) continue
      const open = set.completedAt ? openDrop(m, set) : set
      if (open) return { exerciseId: m.id, setId: open.id, round: r + 1 }
    }
  }
  return null
}

/** Rounds fully done (every exercise that has that set has done it), counted from the start. */
export function roundsDone(members: RoundExercise[]): number {
  const next = nextUp(members)
  return next ? next.round - 1 : roundCount(members)
}

/**
 * After a set is marked done: is its round now closed (time to rest), or should the athlete go
 * straight to the next exercise? `members` already include the set as done. A drop counts as its
 * set's round (when another drop follows, the caller runs the drop countdown instead).
 */
export function afterSetDone(
  members: RoundExercise[],
  setId: string,
): { rest: boolean; next: { exerciseId: string; setId: string; round: number } | null } {
  const owner = members.find((m) => m.sets.some((s) => s.id === setId))
  const set = owner ? chainHead(owner.sets, owner.sets.findIndex((s) => s.id === setId)) : undefined
  // Warm-ups aren't part of rounds: rest as after any set.
  if (!owner || !set || set.isWarmup) return { rest: true, next: null }
  const round = working(owner).findIndex((s) => s.id === set.id)
  const closed = members.every((m) => {
    const same = working(m)[round]
    return !same || (same.completedAt !== null && !openDrop(m, same))
  })
  const next = nextUp(members)
  return { rest: closed, next: closed ? null : next }
}
