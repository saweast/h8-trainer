import { usePlanComments, type PlanFact } from './api'
import type { CellFeedback } from './PlanCell'

/** Feedback markers for grid cells: the client's rating of the performed exercise and cell comments. */
export function usePlanFeedback(planId: string | undefined, facts: Map<string, PlanFact> | undefined) {
  const { data: comments } = usePlanComments(planId)
  const counts = new Map<string, number>()
  for (const c of comments ?? []) {
    if (c.rowId && c.week) counts.set(`${c.rowId}:${c.week}`, (counts.get(`${c.rowId}:${c.week}`) ?? 0) + 1)
  }
  return {
    forCell: (rowId: string, week: number): CellFeedback | null => {
      const key = `${rowId}:${week}`
      const fact = facts?.get(key)
      const n = counts.get(key) ?? 0
      if (!n && !fact?.difficulty && !fact?.athleteFeedback) return null
      return { difficulty: fact?.difficulty ?? null, text: fact?.athleteFeedback ?? null, comments: n }
    },
  }
}
