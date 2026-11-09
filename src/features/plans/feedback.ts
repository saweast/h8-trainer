import type { PlanFact } from './api'
import type { CellFeedback } from './PlanCell'

/** Feedback markers for grid cells. */
export function usePlanFeedback(_planId: string | undefined, _facts: Map<string, PlanFact> | undefined) {
  return {
    forCell: (_rowId: string, _week: number): CellFeedback | null => null,
  }
}
