import { CalendarDays } from 'lucide-react'
import { addMonths, isSameMonth, startOfMonth } from 'date-fns'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '@/components/common/EmptyState'
import { PageHeader } from '@/components/common/PageHeader'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useMyAthleteId } from '@/features/athlete/useMyAthlete'
import { useWorkoutsInRange } from '@/features/progress/api'
import { MonthCalendar } from '@/features/progress/MonthCalendar'
import { WorkoutList } from '@/features/workout/WorkoutList'
import { currentLanguage } from '@/i18n'
import { dayKey } from '@/lib/calendar'
import { formatVolume } from '@/lib/format'

export function HistoryPage() {
  const { t } = useTranslation()
  const lang = currentLanguage()
  const { data: athleteId } = useMyAthleteId()
  const [today] = useState(() => new Date())
  const [month, setMonth] = useState(() => startOfMonth(today))
  const [selected, setSelected] = useState<string | null>(null)

  const { data: workouts, isPending } = useWorkoutsInRange(athleteId, month, addMonths(month, 1))
  const days = useMemo(() => new Set((workouts ?? []).map((w) => dayKey(new Date(w.startedAt)))), [workouts])
  const shown = selected ? (workouts ?? []).filter((w) => dayKey(new Date(w.startedAt)) === selected) : (workouts ?? [])
  const monthVolume = (workouts ?? []).reduce((sum, w) => sum + w.volumeKg, 0)

  const changeMonth = (next: Date) => {
    setMonth(next)
    setSelected(null)
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t('history.title')}
        subtitle={
          workouts?.length
            ? `${t('history.monthCount', { count: workouts.length })} · ${formatVolume(monthVolume, lang)} ${t('workout.kg')}`
            : undefined
        }
      />
      <MonthCalendar
        month={month}
        onMonthChange={changeMonth}
        workoutDays={days}
        selected={selected}
        onSelect={setSelected}
        canGoForward={!isSameMonth(month, today)}
      />

      {athleteId && isPending ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-16 rounded-2xl" />
          <Skeleton className="h-16 rounded-2xl" />
        </div>
      ) : shown.length ? (
        <section className="flex flex-col gap-2">
          {selected ? (
            <Button variant="ghost" size="touch" className="self-start" onClick={() => setSelected(null)}>
              {t('history.showMonth')}
            </Button>
          ) : null}
          <WorkoutList workouts={shown} />
        </section>
      ) : (
        <EmptyState
          icon={CalendarDays}
          title={selected ? t('history.dayEmpty') : workouts ? t('history.monthEmpty') : t('history.emptyTitle')}
          body={selected ? undefined : t('history.emptyBody')}
        />
      )}
    </div>
  )
}
