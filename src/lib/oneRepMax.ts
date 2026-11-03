/**
 * Estimated one-rep max (Epley). Mirrors the SQL in `exercise_records()`:
 * reps = 1 → weight; 2..E1RM_MAX_REPS → weight · (1 + reps / 30); higher reps are too
 * unreliable to estimate, so they return null.
 */
export const E1RM_MAX_REPS = 12

export function estimateOneRepMax(weightKg: number, reps: number): number | null {
  if (!Number.isFinite(weightKg) || !Number.isFinite(reps)) return null
  if (weightKg <= 0 || reps <= 0 || !Number.isInteger(reps)) return null
  if (reps === 1) return weightKg
  if (reps > E1RM_MAX_REPS) return null
  return Math.round(weightKg * (1 + reps / 30) * 10) / 10
}
