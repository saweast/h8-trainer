/**
 * "To failure": a set taken until no more reps were possible. Stored as RPE 10 in the existing
 * `sets.rpe` column; the app sets nothing else there. Drops are to failure by definition and
 * aren't marked; warm-ups never are.
 */
export const FAILURE_RPE = 10

export function isToFailure(set: { rpe?: number | null }): boolean {
  return (set.rpe ?? 0) >= FAILURE_RPE
}
