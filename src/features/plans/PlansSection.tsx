import { ChevronRight, LayoutGrid, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { useMyAthleteId } from '@/features/athlete/useMyAthlete'
import { useMode } from '@/features/mode/modeContext'
import { useIsMine } from '@/features/templates/api'
import { isSupabaseConfigured } from '@/lib/supabase'
import { useAthletePlan, usePlans } from './api'
import { ActivePlanCard } from './ClientPlanSection'
import { NewPlanDrawer } from './NewPlanDrawer'

/** On the templates page: my own active plan, plus (for trainers) reusable plan templates. */
export function PlansSection() {
  const { t } = useTranslation()
  const isMine = useIsMine()
  const { isTrainer } = useMode()
  const { data: athleteId } = useMyAthleteId()
  const { data: mine } = useAthletePlan(athleteId)
  const { data: plans } = usePlans()
  const templates = (plans ?? []).filter((p) => p.athleteId === null && isMine(p.ownerId))

  if (!isSupabaseConfigured) return null
  if (!isTrainer && !mine) return null

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-medium">{t('plan.sectionTitle')}</h2>
        {isTrainer ? (
          <NewPlanDrawer
            athleteId={null}
            trigger={
              <Button variant="ghost" size="touch">
                <Plus aria-hidden />
                {t('plan.newTemplate')}
              </Button>
            }
          />
        ) : null}
      </div>
      {mine ? <ActivePlanCard planId={mine.id} name={mine.name} weeks={mine.weeks} /> : null}
      {isTrainer ? (
        templates.length ? (
          <ul className="divide-y rounded-2xl border bg-card">
            {templates.map((p) => (
              <li key={p.id}>
                <Link to={`/plans/${p.id}`} className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary/50">
                  <LayoutGrid className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{t('plan.weeksDays', { weeks: p.weeks, days: p.dayCount })}</p>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl border border-dashed px-4 py-4 text-sm text-muted-foreground">{t('plan.noTemplates')}</p>
        )
      ) : null}
    </section>
  )
}
