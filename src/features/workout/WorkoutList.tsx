import { ChevronRight } from 'lucide-react'
import { format } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { currentLanguage } from '@/i18n'
import { dateLocale } from '@/lib/dates'
import { formatVolume } from '@/lib/format'
import { minutesBetween } from '@/lib/time'
import type { WorkoutSummary } from './api'

/** Bordered rows: title, "date · minutes · volume", trainer-package chip. */
export function WorkoutList({
  workouts,
  hrefFor = (id) => `/workout/${id}`,
}: {
  workouts: WorkoutSummary[]
  /** Where a row leads; the admin's read-only view uses its own workout page. */
  hrefFor?: (workoutId: string) => string
}) {
  const { t } = useTranslation()
  const lang = currentLanguage()
  return (
    <ul className="divide-y rounded-2xl border bg-card">
      {workouts.map((w) => (
        <li key={w.id}>
          <Link to={hrefFor(w.id)} className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary/50">
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
