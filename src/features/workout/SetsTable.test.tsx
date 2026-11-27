import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import '@/i18n'
import type { PreviousSet } from '@/lib/templatePrefill'
import type { WorkoutSet } from './api'
import { SetsTable } from './ExerciseCard'

let n = 0
const set = (weightKg: number, reps: number, flags: Partial<Pick<WorkoutSet, 'isWarmup' | 'isDrop' | 'completedAt'>> = {}): WorkoutSet => ({
  id: `s${++n}`,
  workoutExerciseId: 'we',
  position: n,
  weightKg,
  reps,
  isWarmup: false,
  isDrop: false,
  completedAt: null,
  ...flags,
})
const prev = (weightKg: number, reps: number, flags: Partial<PreviousSet> = {}): PreviousSet => ({
  position: 0,
  weightKg,
  reps,
  isWarmup: false,
  ...flags,
})

function renderTable(sets: WorkoutSet[], lastTime: PreviousSet[] = []) {
  const handlers = {
    onSetChange: vi.fn(),
    onSetCompleted: vi.fn(),
    onSetDelete: vi.fn(),
    onAddSet: vi.fn(),
    onAddDrop: vi.fn(),
  }
  render(<SetsTable sets={sets} lastTime={lastTime} records={null} weightStepKg={2.5} {...handlers} />)
  return handlers
}

/** Opens the menu of the n-th set row (0-based) and returns its items. */
function openMenu(row: number) {
  fireEvent.keyDown(screen.getAllByRole('button', { name: 'Дії із сетом' })[row], { key: 'Enter' })
  return within(screen.getByRole('menu'))
}

describe('SetsTable with drops', () => {
  beforeAll(() => {
    // Radix menus measure themselves; jsdom has nothing to measure with.
    globalThis.ResizeObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
  })

  afterEach(cleanup)

  it("shows drops under their set, next to last time's drops", () => {
    const sets = [set(40, 10, { isWarmup: true }), set(80, 10), set(65, 0, { isDrop: true }), set(80, 10)]
    renderTable(sets, [prev(40, 10, { isWarmup: true }), prev(80, 10), prev(60, 8, { isDrop: true }), prev(80, 9)])
    const reps = screen.getAllByRole('textbox', { name: 'Повт' }) as HTMLInputElement[]
    // the drop: reps empty, last time's drop reps as the hint
    expect(reps[2].value).toBe('')
    expect(reps[2].placeholder).toBe('8')
    expect(screen.getByLabelText('Дроп')).toBeInTheDocument()
    // the second working set is still paired with last time's second set, not with the drop
    expect(screen.getByText('80 × 9')).toBeInTheDocument()
    expect(screen.getByText('60 × 8')).toBeInTheDocument()
  })

  it("adds a drop at last time's weight, else 20% lighter", () => {
    const sets = [set(80, 10)]
    const withHistory = renderTable(sets, [prev(80, 10), prev(55, 8, { isDrop: true })])
    fireEvent.click(openMenu(0).getByRole('menuitem', { name: 'Додати дроп' }))
    expect(withHistory.onAddDrop).toHaveBeenCalledWith(sets[0].id, 55)
    cleanup()

    const fresh = renderTable(sets)
    fireEvent.click(openMenu(0).getByRole('menuitem', { name: 'Додати дроп' }))
    expect(fresh.onAddDrop).toHaveBeenCalledWith(sets[0].id, 65)
  })

  it('adds the next drop after the last one of the chain', () => {
    const sets = [set(80, 10), set(65, 8, { isDrop: true }), set(80, 10)]
    const { onAddDrop } = renderTable(sets)
    fireEvent.click(openMenu(0).getByRole('menuitem', { name: 'Додати дроп' }))
    expect(onAddDrop).toHaveBeenCalledWith(sets[1].id, 52.5) // 65 × 0.8 = 52 → 52.5
  })

  it('keeps a set with drops working, and deletes it with its drops', () => {
    renderTable([set(80, 10), set(65, 0, { isDrop: true })])
    const menu = openMenu(0)
    expect(menu.queryByRole('menuitem', { name: 'Позначити як розминку' })).toBeNull()
    expect(menu.getByRole('menuitem', { name: 'Видалити сет із дропами' })).toBeInTheDocument()
  })

  it('offers no drops on a warm-up', () => {
    renderTable([set(40, 10, { isWarmup: true }), set(80, 10)])
    expect(openMenu(0).queryByRole('menuitem', { name: 'Додати дроп' })).toBeNull()
  })

  it('tells the caller to skip rest when a drop comes next', () => {
    const { onSetCompleted } = renderTable([set(80, 10), set(65, 7, { isDrop: true })])
    const done = screen.getAllByRole('button', { name: 'Сет виконано' })
    fireEvent.click(done[0])
    expect(onSetCompleted).toHaveBeenLastCalledWith(expect.objectContaining({ weightKg: 80, reps: 10 }), false, true)
    fireEvent.click(done[1])
    expect(onSetCompleted).toHaveBeenLastCalledWith(expect.objectContaining({ weightKg: 65, reps: 7 }), false, false)
  })
})
