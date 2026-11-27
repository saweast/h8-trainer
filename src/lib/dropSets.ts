/**
 * Drop sets: a set to (near) failure, then straight away a lighter weight to failure again,
 * 2–4 times in a row without rest. Every drop is a set of its own with `isDrop`; it continues the
 * nearest working set before it. The chain counts as one set, its volume counts in full, and
 * records come from its first set only (supabase/migrations/…_drop_sets.sql does the same).
 */

export interface ChainSet {
  isWarmup: boolean
  isDrop?: boolean
}

export interface Chain<T> {
  head: T
  drops: T[]
}

/** Working sets with the drops that continue them, in order. Warm-ups are left out. */
export function workingChains<T extends ChainSet>(sets: T[]): Chain<T>[] {
  const chains: Chain<T>[] = []
  for (const s of sets) {
    if (s.isWarmup) continue
    const last = chains.at(-1)
    // a drop with nothing before it (data from elsewhere) is read as a set of its own
    if (s.isDrop && last) last.drops.push(s)
    else chains.push({ head: s, drops: [] })
  }
  return chains
}

/**
 * All sets in order, each working set with the drops that continue it; warm-ups stand alone.
 * For showing a chain as one thing: "80 × 10 → 60 × 8 → 40 × 6".
 */
export function groupChains<T extends ChainSet>(sets: T[]): Chain<T>[] {
  const groups: Chain<T>[] = []
  for (const s of sets) {
    const last = groups.at(-1)
    if (s.isDrop && last && !last.head.isWarmup) last.drops.push(s)
    else groups.push({ head: s, drops: [] })
  }
  return groups
}

/** Index of the last set of the chain that `index` starts or belongs to: a new drop goes after it. */
export function chainEnd(sets: ChainSet[], index: number): number {
  let end = index
  while (sets[end + 1]?.isDrop) end++
  return end
}

/** The drops right after this set, when it starts a chain (none for a drop or a warm-up). */
export function dropsAfter<T extends ChainSet>(sets: T[], index: number): T[] {
  if (sets[index]?.isDrop || sets[index]?.isWarmup) return []
  return sets.slice(index + 1, chainEnd(sets, index) + 1)
}

/** Seconds to change the weight before a drop: a short countdown instead of rest. */
export const DROP_CHANGE_S = 10

/** Share of the weight taken off for a drop when there is no history. */
export const DROP_SHARE = 0.2

/**
 * Weight for a new drop: what this drop was last time, if that is still lighter than the set it
 * continues; otherwise 20% lighter, on the machine's step (and at least one step lighter).
 */
export function suggestDropWeight(previousKg: number, stepKg: number, lastTimeKg?: number): number {
  if (previousKg <= 0) return 0
  if (lastTimeKg !== undefined && lastTimeKg > 0 && lastTimeKg < previousKg) return lastTimeKg
  const step = stepKg > 0 ? stepKg : 2.5
  let kg = Math.round((previousKg * (1 - DROP_SHARE)) / step) * step
  if (kg >= previousKg) kg = previousKg - step
  return Math.max(0, Math.round(kg * 100) / 100)
}
