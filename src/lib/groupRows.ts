/** One shared exercise of a split session: the same exercise at the same position for everyone. */
export interface GroupRow {
  position: number
  exerciseId: string
  /** The superset it is in (the same for every client, as rows are grouped for all at once). */
  superset: number | null
}

interface PositionedExercise {
  position: number
  exerciseId: string
  superset?: number | null
}

const rowKey = (r: GroupRow) => `${r.position}:${r.exerciseId}`

/** Exercises across all clients' workouts, in order, each once (also when only some have it). */
export function groupRows(workouts: { exercises: PositionedExercise[] }[]): GroupRow[] {
  const rows = new Map<string, GroupRow>()
  for (const w of workouts) {
    for (const e of w.exercises) {
      const row = { position: e.position, exerciseId: e.exerciseId, superset: e.superset ?? null }
      if (!rows.has(rowKey(row))) rows.set(rowKey(row), row)
    }
  }
  return [...rows.values()].sort((a, b) => a.position - b.position || a.exerciseId.localeCompare(b.exerciseId))
}

/** Where a newly added exercise goes: after the last one anyone has. */
export function nextGroupPosition(workouts: { exercises: PositionedExercise[] }[]): number {
  return Math.max(-1, ...workouts.flatMap((w) => w.exercises.map((e) => e.position))) + 1
}

/** This client's exercise for the row, if they have it. */
export function findRowExercise<T extends PositionedExercise>(exercises: T[], row: Omit<GroupRow, 'superset'>): T | undefined {
  return exercises.find((e) => e.position === row.position && e.exerciseId === row.exerciseId)
}
