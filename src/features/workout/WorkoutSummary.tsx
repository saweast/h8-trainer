import { ArrowLeft, Trophy } from 'lucide-react'
import { format } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { exerciseName } from '@/data/exercises'
import { useExerciseMap } from '@/features/exercises/api'
import { currentLanguage } from '@/i18n'
import { dateLocale } from '@/lib/dates'
import { formatKg, formatVolume } from '@/lib/format'
import { detectPrs } from '@/lib/records'
import { minutesBetween } from '@/lib/time'
import { exercisesWithPr, workoutTotals } from '@/lib/workoutStats'
import { useExerciseRecords, type Workout } from './api'

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-card p-3 ring-1 ring-border">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="tabular mt-0.5 text-lg font-medium">{value}</p>
    </div>
  )
}

export function WorkoutSummary({ workout }: { workout: Workout }) {
  const { t } = useTranslation()
  const lang = currentLanguage()
  const { map: exercises } = useExerciseMap()
  const { data: records } = useExerciseRecords(workout.athleteId, workout.id)

  const stats = workout.exercises.map((e) => ({
    exerciseId: e.exerciseId,
    muscle: exercises.get(e.exerciseId)?.muscle ?? 'other',
    sets: e.sets,
  }))
  const totals = workoutTotals(stats)
  const prs = records ? exercisesWithPr(stats, records) : new Set<string>()
  const minutes = workout.finishedAt ? minutesBetween(workout.startedAt, workout.finishedAt) : 0
  const date = format(new Date(workout.startedAt), lang === 'en' ? 'EEEE, MMMM d · HH:mm' : 'EEEE, d MMMM · HH:mm', {
    locale: dateLocale(lang),
  })

  return (
    <div className="mx-auto min-h-dvh max-w-md px-4 pt-safe pb-[calc(2rem+env(safe-area-inset-bottom))]">
      <div className="flex h-14 items-center">
        <Button asChild variant="ghost" size="icon-touch" aria-label={t('common.back')} className="-ml-2">
          <Link to="/">
            <ArrowLeft />
          </Link>
        </Button>
      </div>

      <p className="text-xs text-muted-foreground first-letter:uppercase">{date}</p>
      <h1 className="font-heading text-[22px] leading-tight">{workout.title || t('workout.untitled')}</h1>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Stat label={t('workout.duration')} value={t('workout.minutes', { count: minutes })} />
        <Stat label={t('workout.volume')} value={`${formatVolume(totals.volumeKg, lang)} ${t('workout.kg')}`} />
        <Stat label={t('workout.sets')} value={String(totals.setCount)} />
        <Stat label={t('workout.records')} value={String(prs.size)} />
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {workout.exercises.map((item) => {
          const exercise = exercises.get(item.exerciseId)
          const previous = records?.get(item.exerciseId) ?? null
          return (
            <section key={item.id} className="rounded-2xl border bg-card px-4 py-3">
              <h2 className="flex items-center gap-2 text-[15px] font-medium">
                {exercise ? exerciseName(exercise, lang) : '…'}
                {prs.has(item.exerciseId) ? <Trophy className="size-4 text-pr" aria-label={t('workout.pr')} /> : null}
              </h2>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {item.sets.map((s) => {
                  const pr = detectPrs(s, previous).length > 0
                  return (
                    <li
                      key={s.id}
                      className={
                        s.isWarmup
                          ? 'tabular rounded-lg bg-secondary/60 px-2 py-1 text-xs text-muted-foreground'
                          : pr
                            ? 'tabular rounded-lg bg-pr-muted px-2 py-1 text-xs font-medium text-pr-text'
                            : 'tabular rounded-lg bg-secondary px-2 py-1 text-xs font-medium'
                      }
                    >
                      {formatKg(s.weightKg, lang)} × {s.reps}
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}
      </div>

      <Button asChild size="xl" className="mt-6 w-full">
        <Link to="/">{t('workout.home')}</Link>
      </Button>
    </div>
  )
}
