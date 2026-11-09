import { fromSpecSets, specVolume, type SpecSet } from './setSpec'

/** A plan as edited on the grid: days → exercise rows → one cell of planned sets per week. */
export interface PlanRowDraft {
  id: string
  exerciseId: string
  restS: number | null
  notes: string | null
  /** week (1-based) → planned sets */
  cells: Record<number, SpecSet[]>
}

export interface PlanDayDraft {
  id: string
  name: string
  rows: PlanRowDraft[]
}

export interface PlanDraft {
  name: string
  notes: string
  weeks: number
  days: PlanDayDraft[]
}

export const MAX_PLAN_WEEKS = 52

const newId = () => crypto.randomUUID()

export function emptyDay(name: string): PlanDayDraft {
  return { id: newId(), name, rows: [] }
}

export function newRow(exerciseId: string, restS: number | null = null): PlanRowDraft {
  return { id: newId(), exerciseId, restS, notes: null, cells: {} }
}

const roundTo = (value: number, step: number) => Math.round(value / step) * step

/** Working sets get +step kg; warm-ups stay. Bodyweight sets (0 kg) stay too. */
export function stepUp(sets: SpecSet[], stepKg: number): SpecSet[] {
  if (!stepKg) return sets
  return sets.map((s) =>
    s.isWarmup || s.weightKg === 0 ? s : { ...s, weightKg: Math.min(1000, roundTo(s.weightKg + stepKg, 0.25)) },
  )
}

function mapRows(draft: PlanDraft, fn: (row: PlanRowDraft) => PlanRowDraft): PlanDraft {
  return { ...draft, days: draft.days.map((d) => ({ ...d, rows: d.rows.map(fn) })) }
}

/** Copies week `from` into week `to` for every row (rows without a plan that week are left alone). */
export function copyWeek(
  draft: PlanDraft,
  from: number,
  to: number,
  stepFor: (exerciseId: string) => number = () => 0,
): PlanDraft {
  return mapRows(draft, (row) => {
    const source = row.cells[from]
    if (!source?.length) return row
    return { ...row, cells: { ...row.cells, [to]: stepUp(source, stepFor(row.exerciseId)) } }
  })
}

/** Adds one week at the end, copied from the last one (with an optional step). */
export function addWeek(draft: PlanDraft, stepFor?: (exerciseId: string) => number): PlanDraft {
  if (draft.weeks >= MAX_PLAN_WEEKS) return draft
  const next = { ...draft, weeks: draft.weeks + 1 }
  return copyWeek(next, draft.weeks, draft.weeks + 1, stepFor)
}

/**
 * Next mesocycle: appends `count` weeks repeating the last `count` weeks, working weights +step.
 * A 3-week wave 80/85/90 becomes 80/85/90 → 82.5/87.5/92.5.
 */
export function extendCycle(draft: PlanDraft, count: number, stepFor: (exerciseId: string) => number): PlanDraft {
  const n = Math.max(1, Math.min(count, draft.weeks, MAX_PLAN_WEEKS - draft.weeks))
  if (n <= 0 || draft.weeks >= MAX_PLAN_WEEKS) return draft
  let next: PlanDraft = { ...draft, weeks: draft.weeks + n }
  for (let i = 0; i < n; i++) {
    const from = draft.weeks - n + 1 + i
    next = copyWeek(next, from, draft.weeks + 1 + i, stepFor)
  }
  return next
}

/** Removes a week and shifts the later weeks left. */
export function removeWeek(draft: PlanDraft, week: number): PlanDraft {
  if (draft.weeks <= 1) return draft
  const next = mapRows(draft, (row) => {
    const cells: Record<number, SpecSet[]> = {}
    for (const [k, sets] of Object.entries(row.cells)) {
      const w = Number(k)
      if (w < week) cells[w] = sets
      else if (w > week) cells[w - 1] = sets
    }
    return { ...row, cells }
  })
  return { ...next, weeks: draft.weeks - 1 }
}

export function setCell(draft: PlanDraft, rowId: string, week: number, sets: SpecSet[]): PlanDraft {
  return mapRows(draft, (row) => {
    if (row.id !== rowId) return row
    const cells = { ...row.cells }
    if (sets.length) cells[week] = sets
    else delete cells[week]
    return { ...row, cells }
  })
}

export function moveRow(draft: PlanDraft, rowId: string, delta: -1 | 1): PlanDraft {
  return {
    ...draft,
    days: draft.days.map((d) => {
      const i = d.rows.findIndex((r) => r.id === rowId)
      const j = i + delta
      if (i < 0 || j < 0 || j >= d.rows.length) return d
      const rows = [...d.rows]
      ;[rows[i], rows[j]] = [rows[j], rows[i]]
      return { ...d, rows }
    }),
  }
}

export interface WeekTotals {
  volumeKg: number
  workingSets: number
}

/** Planned working volume and set count of one week across all days. */
export function weekTotals(draft: PlanDraft, week: number): WeekTotals {
  let volumeKg = 0
  let workingSets = 0
  for (const d of draft.days) {
    for (const r of d.rows) {
      const sets = r.cells[week] ?? []
      volumeKg += specVolume(sets)
      workingSets += sets.filter((s) => !s.isWarmup).length
    }
  }
  return { volumeKg, workingSets }
}

/** Payload for the `save_plan` RPC. */
export function toSavePayload(draft: PlanDraft) {
  return draft.days.map((d) => ({
    id: d.id,
    name: d.name.trim(),
    rows: d.rows.map((r) => ({
      id: r.id,
      exercise_id: r.exerciseId,
      rest_s: r.restS,
      notes: r.notes,
      cells: Object.entries(r.cells)
        .map(([week, sets]) => ({ week: Number(week), sets: fromSpecSets(sets) }))
        .filter((c) => c.week >= 1 && c.week <= draft.weeks && c.sets.length),
    })),
  }))
}

// Plan vs actual ---------------------------------------------------------------------------

export interface DoneSet {
  weightKg: number
  reps: number
  isWarmup: boolean
  completed: boolean
}

export type CellStatus = 'none' | 'done' | 'under' | 'extra'

/**
 * How a performed exercise compares to its plan: `done` when every planned working set was
 * completed with at least the planned weight and reps, `under` otherwise, `extra` when there was
 * no plan, `none` when it wasn't performed.
 */
export function cellStatus(planned: SpecSet[] | undefined, done: DoneSet[] | undefined): CellStatus {
  const completed = (done ?? []).filter((s) => s.completed)
  if (!completed.length) return 'none'
  const plannedWorking = (planned ?? []).filter((s) => !s.isWarmup)
  if (!plannedWorking.length) return 'extra'
  const doneWorking = completed.filter((s) => !s.isWarmup)
  if (doneWorking.length < plannedWorking.length) return 'under'
  // compare heaviest-first so set order inside the block doesn't matter
  const byLoad = (a: { weightKg: number; reps: number }, b: { weightKg: number; reps: number }) =>
    b.weightKg - a.weightKg || b.reps - a.reps
  const p = [...plannedWorking].sort(byLoad)
  const d = [...doneWorking].sort(byLoad)
  return p.every((s, i) => d[i].weightKg >= s.weightKg && d[i].reps >= s.reps) ? 'done' : 'under'
}

/** Completed sets as planned-set shapes, ready for `formatSetSpec`. */
export function doneAsSpec(done: DoneSet[]): SpecSet[] {
  return done.filter((s) => s.completed).map(({ weightKg, reps, isWarmup }) => ({ weightKg, reps, isWarmup }))
}
