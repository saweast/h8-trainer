import { ChevronRight, ClipboardList, Plus, Repeat } from 'lucide-react'
import { format } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { EmptyState } from '@/components/common/EmptyState'
import { PageHeader } from '@/components/common/PageHeader'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useMyAthleteId } from '@/features/athlete/useMyAthlete'
import { PlansSection } from '@/features/plans/PlansSection'
import { useIsMine, usePrograms, useTemplates, useTemplateUsage } from '@/features/templates/api'
import { useAssignments } from '@/features/trainer/api'
import { currentLanguage } from '@/i18n'
import { dateLocale } from '@/lib/dates'
import { isSupabaseConfigured } from '@/lib/supabase'

export function TemplatesPage() {
  const { t } = useTranslation()
  const lang = currentLanguage()
  const navigate = useNavigate()
  const isMine = useIsMine()
  const { data: athleteId } = useMyAthleteId()
  const { data: allTemplates, isPending } = useTemplates()
  const { data: allPrograms } = usePrograms()
  const { data: usage } = useTemplateUsage(athleteId)
  const { data: assignments } = useAssignments(athleteId)

  // Mine, plus what a trainer assigned to me (directly or as part of a program).
  const assignedPrograms = new Set(assignments?.flatMap((a) => (a.programId ? [a.programId] : [])))
  const programs = allPrograms?.filter((p) => isMine(p.ownerId) || assignedPrograms.has(p.id))
  const assignedTemplates = new Set([
    ...(assignments?.flatMap((a) => (a.templateId ? [a.templateId] : [])) ?? []),
    ...(programs?.flatMap((p) => p.days.map((d) => d.templateId)) ?? []),
  ])
  const templates = allTemplates?.filter((tpl) => isMine(tpl.ownerId) || assignedTemplates.has(tpl.id))

  const create = (path: string) => {
    if (!isSupabaseConfigured) {
      toast(t('common.needsDatabase'))
      return
    }
    navigate(path)
  }

  if (isSupabaseConfigured && isPending) {
    return (
      <div className="flex flex-col gap-3">
        <PageHeader title={t('templates.title')} />
        <Skeleton className="h-16 rounded-2xl" />
        <Skeleton className="h-16 rounded-2xl" />
      </div>
    )
  }

  if (!templates?.length) {
    return (
      <div>
        <PageHeader title={t('templates.title')} />
        <PlansSection />
        <EmptyState icon={ClipboardList} title={t('templates.emptyTitle')} body={t('templates.emptyBody')}>
          <Button size="xl" onClick={() => create('/templates/new')}>
            <Plus aria-hidden />
            {t('templates.create')}
          </Button>
        </EmptyState>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t('templates.title')}
        action={
          <Button variant="secondary" size="icon-touch" onClick={() => create('/templates/new')} aria-label={t('templates.create')}>
            <Plus />
          </Button>
        }
      />

      <PlansSection />

      <ul className="divide-y rounded-2xl border bg-card">
        {templates.map((tpl) => {
          const lastUsed = usage?.get(tpl.id)
          return (
            <li key={tpl.id}>
              <Link to={`/templates/${tpl.id}`} className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary/50">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{tpl.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('templates.exercises', { count: tpl.exerciseCount })}
                    {lastUsed
                      ? ` · ${t('templates.lastUsed', { date: format(new Date(lastUsed), 'd MMM', { locale: dateLocale(lang) }) })}`
                      : ''}
                  </p>
                </div>
                {isMine(tpl.ownerId) ? null : (
                  <span className="rounded-full bg-trainer-muted px-2 py-0.5 text-[11px] font-medium text-trainer-text">
                    {t('templates.fromTrainer')}
                  </span>
                )}
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          )
        })}
      </ul>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-medium">{t('programs.title')}</h2>
          <Button variant="ghost" size="touch" onClick={() => create('/programs/new')}>
            <Plus aria-hidden />
            {t('programs.create')}
          </Button>
        </div>
        {programs?.length ? (
          <ul className="divide-y rounded-2xl border bg-card">
            {programs.map((p) => (
              <li key={p.id}>
                <Link to={`/programs/${p.id}`} className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary/50">
                  <Repeat className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{p.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {t('programs.daysCount', { count: p.days.length })}
                      {p.days.length ? ` · ${p.days.map((d) => d.name).join(' → ')}` : ''}
                    </p>
                  </div>
                  {isMine(p.ownerId) ? null : (
                    <span className="rounded-full bg-trainer-muted px-2 py-0.5 text-[11px] font-medium text-trainer-text">
                      {t('templates.fromTrainer')}
                    </span>
                  )}
                  <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl border border-dashed px-4 py-4 text-sm text-muted-foreground">{t('programs.noDays')}</p>
        )}
      </section>
    </div>
  )
}
