import { ChartLine, ChevronRight, Ruler } from 'lucide-react'
import { format, subDays } from 'date-fns'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { EmptyState } from '@/components/common/EmptyState'
import { PageHeader } from '@/components/common/PageHeader'
import { Skeleton } from '@/components/ui/skeleton'
import { exerciseName } from '@/data/exercises'
import { useMyAthleteId } from '@/features/athlete/useMyAthlete'
import { useExerciseMap } from '@/features/exercises/api'
import { useWorkoutsInRange } from '@/features/progress/api'
import { useExerciseRecords } from '@/features/workout/api'
import { currentLanguage } from '@/i18n'
import { dateLocale } from '@/lib/dates'
import { formatKg, formatVolume } from '@/lib/format'

export function ProgressPage() {
  const { t } = useTranslation()
  const lang = currentLanguage()
  const { data: athleteId } = useMyAthleteId()
  const [range] = useState(() => {
    const to = new Date()
    return { from: subDays(to, 30), to }
  })
  const { data: recent } = useWorkoutsInRange(athleteId, range.from, range.to)
  const { data: records, isPending } = useExerciseRecords(athleteId)
  const { map: exercises } = useExerciseMap()

  const performed = useMemo(
    () =>
      [...(records?.entries() ?? [])]
        .map(([id, r]) => ({ id, ...r, exercise: exercises.get(id) }))
        .filter((r) => r.exercise)
        .sort((a, b) => b.lastPerformedAt.localeCompare(a.lastPerformedAt)),
    [records, exercises],
  )
  const volume30 = (recent ?? []).reduce((sum, w) => sum + w.volumeKg, 0)
  const kg = t('workout.kg')

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('progress.title')} />

      <section aria-label={t('progress.last30')}>
        <p className="mb-2 text-xs font-medium text-muted-foreground">{t('progress.last30')}</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl border bg-card p-3">
            <p className="text-xs text-muted-foreground">{t('progress.workouts')}</p>
            <p className="tabular mt-0.5 text-lg font-medium">{recent ? recent.length : '—'}</p>
          </div>
          <div className="rounded-2xl border bg-card p-3">
            <p className="text-xs text-muted-foreground">{t('progress.volume')}</p>
            <p className="tabular mt-0.5 text-lg font-medium">{recent ? `${formatVolume(volume30, lang)} ${kg}` : '—'}</p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-[15px] font-medium">{t('progress.myExercises')}</h2>
        {athleteId && isPending ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-16 rounded-2xl" />
            <Skeleton className="h-16 rounded-2xl" />
          </div>
        ) : performed.length === 0 ? (
          <EmptyState icon={ChartLine} title={t('progress.emptyTitle')} body={t('progress.emptyBody')} />
        ) : (
          <ul className="divide-y rounded-2xl border bg-card">
            {performed.map((r) => {
              const best = r.bestE1rmKg ?? r.bestWeightKg
              return (
                <li key={r.id}>
                  <Link to={`/exercises/${r.id}`} className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary/50">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{exerciseName(r.exercise!, lang)}</p>
                      <p className="text-xs text-muted-foreground">
                        {t('progress.lastDone', {
                          date: format(new Date(r.lastPerformedAt), 'd MMM', { locale: dateLocale(lang) }),
                        })}
                      </p>
                    </div>
                    {best ? (
                      <div className="text-right">
                        <p className="tabular text-sm font-medium">
                          {formatKg(best, lang)} {kg}
                        </p>
                        <p className="text-[11px] text-muted-foreground">{r.bestE1rmKg ? t('progress.e1rm') : t('progress.best')}</p>
                      </div>
                    ) : null}
                    <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <Link to="/body" className="flex min-h-14 items-center gap-3 rounded-2xl border bg-card px-4 transition-colors hover:bg-secondary">
        <Ruler className="size-5 text-muted-foreground" aria-hidden />
        <span className="flex-1 text-sm font-medium">{t('progress.body')}</span>
        <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
      </Link>
    </div>
  )
}
