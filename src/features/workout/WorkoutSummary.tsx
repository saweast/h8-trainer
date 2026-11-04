import { ArrowLeft, ClipboardList, EllipsisVertical, RefreshCw, Trash2, Trophy } from 'lucide-react'
import { format } from 'date-fns'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { exerciseName } from '@/data/exercises'
import { useExerciseMap } from '@/features/exercises/api'
import { useIsMine, useSaveTemplate, useTemplate } from '@/features/templates/api'
import { currentLanguage } from '@/i18n'
import { dateLocale } from '@/lib/dates'
import { formatKg, formatVolume } from '@/lib/format'
import { detectPrs } from '@/lib/records'
import { templateItemsFromWorkout, workoutMatchesTemplate } from '@/lib/templateFromWorkout'
import { minutesBetween } from '@/lib/time'
import { exercisesWithPr, workoutTotals } from '@/lib/workoutStats'
import { useExerciseRecords, useWorkoutActions, type Workout } from './api'
import { WorkoutComments } from './WorkoutComments'

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
  const navigate = useNavigate()
  const actions = useWorkoutActions(workout.id)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const isMine = useIsMine()
  const { data: template } = useTemplate(workout.templateId ?? undefined)
  const saveTemplate = useSaveTemplate()
  const ownTemplate = template && isMine(template.ownerId) ? template : null
  const offerUpdate = ownTemplate !== null && !workoutMatchesTemplate(ownTemplate.items, workout.exercises)

  const saveAsTemplate = () =>
    saveTemplate.mutate(
      { id: null, name: workout.title || t('workout.untitled'), notes: null, items: templateItemsFromWorkout(workout.exercises) },
      {
        onSuccess: (id) => navigate(`/templates/${id}`),
        onError: () => toast.error(t('templates.saveError')),
      },
    )

  // Keep the template's targets (weights, rest, notes) for exercises that stayed.
  const updateTemplate = () => {
    if (!ownTemplate) return
    const items = templateItemsFromWorkout(workout.exercises).map((item) => {
      const old = ownTemplate.items.find((i) => i.exerciseId === item.exerciseId)
      return old ? { ...item, targetWeightKg: old.targetWeightKg, restS: old.restS, notes: old.notes } : item
    })
    saveTemplate.mutate(
      { id: ownTemplate.id, name: ownTemplate.name, notes: ownTemplate.notes, items },
      {
        onSuccess: () => toast.success(t('templates.updated')),
        onError: () => toast.error(t('templates.saveError')),
      },
    )
  }

  const remove = () =>
    actions.discard.mutate(undefined, {
      onSuccess: () => navigate('/history', { replace: true }),
      onError: () => toast.error(t('workout.deleteError')),
    })

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
      <div className="flex h-14 items-center justify-between">
        <Button
          variant="ghost"
          size="icon-touch"
          aria-label={t('common.back')}
          className="-ml-2"
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}
        >
          <ArrowLeft />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-touch" aria-label={t('workout.moreActions')} className="-mr-2">
              <EllipsisVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
              <Trash2 />
              {t('workout.deleteWorkout')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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

      <WorkoutComments workoutId={workout.id} createdBy={workout.createdBy} />

      {offerUpdate ? (
        <div className="mt-4 rounded-2xl border bg-card p-3">
          <p className="mb-2 text-xs text-muted-foreground">{t('templates.updateHint')}</p>
          <Button variant="secondary" size="touch" className="w-full" disabled={saveTemplate.isPending} onClick={updateTemplate}>
            <RefreshCw aria-hidden />
            <span className="truncate">{t('templates.updateFromWorkout', { name: ownTemplate.name })}</span>
          </Button>
        </div>
      ) : !workout.templateId && workout.exercises.length ? (
        <Button variant="secondary" size="touch" className="mt-4 w-full" disabled={saveTemplate.isPending} onClick={saveAsTemplate}>
          <ClipboardList aria-hidden />
          {t('templates.saveFromWorkout')}
        </Button>
      ) : null}

      <Button asChild size="xl" className="mt-3 w-full">
        <Link to="/">{t('workout.home')}</Link>
      </Button>

      <Drawer open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DrawerContent className="mx-auto max-w-md">
          <DrawerHeader className="group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
            <DrawerTitle className="font-heading text-lg">{t('workout.deleteWorkout')}</DrawerTitle>
            <DrawerDescription>{t('workout.deleteConfirm')}</DrawerDescription>
          </DrawerHeader>
          <div className="flex flex-col gap-2 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
            <Button variant="destructive" size="xl" disabled={actions.discard.isPending} onClick={remove}>
              {t('workout.discardYes')}
            </Button>
            <Button variant="secondary" size="touch" onClick={() => setConfirmDelete(false)}>
              {t('common.cancel')}
            </Button>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  )
}
