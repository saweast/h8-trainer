/**
 * The set notation trainers already use in spreadsheets: "20x10, 50x5, 80x8x3".
 *
 * - `WxR` is one set of R reps at W kg, `WxRxS` is S such sets.
 * - Bodyweight exercises drop the weight: `R` is one set, `RxS` is S sets; `WxRxS` still means added weight.
 * - `x`, Cyrillic `х`, `×` and `*` all work; "82,5x8" is a decimal comma.
 * - `(…)` is a note for that token: "10(з резинкою)".
 * - A trailing `р` / `w` marks warm-up sets. Without markers the warm-ups are guessed: the lighter
 *   single sets that come before the first multi-set block (or before the heaviest set).
 *
 * The planned sets (`SpecSet[]`) are the source of truth; text is always re-derived with
 * `formatSetSpec`, which adds markers only where the guess would get it wrong.
 */

export interface SpecSet {
  weightKg: number
  reps: number
  isWarmup: boolean
  note?: string
}

export type SpecWarning =
  | { kind: 'invalid'; token: string }
  | { kind: 'swapped'; token: string; suggestion: string }
  | { kind: 'tooMany' }

export interface ParsedSpec {
  sets: SpecSet[]
  warnings: SpecWarning[]
}

export interface SpecOptions {
  /** Bodyweight exercise: two numbers mean reps × sets, one number means reps. */
  bodyweight?: boolean
}

export const MAX_SPEC_SETS = 30
const MAX_REPS = 100
const MAX_BLOCK_SETS = 20
const WARMUP_MARKERS = /[рrw]$/i

interface Block {
  weightKg: number
  reps: number
  count: number
  note?: string
  marked: boolean
}

/** Splits on commas, semicolons and new lines, but not inside "(…)". */
function splitTokens(text: string): string[] {
  const tokens: string[] = []
  let depth = 0
  let current = ''
  for (const ch of text) {
    if (ch === '(') depth++
    if (ch === ')') depth = Math.max(0, depth - 1)
    if (depth === 0 && (ch === ',' || ch === ';' || ch === '\n')) {
      tokens.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  tokens.push(current)
  return tokens.map((t) => t.trim()).filter(Boolean)
}

const toNumber = (s: string) => Number(s.replace(',', '.'))

function parseToken(raw: string, bodyweight: boolean): Block | null {
  let note: string | undefined
  let rest = raw.replace(/\(([^)]*)\)/g, (_m, inner: string) => {
    const trimmed = inner.trim()
    if (trimmed) note = note ? `${note}; ${trimmed}` : trimmed
    return ''
  })
  rest = rest.toLowerCase().replace(/[х×*]/g, 'x').replace(/\s+/g, '')
  let marked = false
  if (WARMUP_MARKERS.test(rest)) {
    marked = true
    rest = rest.slice(0, -1)
  }
  if (!/^\d{1,4}([.,]\d{1,2})?(x\d{1,3}){0,2}$/.test(rest)) return null
  const nums = rest.split('x').map(toNumber)

  let weightKg = 0
  let reps: number
  let count = 1
  if (nums.length === 3) [weightKg, reps, count] = nums
  else if (bodyweight) [reps, count = 1] = nums
  else if (nums.length === 2) [weightKg, reps] = nums
  else return null

  if (!Number.isInteger(reps) || !Number.isInteger(count)) return null
  if (weightKg > 1000 || reps < 1 || reps > MAX_REPS || count < 1 || count > MAX_BLOCK_SETS) return null
  return { weightKg, reps, count, note, marked }
}

/** Indexes of the blocks that are warm-ups when nothing is marked explicitly. */
function guessWarmups(blocks: Pick<Block, 'weightKg' | 'count'>[]): Set<number> {
  const warm = new Set<number>()
  const firstMulti = blocks.findIndex((b) => b.count >= 2)
  let refIndex: number
  if (firstMulti >= 0) {
    refIndex = firstMulti
  } else {
    const max = Math.max(...blocks.map((b) => b.weightKg))
    refIndex = blocks.findIndex((b) => b.weightKg === max)
  }
  const refWeight = blocks[refIndex]?.weightKg ?? 0
  for (let i = 0; i < refIndex; i++) {
    if (blocks[i].count === 1 && blocks[i].weightKg < refWeight) warm.add(i)
    else break
  }
  return warm
}

export function parseSetSpec(text: string, options: SpecOptions = {}): ParsedSpec {
  const bodyweight = options.bodyweight ?? false
  // "82,5x8" → decimal comma, but "20x10,50x5" is a list. Bodyweight specs have no weights.
  const normalized = bodyweight
    ? text
    : text.replace(/(^|[\s,;(])(\d{1,4}),(\d{1,2})(?=\s*[xх×*])/g, '$1$2.$3')

  const warnings: SpecWarning[] = []
  const blocks: Block[] = []
  for (const token of splitTokens(normalized)) {
    const block = parseToken(token, bodyweight)
    if (!block) {
      warnings.push({ kind: 'invalid', token })
      continue
    }
    // "10x3x12" is almost always 3 × 12 written the other way round.
    if (block.count > 6 && block.reps < block.count) {
      const w = bodyweight && block.weightKg === 0 ? '' : `${formatWeight(block.weightKg)}x`
      warnings.push({ kind: 'swapped', token, suggestion: `${w}${block.count}x${block.reps}` })
    }
    blocks.push(block)
  }

  const explicit = blocks.some((b) => b.marked)
  const guessed = explicit ? new Set<number>() : guessWarmups(blocks)
  const sets: SpecSet[] = []
  blocks.forEach((b, i) => {
    const isWarmup = explicit ? b.marked : guessed.has(i)
    for (let n = 0; n < b.count; n++) {
      sets.push({ weightKg: b.weightKg, reps: b.reps, isWarmup, ...(b.note ? { note: b.note } : {}) })
    }
  })
  if (sets.length > MAX_SPEC_SETS) {
    warnings.push({ kind: 'tooMany' })
    sets.length = MAX_SPEC_SETS
  }
  return { sets, warnings }
}

const formatWeight = (w: number, decimalComma = false) => {
  const s = String(Math.round(w * 100) / 100)
  return decimalComma ? s.replace('.', ',') : s
}

/** Consecutive identical sets grouped into blocks. */
function groupSets(sets: SpecSet[]): (SpecSet & { count: number })[] {
  const groups: (SpecSet & { count: number })[] = []
  for (const s of sets) {
    const last = groups.at(-1)
    if (
      last &&
      last.weightKg === s.weightKg &&
      last.reps === s.reps &&
      last.isWarmup === s.isWarmup &&
      (last.note ?? '') === (s.note ?? '')
    ) {
      last.count++
    } else {
      groups.push({ ...s, count: 1 })
    }
  }
  return groups
}

export interface FormatOptions extends SpecOptions {
  /** "uk" writes "82,5x8". */
  locale?: string
  /** Marker for warm-ups the guess would miss. */
  warmupMarker?: string
}

/** Planned or performed sets back to notation: "20x10, 50x5, 80x8x3". */
export function formatSetSpec(sets: SpecSet[], options: FormatOptions = {}): string {
  const bodyweight = options.bodyweight ?? false
  const decimalComma = options.locale === 'uk'
  const marker = options.warmupMarker ?? (options.locale === 'en' ? 'w' : 'р')
  const groups = groupSets(sets)
  const guessed = guessWarmups(groups)
  const needMarkers = groups.some((g, i) => g.isWarmup !== guessed.has(i))

  return groups
    .map((g) => {
      let core: string
      if (bodyweight && g.weightKg === 0) core = g.count > 1 ? `${g.reps}x${g.count}` : `${g.reps}`
      else if (bodyweight) core = `${formatWeight(g.weightKg, decimalComma)}x${g.reps}x${g.count}`
      else core = `${formatWeight(g.weightKg, decimalComma)}x${g.reps}${g.count > 1 ? `x${g.count}` : ''}`
      return `${core}${needMarkers && g.isWarmup ? marker : ''}${g.note ? `(${g.note})` : ''}`
    })
    .join(', ')
}

/** Working volume, kg: warm-ups don't count. */
export function specVolume(sets: Pick<SpecSet, 'weightKg' | 'reps' | 'isWarmup'>[]): number {
  return sets.reduce((sum, s) => (s.isWarmup ? sum : sum + s.weightKg * s.reps), 0)
}

/** Validates planned sets coming from storage (jsonb). Returns null for anything malformed. */
export function toSpecSets(value: unknown): SpecSet[] | null {
  if (!Array.isArray(value)) return null
  const out: SpecSet[] = []
  for (const v of value) {
    if (typeof v !== 'object' || v === null) return null
    const { w, r, warmup, note } = v as Record<string, unknown>
    const weightKg = Number(w)
    const reps = Number(r)
    if (!Number.isFinite(weightKg) || !Number.isInteger(reps)) return null
    out.push({ weightKg, reps, isWarmup: warmup === true, ...(typeof note === 'string' && note ? { note } : {}) })
  }
  return out
}

/** Compact storage shape: [{ w, r, warmup?, note? }]. */
export function fromSpecSets(sets: SpecSet[]): { w: number; r: number; warmup?: true; note?: string }[] {
  return sets.map((s) => ({
    w: s.weightKg,
    r: s.reps,
    ...(s.isWarmup ? { warmup: true as const } : {}),
    ...(s.note ? { note: s.note } : {}),
  }))
}
