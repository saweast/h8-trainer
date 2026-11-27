import { format } from 'date-fns'
import { SearchX } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { EmptyState } from '@/components/common/EmptyState'
import { SetChips } from '@/components/common/SetChips'
import { Skeleton } from '@/components/ui/skeleton'
import { exerciseName } from '@/data/exercises'
import { currentLanguage } from '@/i18n'
import { dateLocale } from '@/lib/dates'
import { formatVolume } from '@/lib/format'
import { minutesBetween } from '@/lib/time'
import { useAdminWorkout } from './api'
import { BackHeader } from './BackHeader'

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-card p-3 ring-1 ring-border">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="tabular mt-0.5 text-lg font-medium">{value}</p>
    </div>
  )
}

/** Read-only workout details for the admin. */
export function AdminWorkoutPage() {
  const { t } = useTranslation()
  const lang = currentLanguage()
  const { workoutId } = useParams()
  const { data: workout, isPending, isError } = useAdminWorkout(workoutId)

  if (isPending) return <Skeleton className="h-64 rounded-2xl" />
  if (isError || !workout) {
    return (
      <div className="flex flex-col gap-4">
        <BackHeader fallback="/admin/users">
          <span />
        </BackHeader>
        <EmptyState icon={SearchX} title={t('workout.notFound')} />
      </div>
    )
  }

  const done = workout.exercises.flatMap((e) => e.sets.filter((s) => s.completed && !s.isWarmup))
  const volume = done.reduce((sum, s) => sum + s.weightKg * s.reps, 0)
  const setCount = done.filter((s) => !s.isDrop).length // a drop chain is one set
  const minutes = workout.finishedAt ? minutesBetween(workout.startedAt, workout.finishedAt) : 0
  const date = format(new Date(workout.startedAt), lang === 'en' ? 'EEEE, MMMM d · HH:mm' : 'EEEE, d MMMM · HH:mm', {
    locale: dateLocale(lang),
  })

  return (
    <div className="flex flex-col gap-4">
      <BackHeader fallback="/admin/users">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-muted-foreground">{workout.athleteName}</p>
          <h1 className="font-heading truncate text-lg leading-tight">{workout.title || t('workout.untitled')}</h1>
        </div>
      </BackHeader>

      <p className="-mt-2 text-xs text-muted-foreground first-letter:uppercase">
        {date}
        {workout.membershipId ? ` · ${t('home.trainerPackage')}` : ''}
      </p>

      <div className="grid grid-cols-3 gap-2">
        <Stat label={t('workout.duration')} value={t('workout.minutes', { count: minutes })} />
        <Stat label={t('workout.volume')} value={`${formatVolume(volume, lang)} ${t('workout.kg')}`} />
        <Stat label={t('workout.sets')} value={String(setCount)} />
      </div>

      {workout.notes ? <p className="rounded-2xl border bg-card px-4 py-3 text-sm whitespace-pre-wrap">{workout.notes}</p> : null}

      <div className="flex flex-col gap-2">
        {workout.exercises.map((item) => (
          <section key={item.id} className="rounded-2xl border bg-card px-4 py-3">
            <h2 className="text-[15px] font-medium">{exerciseName(item, lang)}</h2>
            {item.notes ? <p className="mt-0.5 text-xs text-muted-foreground">{item.notes}</p> : null}
            <SetChips sets={item.sets.filter((s) => s.completed)} className="mt-1.5" />
          </section>
        ))}
      </div>

      <p className="text-center text-xs text-muted-foreground">{t('admin.readOnly')}</p>
    </div>
  )
}
