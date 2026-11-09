import { ChevronRight, FilePlus2, LayoutGrid, Repeat, UserRound } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer'
import { useIsMine, usePrograms, useTemplates } from '@/features/templates/api'
import { useTrainerClients } from '@/features/trainer/api'
import { useCopyPlan, useCreatePlanFromTemplates, usePlans } from './api'

interface NewPlanDrawerProps {
  /** null → a plan template. */
  athleteId: string | null
  trigger: ReactNode
}

const DEFAULT_WEEKS = 4

/** «Новий план»: from scratch, from a plan template, from an old program/template, or another client's plan. */
export function NewPlanDrawer({ athleteId, trigger }: NewPlanDrawerProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const isMine = useIsMine()
  const [open, setOpen] = useState(false)
  const { data: plans } = usePlans()
  const { data: programs } = usePrograms()
  const { data: templates } = useTemplates()
  const { data: clients } = useTrainerClients(athleteId !== null)
  const copy = useCopyPlan()
  const fromTemplates = useCreatePlanFromTemplates()
  const busy = copy.isPending || fromTemplates.isPending

  const go = (id: string) => {
    setOpen(false)
    navigate(`/plans/${id}`)
  }
  const fail = () => toast.error(t('templates.saveError'))

  const planTemplates = (plans ?? []).filter((p) => p.athleteId === null && isMine(p.ownerId))
  const clientName = (id: string) => clients?.find((c) => c.athleteId === id)?.displayName
  const otherClientPlans = (plans ?? []).filter(
    (p) => p.athleteId !== null && p.athleteId !== athleteId && isMine(p.ownerId) && !p.archivedAt && clientName(p.athleteId),
  )
  const myPrograms = (programs ?? []).filter((p) => isMine(p.ownerId) && p.days.length)
  const myTemplates = (templates ?? []).filter((tpl) => isMine(tpl.ownerId) && tpl.exerciseCount)

  const item = (key: string, title: string, sub: string, onClick: () => void) => (
    <li key={key}>
      <button
        type="button"
        disabled={busy}
        onClick={onClick}
        className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-secondary/50"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{title}</span>
          <span className="block truncate text-xs text-muted-foreground">{sub}</span>
        </span>
        <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
      </button>
    </li>
  )

  const section = (icon: ReactNode, title: string, items: ReactNode[]) =>
    items.length ? (
      <section className="flex flex-col gap-1.5">
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          {icon}
          {title}
        </p>
        <ul className="divide-y rounded-2xl border bg-card">{items}</ul>
      </section>
    ) : null

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>{trigger}</DrawerTrigger>
      <DrawerContent className="mx-auto max-h-[88dvh] max-w-md">
        <DrawerHeader className="group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
          <DrawerTitle className="font-heading text-lg">{athleteId ? t('plan.newClientPlan') : t('plan.newTemplateTitle')}</DrawerTitle>
          <DrawerDescription>{athleteId ? t('plan.newClientPlanHint') : t('plan.newTemplateHint')}</DrawerDescription>
        </DrawerHeader>
        <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <ul className="rounded-2xl border bg-card">
            {item('blank', t('plan.fromScratch'), t('plan.fromScratchHint'), () => {
              setOpen(false)
              navigate(athleteId ? `/plans/new?athlete=${athleteId}` : '/plans/new')
            })}
          </ul>

          {section(
            <LayoutGrid className="size-3.5" aria-hidden />,
            t('plan.fromPlanTemplate'),
            planTemplates.map((p) =>
              item(p.id, p.name, t('plan.weeksDays', { weeks: p.weeks, days: p.dayCount }), () =>
                copy.mutate({ sourceId: p.id, athleteId }, { onSuccess: go, onError: fail }),
              ),
            ),
          )}

          {athleteId
            ? section(
                <UserRound className="size-3.5" aria-hidden />,
                t('plan.fromOtherClient'),
                otherClientPlans.map((p) =>
                  item(p.id, p.name, clientName(p.athleteId!) ?? '', () =>
                    copy.mutate({ sourceId: p.id, athleteId }, { onSuccess: go, onError: fail }),
                  ),
                ),
              )
            : null}

          {section(
            <Repeat className="size-3.5" aria-hidden />,
            t('plan.fromProgram'),
            [
              ...myPrograms.map((p) =>
                item(`p-${p.id}`, p.name, p.days.map((d) => d.name).join(' · '), () =>
                  fromTemplates.mutate(
                    { athleteId, name: p.name, weeks: DEFAULT_WEEKS, templateIds: p.days.map((d) => d.templateId) },
                    { onSuccess: go, onError: fail },
                  ),
                ),
              ),
              ...myTemplates.map((tpl) =>
                item(`t-${tpl.id}`, tpl.name, t('templates.exercises', { count: tpl.exerciseCount }), () =>
                  fromTemplates.mutate(
                    { athleteId, name: tpl.name, weeks: DEFAULT_WEEKS, templateIds: [tpl.id] },
                    { onSuccess: go, onError: fail },
                  ),
                ),
              ),
            ],
          )}

          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <FilePlus2 className="mt-px size-3.5 shrink-0" aria-hidden />
            {athleteId ? t('plan.replacesActive') : t('plan.templateCopiesHint')}
          </p>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
