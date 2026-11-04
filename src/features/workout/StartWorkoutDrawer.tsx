import { ChevronRight, ClipboardList, Play, Plus, Repeat } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import {
  useIsMine,
  useNextProgramDay,
  usePrograms,
  useStartFromTemplate,
  useTemplates,
  useTemplateUsage,
} from '@/features/templates/api'
import { isSupabaseConfigured } from '@/lib/supabase'
import { useStartWorkout } from './api'

/** «Почати тренування» bottom sheet: next in program · empty workout · templates. */
export function StartWorkoutDrawer({ athleteId }: { athleteId: string | undefined }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const isMine = useIsMine()
  const [open, setOpen] = useState(false)
  const startEmpty = useStartWorkout(athleteId)
  const startTemplate = useStartFromTemplate(athleteId)
  const { data: templates } = useTemplates()
  const { data: programs } = usePrograms()
  const { data: usage } = useTemplateUsage(athleteId)
  const { data: next } = useNextProgramDay(athleteId, programs)
  const busy = startEmpty.isPending || startTemplate.isPending

  const sorted = [...(templates ?? [])].sort((a, b) => {
    const ua = usage?.get(a.id) ?? ''
    const ub = usage?.get(b.id) ?? ''
    return ua === ub ? a.name.localeCompare(b.name) : ub.localeCompare(ua)
  })

  const go = (workoutId: string) => {
    setOpen(false)
    navigate(`/workout/${workoutId}`)
  }
  const fail = () => toast.error(t('templates.startError'))

  const empty = () => {
    if (!isSupabaseConfigured) {
      toast(t('common.needsDatabase'))
      return
    }
    if (!athleteId || busy) return
    startEmpty.mutate({}, { onSuccess: go, onError: fail })
  }

  const fromTemplate = (templateId: string, programId?: string) => {
    if (!athleteId || busy) return
    startTemplate.mutate({ templateId, programId }, { onSuccess: go, onError: fail })
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button size="xl" className="w-full">
          <Play aria-hidden />
          {t('home.start')}
        </Button>
      </DrawerTrigger>
      <DrawerContent className="mx-auto max-h-[88dvh] max-w-md">
        <DrawerHeader className="group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
          <DrawerTitle className="font-heading text-lg">{t('start.title')}</DrawerTitle>
          <DrawerDescription>{t('start.description')}</DrawerDescription>
        </DrawerHeader>
        <div className="flex flex-col gap-3 overflow-y-auto px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          {next ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => fromTemplate(next.day.templateId, next.program.id)}
              className="rounded-2xl border-[1.5px] border-primary bg-lime-muted px-4 py-3 text-left transition-colors hover:bg-lime-muted/70"
            >
              <span className="flex items-center justify-between">
                <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground">
                  {t('programs.next')}
                </span>
                <ChevronRight className="size-4" aria-hidden />
              </span>
              <span className="mt-2 block text-[15px] font-medium">{next.day.name}</span>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Repeat className="size-3.5" aria-hidden />
                {next.program.name}
                {isMine(next.program.ownerId) ? '' : ` · ${t('start.fromTrainer')}`}
              </span>
            </button>
          ) : null}

          <button
            type="button"
            onClick={empty}
            disabled={busy}
            className="flex min-h-16 items-center gap-3 rounded-2xl border bg-card px-4 py-3 text-left transition-colors hover:bg-secondary"
          >
            <span className="flex size-10 items-center justify-center rounded-xl bg-secondary">
              <Plus className="size-5" aria-hidden />
            </span>
            <span className="flex-1">
              <span className="block text-sm font-medium">{t('start.empty')}</span>
              <span className="block text-xs text-muted-foreground">{t('start.emptyHint')}</span>
            </span>
            <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
          </button>

          <p className="mt-2 text-xs font-medium text-muted-foreground">{t('start.templates')}</p>
          {sorted.length ? (
            <ul className="divide-y rounded-2xl border bg-card">
              {sorted.map((tpl) => (
                <li key={tpl.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => fromTemplate(tpl.id)}
                    className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-secondary/50"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{tpl.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {t('templates.exercises', { count: tpl.exerciseCount })}
                      </span>
                    </span>
                    {isMine(tpl.ownerId) ? null : (
                      <span className="rounded-full bg-trainer-muted px-2 py-0.5 text-[11px] font-medium text-trainer-text">
                        {t('start.fromTrainer')}
                      </span>
                    )}
                    <Play className="size-4 text-muted-foreground" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex items-start gap-3 rounded-2xl bg-secondary/60 px-4 py-3 text-sm text-muted-foreground">
              <ClipboardList className="mt-0.5 size-4 shrink-0" aria-hidden />
              {t('start.noTemplates')}
            </div>
          )}

          <Button asChild variant="ghost" size="touch" className="justify-start text-lime-text dark:text-lime">
            <Link to="/templates/new" onClick={() => setOpen(false)}>
              <Plus aria-hidden />
              {t('start.newTemplate')}
            </Link>
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
