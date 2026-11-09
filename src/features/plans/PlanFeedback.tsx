import type { PlanRowDraft } from '@/lib/planGrid'
import type { PlanFact } from './api'

/** Client feedback and the comment thread for one cell. */
export function CellFeedbackThread(_props: { planId: string; rowId: string; week: number; fact: PlanFact | undefined }) {
  return null
}

/** Plan-level comments. */
export function PlanFeedback(_props: {
  planId: string
  athleteId: string | null
  rows: { row: PlanRowDraft }[]
  nameOf: (exerciseId: string) => string
}) {
  return null
}
