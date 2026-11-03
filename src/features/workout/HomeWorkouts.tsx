import { ChevronRight, Dumbbell, Play } from 'lucide-react'
import { format } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { EmptyState } from '@/components/common/EmptyState'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { currentLanguage } from '@/i18n'
import { dateLocale } from '@/lib/dates'
import { formatVolume } from '@/lib/format'
import { minutesBetween } from '@/lib/time'
import { useActiveWorkout, useRecentWorkouts } from './api'
import { ElapsedClock } from './ElapsedClock'
import { StartWorkoutDrawer } from './StartWorkoutDrawer'

/** Start button, or a "resume" card when a workout is already in progress. */
export function StartOrResume({ athleteId }: { athleteId: string | undefined }) {
  const { t } = useTranslation()
  const { data: active, isPending } = useActiveWorkout(athleteId)

  if (athleteId && isPending) return <Skeleton className="h-12 rounded-xl" />
  if (!active) return <StartWorkoutDrawer athleteId={athleteId} />

  return (
    <div className="rounded-2xl border-[1.5px] border-primary bg-lime-muted p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-lime-text dark:text-lime">{t('workout.inProgress')}</p>
        <ElapsedClock since={active.startedAt} className="tabular text-sm font-medium" />
      </div>
      {active.title ? <p className="mt-0.5 text-xs text-muted-foreground">{active.title}</p> : null}
      <Button asChild size="xl" className="mt-3 w-full">
        <Link to={`/workout/${active.id}`}>
          <Play aria-hidden />
          {t('workout.resume')}
        </Link>
      </Button>
    </div>
  )
}

export function RecentWorkouts({ athleteId }: { athleteId: string | undefined }) {
  const { t } = useTranslation()
  const lang = currentLanguage()
  const { data, isPending } = useRecentWorkouts(athleteId)

  if (athleteId && isPending) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-16 rounded-2xl" />
        <Skeleton className="h-16 rounded-2xl" />
      </div>
    )
  }
  if (!data?.length) {
    return <EmptyState icon={Dumbbell} title={t('home.recentEmptyTitle')} body={t('home.recentEmptyBody')} />
  }

  return (
    <ul className="divide-y rounded-2xl border bg-card">
      {data.map((w) => (
        <li key={w.id}>
          <Link to={`/workout/${w.id}`} className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary/50">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{w.title || t('recent.untitled')}</p>
              <p className="tabular text-xs text-muted-foreground">
                {t('recent.meta', {
                  date: format(new Date(w.startedAt), lang === 'en' ? 'EEE, MMM d' : 'EEEEEE, d MMM', { locale: dateLocale(lang) }),
                  minutes: w.finishedAt ? minutesBetween(w.startedAt, w.finishedAt) : 0,
                  volume: formatVolume(w.volumeKg, lang),
                })}
              </p>
            </div>
            {w.membershipId ? (
              <span className="rounded-full bg-trainer-muted px-2 py-0.5 text-[11px] font-medium text-trainer-text">
                {t('home.trainerPackage')}
              </span>
            ) : null}
            <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  )
}
