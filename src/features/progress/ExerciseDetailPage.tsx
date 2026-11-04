import { ArrowLeft, ChartLine, SearchX, Table2 } from 'lucide-react'
import { format } from 'date-fns'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { EmptyState } from '@/components/common/EmptyState'
import { SegmentedControl } from '@/components/common/SegmentedControl'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { exerciseName } from '@/data/exercises'
import { useMyAthleteId } from '@/features/athlete/useMyAthlete'
import { useAthlete } from '@/features/trainer/api'
import { useExerciseMap } from '@/features/exercises/api'
import { currentLanguage } from '@/i18n'
import { dateLocale } from '@/lib/dates'
import { formatKg, formatVolume } from '@/lib/format'
import { sessionStats } from '@/lib/sessionStats'
import { useExerciseSessions } from './api'
import { TrendChart, type TrendPoint } from './TrendChart'

type Metric = 'e1rm' | 'weight' | 'volume'

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="tabular mt-0.5 text-lg font-medium">{value}</p>
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

export function ExerciseDetailPage() {
  const { t } = useTranslation()
  const lang = currentLanguage()
  const locale = dateLocale(lang)
  const navigate = useNavigate()
  const { exerciseId } = useParams()
  const { data: myAthleteId } = useMyAthleteId()
  // A trainer opens a client's page with ?athlete=<id>; RLS decides whether that's allowed.
  const [params] = useSearchParams()
  const athleteId = params.get('athlete') ?? myAthleteId
  const { data: other } = useAthlete(params.get('athlete') ?? undefined)
  const { map: exercises, isPending: exercisesPending } = useExerciseMap()
  const { data: sessions, isPending } = useExerciseSessions(athleteId, exerciseId)
  const [metric, setMetric] = useState<Metric>('e1rm')
  const [asTable, setAsTable] = useState(false)

  const exercise = exerciseId ? exercises.get(exerciseId) : undefined
  const kg = t('workout.kg')

  const rows = useMemo(
    () => (sessions ?? []).map((s) => ({ ...s, stats: sessionStats(s.sets) })).filter((s) => s.stats.workingSets > 0),
    [sessions],
  )

  const records = useMemo(() => {
    let bestWeight: number | null = null
    let bestE1rm: number | null = null
    let topSet: { weightKg: number; reps: number } | null = null
    for (const r of rows) {
      const s = r.stats
      if (s.bestWeightKg !== null && (bestWeight === null || s.bestWeightKg > bestWeight)) bestWeight = s.bestWeightKg
      if (s.bestE1rmKg !== null && (bestE1rm === null || s.bestE1rmKg > bestE1rm)) bestE1rm = s.bestE1rmKg
      if (s.topSet && (!topSet || s.topSet.weightKg > topSet.weightKg || (s.topSet.weightKg === topSet.weightKg && s.topSet.reps > topSet.reps))) {
        topSet = s.topSet
      }
    }
    return { bestWeight, bestE1rm, topSet }
  }, [rows])

  const points: TrendPoint[] = rows.flatMap((r) => {
    const value = metric === 'e1rm' ? r.stats.bestE1rmKg : metric === 'weight' ? r.stats.bestWeightKg : r.stats.volumeKg
    return value === null || value === 0 ? [] : [{ label: format(new Date(r.startedAt), 'd MMM', { locale }), value }]
  })
  const metricLabel = t(`exerciseDetail.metric${metric === 'e1rm' ? 'E1rm' : metric === 'weight' ? 'Weight' : 'Volume'}`)
  const formatValue = (v: number) => (metric === 'volume' ? formatVolume(v, lang) : formatKg(Math.round(v * 10) / 10, lang))

  const back = () => (window.history.length > 1 ? navigate(-1) : navigate('/progress'))

  if (!exercisesPending && !exercise) {
    return <EmptyState icon={SearchX} title={t('exerciseDetail.notFound')} className="mt-6" />
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="-mt-1 flex items-start gap-1">
        <Button variant="ghost" size="icon-touch" onClick={back} aria-label={t('common.back')} className="-ml-2">
          <ArrowLeft />
        </Button>
        <div className="min-w-0 pt-1">
          {other ? <p className="truncate text-xs text-trainer-text">{other.displayName}</p> : null}
          <h1 className="font-heading text-xl leading-tight">{exercise ? exerciseName(exercise, lang) : '…'}</h1>
          {exercise ? (
            <p className="text-xs text-muted-foreground">
              {t(`equipment.${exercise.equipment}`)} · {t(`muscle.${exercise.muscle}`)}
            </p>
          ) : null}
        </div>
      </div>

      {athleteId && isPending ? (
        <div className="grid grid-cols-2 gap-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={ChartLine} title={t('exerciseDetail.emptyTitle')} body={t('exerciseDetail.emptyBody')} />
      ) : (
        <>
          <section aria-label={t('exerciseDetail.records')} className="grid grid-cols-2 gap-2">
            <Tile label={t('exerciseDetail.bestE1rm')} value={records.bestE1rm ? `${formatKg(records.bestE1rm, lang)} ${kg}` : '—'} />
            <Tile label={t('exerciseDetail.bestWeight')} value={records.bestWeight ? `${formatKg(records.bestWeight, lang)} ${kg}` : '—'} />
            <Tile
              label={t('exerciseDetail.topSet')}
              value={records.topSet ? `${formatKg(records.topSet.weightKg, lang)} × ${records.topSet.reps}` : '—'}
            />
            <Tile label={t('exerciseDetail.sessions')} value={String(rows.length)} />
          </section>

          <section className="rounded-2xl border bg-card p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-[15px] font-medium">
                {t('exerciseDetail.trend')} · {metricLabel}
              </h2>
              <Button
                variant="ghost"
                size="icon-touch"
                onClick={() => setAsTable((v) => !v)}
                aria-label={asTable ? t('exerciseDetail.showChart') : t('exerciseDetail.showTable')}
                aria-pressed={asTable}
              >
                {asTable ? <ChartLine /> : <Table2 />}
              </Button>
            </div>
            <SegmentedControl<Metric>
              ariaLabel={t('exerciseDetail.metricLabel')}
              value={metric}
              onChange={setMetric}
              options={[
                { value: 'e1rm', label: t('exerciseDetail.metricE1rm') },
                { value: 'weight', label: t('exerciseDetail.metricWeight') },
                { value: 'volume', label: t('exerciseDetail.metricVolume') },
              ]}
            />
            <div className="mt-3">
              {asTable ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="py-1.5 font-normal">{t('exerciseDetail.date')}</th>
                      <th className="py-1.5 text-right font-normal">{metricLabel}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {[...points].reverse().map((p, i) => (
                      <tr key={i}>
                        <td className="py-2">{p.label}</td>
                        <td className="tabular py-2 text-right font-medium">
                          {formatValue(p.value)} {kg}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : points.length >= 2 ? (
                <TrendChart points={points} seriesLabel={metricLabel} formatValue={formatValue} unit={kg} />
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">{t('exerciseDetail.chartNeedsTwo')}</p>
              )}
            </div>
            {metric === 'e1rm' ? <p className="mt-2 text-[11px] text-muted-foreground">{t('exerciseDetail.e1rmHint')}</p> : null}
          </section>

          <section>
            <h2 className="mb-2 text-[15px] font-medium">{t('exerciseDetail.history')}</h2>
            <ul className="divide-y rounded-2xl border bg-card">
              {[...rows].reverse().map((r) => (
                <li key={r.workoutId}>
                  <Link to={`/workout/${r.workoutId}`} className="block px-4 py-3 transition-colors hover:bg-secondary/50">
                    <p className="text-xs text-muted-foreground first-letter:uppercase">
                      {format(new Date(r.startedAt), lang === 'en' ? 'EEE, MMM d' : 'EEEEEE, d MMMM', { locale })}
                    </p>
                    <ul className="mt-1.5 flex flex-wrap gap-1.5">
                      {r.sets
                        .filter((s) => s.completedAt)
                        .map((s, i) => (
                          <li
                            key={i}
                            className={
                              s.isWarmup
                                ? 'tabular rounded-lg bg-secondary/60 px-2 py-1 text-xs text-muted-foreground'
                                : 'tabular rounded-lg bg-secondary px-2 py-1 text-xs font-medium'
                            }
                          >
                            {formatKg(s.weightKg, lang)} × {s.reps}
                          </li>
                        ))}
                    </ul>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  )
}
