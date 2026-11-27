import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@/i18n'
import { RestTimerBar } from './RestTimerBar'
import type { RestTimer } from './useRestTimer'

const timer = (patch: Partial<RestTimer>): RestTimer => ({
  running: true,
  remainingS: 8,
  totalS: 10,
  kind: 'rest',
  justFinished: false,
  start: vi.fn(),
  adjust: vi.fn(),
  stop: vi.fn(),
  ...patch,
})

describe('RestTimerBar', () => {
  afterEach(cleanup)

  it('counts rest in 15 s steps', () => {
    render(<RestTimerBar timer={timer({ remainingS: 75, totalS: 90 })} />)
    expect(screen.getByText('Відпочинок')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+15 s' })).toBeInTheDocument()
  })

  it('shows the weight change before a drop in 5 s steps', () => {
    render(<RestTimerBar timer={timer({ kind: 'drop' })} />)
    expect(screen.getByText('Дроп: знижуй вагу')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+5 s' })).toBeInTheDocument()
  })

  it('says go when the drop countdown ends', () => {
    render(<RestTimerBar timer={timer({ kind: 'drop', running: false, justFinished: true, remainingS: 0 })} />)
    expect(screen.getByText('Дроп — поїхали!')).toBeInTheDocument()
  })
})
