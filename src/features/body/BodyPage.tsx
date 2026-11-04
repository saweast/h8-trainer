import { ArrowLeft, ChartLine, ChevronRight, Plus, Ruler, Table2 } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { Chip } from '@/components/common/Chip'
import { EmptyState } from '@/components/common/EmptyState'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useMyAthleteId } from '@/features/athlete/useMyAthlete'
import { useAthlete } from '@/features/trainer/api'
import { TrendChart } from '@/features/progress/TrendChart'
import { currentLanguage } from '@/i18n'
import { BODY_METRICS, latestWithDelta, metricByKey, metricSeries, type BodyEntry, type BodyMetricKey } from '@/lib/body'
import { dateLocale } from '@/lib/dates'
import { formatKg } from '@/lib/format'
import { isSupabaseConfigured } from '@/lib/supabase'
import { useBodyMeasurements } from './api'
import { MeasurementDrawer } from './MeasurementDrawer'

export function BodyPage() {
  const { t } = useTranslation()
  const lang = currentLanguage()
  const locale = dateLocale(lang)
  const navigate = useNavigate()
  const { data: myAthleteId } = useMyAthleteId()
  // A trainer opens a client's page with ?athlete=<id>; RLS decides whether that's allowed.
  const [params] = useSearchParams()
  const athleteId = params.get('athlete') ?? myAthleteId
  const { data: other } = useAthlete(params.get('athlete') ?? undefined)
  const { data: entries, isPending } = useBodyMeasurements(athleteId)
  // undefined = drawer closed, null = new measurement
  const [editing, setEditing] = useState<BodyEntry | null | undefined>(undefined)
  const [metric, setMetric] = useState<BodyMetricKey>('weightKg')
  const [asTable, setAsTable] = useState(false)

  const unit = (key: BodyMetricKey) => t(`body.units.${metricByKey[key].unit}`)
  const fmt = (v: number) => formatKg(v, lang)
  const shortDate = (d: string) => format(parseISO(d), 'd MMM', { locale })

  const measured = useMemo(() => BODY_METRICS.filter((m) => entries?.some((e) => e[m.key] !== null)), [entries])
  const activeMetric = measured.some((m) => m.key === metric) ? metric : (measured[0]?.key ?? 'weightKg')
  const points = metricSeries(entries ?? [], activeMetric).map((p) => ({ label: shortDate(p.measuredAt), value: p.value }))

  const add = () => {
    if (!isSupabaseConfigured) {
      toast(t('common.needsDatabase'))
      return
    }
    setEditing(null)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="-mt-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-touch"
            className="-ml-2"
            aria-label={t('common.back')}
            onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/progress'))}
          >
            <ArrowLeft />
          </Button>
          <div className="min-w-0">
            {other ? <p className="truncate text-xs text-muted-foreground">{other.displayName}</p> : null}
            <h1 className="font-heading text-[22px] leading-tight">{t('body.title')}</h1>
          </div>
        </div>
        {entries?.length ? (
          <Button variant="secondary" size="icon-touch" onClick={add} aria-label={t('body.add')}>
            <Plus />
          </Button>
        ) : null}
      </div>

      {athleteId && isPending ? (
        <div className="grid grid-cols-2 gap-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      ) : !entries?.length ? (
        <EmptyState icon={Ruler} title={t('body.emptyTitle')} body={t('body.emptyBody')}>
          <Button size="xl" onClick={add}>
            <Plus aria-hidden />
            {t('body.add')}
          </Button>
        </EmptyState>
      ) : (
        <>
          <section aria-label={t('body.latest')} className="grid grid-cols-2 gap-2">
            {measured.map((m) => {
              const latest = latestWithDelta(entries, m.key)!
              return (
                <div key={m.key} className="rounded-2xl border bg-card p-3">
                  <p className="text-xs text-muted-foreground">{t(`body.metrics.${m.key}`)}</p>
                  <p className="tabular mt-0.5 text-lg font-medium">
                    {fmt(latest.value)} {unit(m.key)}
                  </p>
                  <p className="tabular text-[11px] text-muted-foreground">
                    {latest.delta !== null && latest.delta !== 0
                      ? `${latest.delta > 0 ? '+' : '−'}${fmt(Math.abs(latest.delta))} ${unit(m.key)} ${t('body.sincePrevious')}`
                      : shortDate(latest.measuredAt)}
                  </p>
                </div>
              )
            })}
          </section>

          <section className="rounded-2xl border bg-card p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-[15px] font-medium">
                {t('body.trend')} · {t(`body.metrics.${activeMetric}`)}
              </h2>
              <Button
                variant="ghost"
                size="icon-touch"
                onClick={() => setAsTable((v) => !v)}
                aria-pressed={asTable}
                aria-label={asTable ? t('exerciseDetail.showChart') : t('exerciseDetail.showTable')}
              >
                {asTable ? <ChartLine /> : <Table2 />}
              </Button>
            </div>
            <div role="radiogroup" aria-label={t('body.metricLabel')} className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none]">
              {measured.map((m) => (
                <Chip key={m.key} role="radio" aria-checked={activeMetric === m.key} active={activeMetric === m.key} onClick={() => setMetric(m.key)}>
                  {t(`body.metrics.${m.key}`)}
                </Chip>
              ))}
            </div>
            <div className="mt-3">
              {asTable ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="py-1.5 font-normal">{t('body.date')}</th>
                      <th className="py-1.5 text-right font-normal">{t(`body.metrics.${activeMetric}`)}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {[...points].reverse().map((p, i) => (
                      <tr key={i}>
                        <td className="py-2">{p.label}</td>
                        <td className="tabular py-2 text-right font-medium">
                          {fmt(p.value)} {unit(activeMetric)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : points.length >= 2 ? (
                <TrendChart points={points} seriesLabel={t(`body.metrics.${activeMetric}`)} formatValue={fmt} unit={unit(activeMetric)} />
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">{t('body.chartNeedsTwo')}</p>
              )}
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-[15px] font-medium">{t('body.history')}</h2>
            <ul className="divide-y rounded-2xl border bg-card">
              {entries.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => setEditing(e)}
                    className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium first-letter:uppercase">
                        {format(parseISO(e.measuredAt), lang === 'en' ? 'EEE, MMM d' : 'EEEEEE, d MMMM', { locale })}
                      </p>
                      <p className="tabular truncate text-xs text-muted-foreground">
                        {BODY_METRICS.filter((m) => e[m.key] !== null)
                          .map((m) => `${t(`body.metrics.${m.key}`)} ${fmt(e[m.key]!)} ${unit(m.key)}`)
                          .join(' · ')}
                      </p>
                    </div>
                    <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <MeasurementDrawer athleteId={athleteId} entry={editing} onClose={() => setEditing(undefined)} />
    </div>
  )
}
