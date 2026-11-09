import { ChevronRight, LayoutGrid, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAthletePlan, useNextPlanSlot, usePlan } from './api'
import { NewPlanDrawer } from './NewPlanDrawer'

/** Trainer's view of a client's plan: the active one with what's next, and a way to make a new one. */
export function ClientPlanSection({ athleteId }: { athleteId: string }) {
  const { t } = useTranslation()
  const { data: active, isPending } = useAthletePlan(athleteId)

  if (isPending) return <Skeleton className="h-20 rounded-2xl" />

  return (
    <section className="flex flex-col gap-2">
      {active ? <ActivePlanCard planId={active.id} name={active.name} weeks={active.weeks} /> : (
        <p className="rounded-2xl border border-dashed px-4 py-4 text-sm text-muted-foreground">{t('plan.noClientPlan')}</p>
      )}
      <NewPlanDrawer
        athleteId={athleteId}
        trigger={
          <Button variant="secondary" size="touch">
            <Plus aria-hidden />
            {active ? t('plan.newClientPlan') : t('plan.createClientPlan')}
          </Button>
        }
      />
    </section>
  )
}

export function ActivePlanCard({ planId, name, weeks }: { planId: string; name: string; weeks: number }) {
  const { t } = useTranslation()
  const { data: plan } = usePlan(planId)
  const { data: next } = useNextPlanSlot(planId)
  const dayIndex = plan?.days.findIndex((d) => d.id === next?.dayId) ?? -1
  const dayName = dayIndex >= 0 ? plan!.days[dayIndex].name || t('plan.dayN', { n: dayIndex + 1 }) : ''

  return (
    <Link to={`/plans/${planId}`} className="flex items-center gap-3 rounded-2xl border bg-card px-4 py-3 transition-colors hover:bg-secondary/50">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary">
        <LayoutGrid className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{name}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {t('plan.weeksCount', { count: weeks })}
          {next ? ` · ${t('plan.next')}: ${t('plan.weekN', { n: next.week })} · ${dayName}` : plan ? ` · ${t('plan.finished')}` : ''}
        </span>
      </span>
      <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
    </Link>
  )
}
