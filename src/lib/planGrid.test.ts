import { describe, expect, it } from 'vitest'
import {
  addWeek,
  cellStatus,
  copyWeek,
  extendCycle,
  moveRow,
  removeWeek,
  setCell,
  stepUp,
  toSavePayload,
  weekTotals,
  type PlanDraft,
} from './planGrid'
import { formatSetSpec, parseSetSpec } from './setSpec'

const spec = (text: string) => parseSetSpec(text).sets
const text = (sets: ReturnType<typeof spec> | undefined) => (sets ? formatSetSpec(sets) : '')

function draft(): PlanDraft {
  return {
    name: 'Хвиля',
    notes: '',
    weeks: 3,
    days: [
      {
        id: 'd1',
        name: '1 тренування',
        rows: [
          { id: 'squat', exerciseId: 'squat', restS: null, notes: null, cells: { 1: spec('20x10, 80x8x3'), 2: spec('20x10, 85x6x3'), 3: spec('20x10, 90x5x3') } },
          { id: 'curl', exerciseId: 'curl', restS: null, notes: null, cells: { 1: spec('10x10, 15x10x3') } },
        ],
      },
    ],
  }
}

const step = (id: string) => (id === 'squat' ? 2.5 : 1)

describe('plan grid', () => {
  it('steps working sets only', () => {
    expect(text(stepUp(spec('20x10, 80x8x3'), 2.5))).toBe('20x10, 82.5x8x3')
    expect(stepUp(parseSetSpec('12x4', { bodyweight: true }).sets, 2.5).every((s) => s.weightKg === 0)).toBe(true)
  })

  it('copies a week with a step', () => {
    const next = copyWeek(draft(), 1, 3, step)
    expect(text(next.days[0].rows[0].cells[3])).toBe('20x10, 82.5x8x3')
    expect(text(next.days[0].rows[1].cells[3])).toBe('10x10, 16x10x3')
  })

  it('adds a week copied from the last one', () => {
    const next = addWeek(draft())
    expect(next.weeks).toBe(4)
    expect(text(next.days[0].rows[0].cells[4])).toBe('20x10, 90x5x3')
    expect(next.days[0].rows[1].cells[4]).toBeUndefined()
  })

  it('extends the wave into the next cycle', () => {
    const next = extendCycle(draft(), 3, step)
    expect(next.weeks).toBe(6)
    expect([4, 5, 6].map((w) => text(next.days[0].rows[0].cells[w]))).toEqual([
      '20x10, 82.5x8x3',
      '20x10, 87.5x6x3',
      '20x10, 92.5x5x3',
    ])
  })

  it('removes a week and shifts the rest', () => {
    const next = removeWeek(draft(), 2)
    expect(next.weeks).toBe(2)
    expect(text(next.days[0].rows[0].cells[2])).toBe('20x10, 90x5x3')
    expect(next.days[0].rows[0].cells[3]).toBeUndefined()
  })

  it('sets, clears and reorders', () => {
    let next = setCell(draft(), 'curl', 2, spec('10x10, 15x12x3'))
    expect(text(next.days[0].rows[1].cells[2])).toBe('10x10, 15x12x3')
    next = setCell(next, 'curl', 2, [])
    expect(next.days[0].rows[1].cells[2]).toBeUndefined()
    next = moveRow(next, 'curl', -1)
    expect(next.days[0].rows.map((r) => r.id)).toEqual(['curl', 'squat'])
    expect(moveRow(next, 'curl', -1)).toEqual(next)
  })

  it('totals working volume per week', () => {
    expect(weekTotals(draft(), 1)).toEqual({ volumeKg: 80 * 8 * 3 + 15 * 10 * 3, workingSets: 6 })
    expect(weekTotals(draft(), 3)).toEqual({ volumeKg: 90 * 5 * 3, workingSets: 3 })
  })

  it('builds the save payload without cells beyond the plan', () => {
    const d = draft()
    d.days[0].rows[1].cells[7] = spec('1x1')
    const [day] = toSavePayload(d)
    expect(day.rows[1].cells).toEqual([{ week: 1, sets: [{ w: 10, r: 10, warmup: true }, { w: 15, r: 10 }, { w: 15, r: 10 }, { w: 15, r: 10 }] }])
  })
})

describe('cellStatus', () => {
  const planned = spec('20x10, 80x8x3')
  const done = (t: string, completed = true) => spec(t).map((s) => ({ ...s, completed }))

  it('compares the working sets', () => {
    expect(cellStatus(planned, undefined)).toBe('none')
    expect(cellStatus(planned, done('20x10, 80x8x3', false))).toBe('none')
    expect(cellStatus(planned, done('20x10, 80x8x3'))).toBe('done')
    expect(cellStatus(planned, done('80x8x3, 82.5x8'))).toBe('done')
    expect(cellStatus(planned, done('20x10, 80x8x2, 80x6'))).toBe('under')
    expect(cellStatus(planned, done('20x10, 80x8x2'))).toBe('under')
    expect(cellStatus(planned, done('20x10, 75x8x3'))).toBe('under')
    expect(cellStatus(undefined, done('20x10'))).toBe('extra')
  })
})
