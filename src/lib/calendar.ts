import {
  addDays,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns'

export interface CalendarDay {
  date: Date
  /** Local "yyyy-MM-dd", handy as a key and for matching workouts. */
  key: string
  inMonth: boolean
}

export const dayKey = (date: Date) => format(date, 'yyyy-MM-dd')

/** Full weeks (Monday first) covering the month, padded with days of the neighbour months. */
export function monthGrid(month: Date): CalendarDay[][] {
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 })
  const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 })
  const weeks: CalendarDay[][] = []
  for (let day = start; day <= end; day = addDays(day, 7)) {
    weeks.push(
      Array.from({ length: 7 }, (_, i) => {
        const date = addDays(day, i)
        return { date, key: dayKey(date), inMonth: isSameMonth(date, month) }
      }),
    )
  }
  return weeks
}
