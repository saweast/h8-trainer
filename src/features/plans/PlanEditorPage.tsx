import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Archive,
  ChevronDown,
  Copy,
  CopyPlus,
  EllipsisVertical,
  Play,
  Plus,
  Repeat,
  Trash2,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { Chip } from '@/components/common/Chip'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { exerciseName } from '@/data/exercises'
import { useMyAthleteId } from '@/features/athlete/useMyAthlete'
import { useExerciseMap, type Exercise } from '@/features/exercises/api'
import { ExercisePicker } from '@/features/exercises/ExercisePicker'
import { useIsMine } from '@/features/templates/api'
import { currentLanguage } from '@/i18n'
import { formatVolume } from '@/lib/format'
import {
  addWeek,
  copyWeek,
  emptyDay,
  extendCycle,
  moveRow,
  newRow,
  removeWeek,
  setCell,
  weekTotals,
  type PlanDraft,
  type PlanRowDraft,
} from '@/lib/planGrid'
import type { SpecSet } from '@/lib/setSpec'
import { cn } from '@/lib/utils'
import {
  useArchivePlan,
  useCopyPlan,
  useDeletePlan,
  useNextPlanSlot,
  usePlan,
  usePlanFacts,
  useSavePlan,
  useStartFromPlan,
  type Plan,
  type PlanFact,
} from './api'
import { CellDrawer, type CellTarget } from './CellDrawer'
import { CellView, InlineCellEditor } from './PlanCell'
import { usePlanFeedback } from './feedback'
import { CellFeedbackThread, PlanFeedback } from './PlanFeedback'

/** /plans/new[?athlete=…] and /plans/:planId */
export function PlanEditorPage() {
  const { planId } = useParams()
  const [params] = useSearchParams()
  const isNew = !planId || planId === 'new'
  const { data: plan, isPending, isError } = usePlan(isNew ? undefined : planId)
  const { t } = useTranslation()

  if (!isNew && isPending) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-3 px-4 pt-20">
        <Skeleton className="h-11 rounded-xl" />
        <Skeleton className="h-60 rounded-2xl" />
      </div>
    )
  }
  if (!isNew && (isError || !plan)) {
    return <p className="mx-auto max-w-md px-4 pt-20 text-center text-sm text-muted-foreground">{t('workout.notFound')}</p>
  }
  return <Editor key={plan?.id ?? 'new'} plan={isNew ? undefined : plan} athleteId={isNew ? params.get('athlete') : plan!.athleteId} />
}

function blankDraft(t: (k: string, o?: Record<string, unknown>) => string): PlanDraft {
  return { name: '', notes: '', weeks: 4, days: [emptyDay(t('plan.dayN', { n: 1 }))] }
}

const toDraft = (plan: Plan): PlanDraft => ({ name: plan.name, notes: plan.notes, weeks: plan.weeks, days: plan.days })

type Editing = { rowId: string; week: number } | null

function Editor({ plan, athleteId }: { plan: Plan | undefined; athleteId: string | null }) {
  const { t } = useTranslation()
  const lang = currentLanguage()
  const navigate = useNavigate()
  const isMine = useIsMine()
  const { map: exercises } = useExerciseMap()
  const { data: myAthleteId } = useMyAthleteId()
  const save = useSavePlan()
  const copy = useCopyPlan()
  const archive = useArchivePlan()
  const remove = useDeletePlan()
  const start = useStartFromPlan(athleteId ?? undefined)

  const [planId] = useState(() => plan?.id ?? crypto.randomUUID())
  const [initial, setInitial] = useState(() => (plan ? toDraft(plan) : blankDraft(t)))
  const [draft, setDraft] = useState(initial)
  const [nameError, setNameError] = useState(false)
  const [inline, setInline] = useState<Editing>(null)
  const [drawer, setDrawer] = useState<Editing>(null)
  const [pickerDay, setPickerDay] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [dayId, setDayId] = useState(() => draft.days[0]?.id ?? '')

  const readOnly = plan !== undefined && !isMine(plan.ownerId)
  const saved = plan !== undefined
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial)
  const { data: facts } = usePlanFacts(saved ? planId : undefined, athleteId)
  const { data: next } = useNextPlanSlot(saved && athleteId ? planId : undefined)
  const feedback = usePlanFeedback(saved ? planId : undefined, facts)
  const canStart =
    plan !== undefined && athleteId !== null && !plan.archivedAt && (athleteId === myAthleteId || isMine(plan.ownerId))
  const busy = save.isPending || copy.isPending || archive.isPending || remove.isPending

  const ex = (id: string) => exercises.get(id)
  const nameOf = (id: string) => {
    const e = ex(id)
    return e ? exerciseName(e, lang) : '…'
  }
  const bodyweight = (id: string) => ex(id)?.equipment === 'bodyweight'
  const stepFor = (id: string) => ex(id)?.weightStepKg ?? 2.5
  const weeks = Array.from({ length: draft.weeks }, (_, i) => i + 1)
  const flatRows = draft.days.flatMap((d) => d.rows.map((r) => ({ row: r, day: d })))
  const currentWeek = next?.week ?? draft.weeks
  const selectedDay = draft.days.find((d) => d.id === dayId) ?? draft.days[0]

  const factOf = (rowId: string, week: number): PlanFact | undefined => facts?.get(`${rowId}:${week}`)
  const update = (fn: (d: PlanDraft) => PlanDraft) => setDraft((d) => fn(d))
  const updateDay = (id: string, fn: (rows: PlanRowDraft[]) => PlanRowDraft[]) =>
    update((d) => ({ ...d, days: d.days.map((day) => (day.id === id ? { ...day, rows: fn(day.rows) } : day)) }))

  const onSave = async () => {
    if (!draft.name.trim()) {
      setNameError(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    try {
      await save.mutateAsync({ id: planId, athleteId, draft })
      setInitial(draft)
      toast.success(t('plan.saved'))
      if (!saved) navigate(`/plans/${planId}`, { replace: true })
    } catch {
      toast.error(t('templates.saveError'))
    }
  }

  const onStart = (week: number, day: string) => {
    if (!saved || !athleteId) return
    start.mutate(
      { planId, week, dayId: day },
      { onSuccess: (id) => navigate(`/workout/${id}`), onError: () => toast.error(t('templates.startError')) },
    )
  }

  const back = () => {
    if (dirty && !window.confirm(t('templates.unsaved'))) return
    if (window.history.length > 1) navigate(-1)
    else navigate(!athleteId ? '/templates' : athleteId === myAthleteId ? '/' : `/trainer/clients/${athleteId}`)
  }

  const moveInline = (rowId: string, week: number, dir: 'down' | 'right' | 'left') => {
    if (dir === 'right') return setInline(week < draft.weeks ? { rowId, week: week + 1 } : null)
    if (dir === 'left') return setInline(week > 1 ? { rowId, week: week - 1 } : null)
    const i = flatRows.findIndex((f) => f.row.id === rowId)
    setInline(flatRows[i + 1] ? { rowId: flatRows[i + 1].row.id, week } : null)
  }

  const drawerTarget = ((): CellTarget | null => {
    if (!drawer) return null
    const found = flatRows.find((f) => f.row.id === drawer.rowId)
    if (!found) return null
    return {
      rowId: found.row.id,
      week: drawer.week,
      dayId: found.day.id,
      dayName: found.day.name || t('plan.dayN', { n: draft.days.indexOf(found.day) + 1 }),
      exerciseName: nameOf(found.row.exerciseId),
      bodyweight: bodyweight(found.row.exerciseId),
      planned: found.row.cells[drawer.week],
      previous: found.row.cells[drawer.week - 1],
      fact: factOf(found.row.id, drawer.week),
    }
  })()

  const weekMenu = (week: number) => (
    <WeekMenu
      week={week}
      weeks={draft.weeks}
      totals={weekTotals(draft, week)}
      readOnly={readOnly}
      onCopy={(step) => update((d) => copyWeek(d, week, week + 1, step ? stepFor : undefined))}
      onRemove={() => update((d) => removeWeek(d, week))}
    />
  )

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b bg-background/95 pt-safe backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex h-14 max-w-md items-center justify-between gap-2 px-2 md:max-w-6xl">
          <Button variant="ghost" size="icon-touch" onClick={back} aria-label={t('common.back')}>
            <ArrowLeft />
          </Button>
          <p className="truncate text-[15px] font-medium">
            {athleteId ? t('plan.clientPlanTitle') : saved ? t('plan.templateTitle') : t('plan.newTemplateTitle')}
          </p>
          <div className="flex items-center">
            {readOnly ? (
              <span className="w-11" />
            ) : (
              <>
                <Button size="touch" onClick={() => void onSave()} disabled={busy || (!dirty && saved)}>
                  {t('templates.save')}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-touch" aria-label={t('workout.moreActions')}>
                      <EllipsisVertical />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => update((d) => extendCycle(d, Math.min(d.weeks, 4), stepFor))}>
                      <Repeat />
                      {t('plan.extendCycle')}
                    </DropdownMenuItem>
                    {saved && athleteId ? (
                      <DropdownMenuItem
                        disabled={dirty}
                        onSelect={() =>
                          copy.mutate(
                            { sourceId: planId, athleteId: null, name: draft.name },
                            { onSuccess: () => toast.success(t('plan.savedAsTemplate')), onError: () => toast.error(t('templates.saveError')) },
                          )
                        }
                      >
                        <Copy />
                        {t('plan.saveAsTemplate')}
                      </DropdownMenuItem>
                    ) : null}
                    {saved && athleteId && !plan?.archivedAt ? (
                      <DropdownMenuItem
                        onSelect={() =>
                          archive.mutate(planId, {
                            onSuccess: () => {
                              toast.success(t('plan.archived'))
                              navigate(`/trainer/clients/${athleteId}`, { replace: true })
                            },
                          })
                        }
                      >
                        <Archive />
                        {t('plan.archive')}
                      </DropdownMenuItem>
                    ) : null}
                    {saved ? (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                          <Trash2 />
                          {t('plan.delete')}
                        </DropdownMenuItem>
                      </>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-md flex-col gap-4 px-4 pt-4 pb-[calc(2rem+env(safe-area-inset-bottom))] md:max-w-6xl">
        {readOnly ? <p className="rounded-xl bg-trainer-muted px-3 py-2 text-sm text-trainer-text">{t('plan.readOnly')}</p> : null}
        {plan?.archivedAt ? <p className="rounded-xl bg-secondary px-3 py-2 text-sm text-muted-foreground">{t('plan.archivedNote')}</p> : null}

        <div className="flex flex-col gap-1.5 md:max-w-md">
          <Input
            value={draft.name}
            onChange={(e) => {
              setDraft((d) => ({ ...d, name: e.target.value }))
              setNameError(false)
            }}
            placeholder={t('plan.namePlaceholder')}
            aria-label={t('plan.name')}
            aria-invalid={nameError}
            readOnly={readOnly}
            maxLength={80}
            className="font-heading h-12 rounded-xl text-base"
          />
          {nameError ? <p className="text-xs text-destructive">{t('plan.nameRequired')}</p> : null}
        </div>

        {canStart && next && !dirty ? (
          <NextSlotCard
            week={next.week}
            dayName={(() => {
              const i = draft.days.findIndex((d) => d.id === next.dayId)
              return draft.days[i]?.name || t('plan.dayN', { n: i + 1 })
            })()}
            busy={start.isPending}
            onStart={() => onStart(next.week, next.dayId)}
          />
        ) : null}

        {/* Weeks: chips with per-week actions (both layouts) */}
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 md:hidden">
          {weeks.map((w) => (
            <span key={w}>{weekMenu(w)}</span>
          ))}
          {readOnly ? null : (
            <Chip onClick={() => update((d) => addWeek(d))} aria-label={t('plan.addWeek')}>
              <Plus className="size-4" aria-hidden />
              {t('plan.week')}
            </Chip>
          )}
        </div>

        {/* Desktop: the spreadsheet */}
        <div className="hidden overflow-x-auto rounded-2xl border bg-card md:block">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 w-60 min-w-60 border-b bg-card px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                  {t('plan.exercise')}
                </th>
                {weeks.map((w) => (
                  <th key={w} className="min-w-48 border-b border-l px-2 py-1.5 text-left">
                    {weekMenu(w)}
                  </th>
                ))}
                {readOnly ? null : (
                  <th className="w-12 border-b border-l px-1">
                    <Button variant="ghost" size="icon" onClick={() => update((d) => addWeek(d))} aria-label={t('plan.addWeek')}>
                      <Plus />
                    </Button>
                  </th>
                )}
              </tr>
            </thead>
            {draft.days.map((day, dayIndex) => (
              <tbody key={day.id}>
                <tr>
                  <td colSpan={draft.weeks + 2} className="border-b bg-secondary/50 px-2 py-1.5">
                    <DayHeader
                      name={day.name}
                      fallback={t('plan.dayN', { n: dayIndex + 1 })}
                      readOnly={readOnly}
                      onRename={(name) => update((d) => ({ ...d, days: d.days.map((x) => (x.id === day.id ? { ...x, name } : x)) }))}
                      onAddExercise={() => setPickerDay(day.id)}
                      onRemove={draft.days.length > 1 ? () => update((d) => ({ ...d, days: d.days.filter((x) => x.id !== day.id) })) : undefined}
                    />
                  </td>
                </tr>
                {day.rows.map((row) => (
                  <tr key={row.id} className="align-top">
                    <td className="sticky left-0 z-10 border-b bg-card px-3 py-2">
                      <RowLabel
                        name={nameOf(row.exerciseId)}
                        readOnly={readOnly}
                        onMove={(delta) => update((d) => moveRow(d, row.id, delta))}
                        onRemove={() => updateDay(day.id, (rows) => rows.filter((r) => r.id !== row.id))}
                      />
                    </td>
                    {weeks.map((w) => {
                      const editingHere = inline?.rowId === row.id && inline.week === w
                      const isNext = next?.dayId === day.id && next.week === w
                      return (
                        <td key={w} className={cn('border-b border-l px-2 py-1.5', isNext && 'bg-lime-muted/60', w === currentWeek && !isNext && 'bg-secondary/30')}>
                          {editingHere ? (
                            <InlineCellEditor
                              initial={row.cells[w]}
                              bodyweight={bodyweight(row.exerciseId)}
                              onCommit={(sets) => update((d) => setCell(d, row.id, w, sets))}
                              onCancel={() => setInline(null)}
                              onMove={(dir) => moveInline(row.id, w, dir)}
                            />
                          ) : (
                            <button
                              type="button"
                              className="block w-full rounded-md px-1 py-0.5 text-left hover:bg-secondary/70"
                              onClick={() => (readOnly ? setDrawer({ rowId: row.id, week: w }) : setInline({ rowId: row.id, week: w }))}
                              onDoubleClick={() => setDrawer({ rowId: row.id, week: w })}
                            >
                              <CellView
                                planned={row.cells[w]}
                                fact={factOf(row.id, w)}
                                feedback={feedback.forCell(row.id, w)}
                                bodyweight={bodyweight(row.exerciseId)}
                                isNext={isNext}
                              />
                            </button>
                          )}
                        </td>
                      )
                    })}
                    {readOnly ? null : <td className="border-b border-l" />}
                  </tr>
                ))}
                {day.rows.length ? null : (
                  <tr>
                    <td colSpan={draft.weeks + 2} className="border-b px-3 py-3 text-sm text-muted-foreground">
                      {t('plan.noRows')}
                    </td>
                  </tr>
                )}
              </tbody>
            ))}
            <tfoot>
              <tr>
                <td className="sticky left-0 z-10 bg-card px-3 py-2 text-xs text-muted-foreground">{t('plan.weekVolume')}</td>
                {weeks.map((w) => {
                  const totals = weekTotals(draft, w)
                  return (
                    <td key={w} className="tabular border-l px-3 py-2 text-xs text-muted-foreground">
                      {totals.workingSets ? `${formatVolume(totals.volumeKg, lang)} ${t('workout.kg')} · ${t('plan.setsCount', { count: totals.workingSets })}` : '—'}
                    </td>
                  )
                })}
                {readOnly ? null : <td className="border-l" />}
              </tr>
            </tfoot>
          </table>
          {readOnly ? null : (
            <p className="border-t px-3 py-2 text-xs text-muted-foreground">{t('plan.keyboardHint')}</p>
          )}
        </div>

        {/* Mobile: one day at a time, weeks swipe sideways */}
        <div className="flex flex-col gap-3 md:hidden">
          {draft.days.length > 1 ? (
            <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4">
              {draft.days.map((d, i) => (
                <Chip key={d.id} active={d.id === selectedDay?.id} onClick={() => setDayId(d.id)}>
                  {d.name || t('plan.dayN', { n: i + 1 })}
                </Chip>
              ))}
            </div>
          ) : null}
          {selectedDay ? (
            <>
              <div className="rounded-2xl bg-secondary/50 px-2 py-1.5">
                <DayHeader
                  name={selectedDay.name}
                  fallback={t('plan.dayN', { n: draft.days.indexOf(selectedDay) + 1 })}
                  readOnly={readOnly}
                  onRename={(name) => update((d) => ({ ...d, days: d.days.map((x) => (x.id === selectedDay.id ? { ...x, name } : x)) }))}
                  onAddExercise={() => setPickerDay(selectedDay.id)}
                  onRemove={
                    draft.days.length > 1
                      ? () => {
                          update((d) => ({ ...d, days: d.days.filter((x) => x.id !== selectedDay.id) }))
                          setDayId(draft.days.find((x) => x.id !== selectedDay.id)?.id ?? '')
                        }
                      : undefined
                  }
                />
              </div>
              {selectedDay.rows.map((row) => (
                <div key={row.id} className="rounded-2xl border bg-card p-3">
                  <RowLabel
                    name={nameOf(row.exerciseId)}
                    readOnly={readOnly}
                    onMove={(delta) => update((d) => moveRow(d, row.id, delta))}
                    onRemove={() => updateDay(selectedDay.id, (rows) => rows.filter((r) => r.id !== row.id))}
                  />
                  <WeekStrip currentWeek={currentWeek}>
                    {weeks.map((w) => {
                      const isNext = next?.dayId === selectedDay.id && next.week === w
                      return (
                        <button
                          key={w}
                          type="button"
                          onClick={() => setDrawer({ rowId: row.id, week: w })}
                          className={cn(
                            'w-[46%] shrink-0 snap-start rounded-xl border p-2 text-left transition-colors hover:bg-secondary/50',
                            isNext && 'border-primary bg-lime-muted/60',
                          )}
                        >
                          <span className="mb-1 block text-[11px] font-medium text-muted-foreground">{t('plan.weekN', { n: w })}</span>
                          <CellView
                            planned={row.cells[w]}
                            fact={factOf(row.id, w)}
                            feedback={feedback.forCell(row.id, w)}
                            bodyweight={bodyweight(row.exerciseId)}
                            isNext={isNext}
                          />
                        </button>
                      )
                    })}
                  </WeekStrip>
                </div>
              ))}
              {selectedDay.rows.length ? null : (
                <p className="rounded-2xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">{t('plan.noRows')}</p>
              )}
            </>
          ) : null}
        </div>

        {readOnly ? null : (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="touch" className="md:hidden" onClick={() => selectedDay && setPickerDay(selectedDay.id)}>
              <Plus aria-hidden />
              {t('templates.addExercise')}
            </Button>
            <Button
              variant="secondary"
              size="touch"
              onClick={() => {
                const day = emptyDay(t('plan.dayN', { n: draft.days.length + 1 }))
                update((d) => ({ ...d, days: [...d.days, day] }))
                setDayId(day.id)
              }}
            >
              <CopyPlus aria-hidden />
              {t('plan.addDay')}
            </Button>
          </div>
        )}

        <Textarea
          value={draft.notes}
          onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
          placeholder={t('plan.notesPlaceholder')}
          aria-label={t('templates.notes')}
          readOnly={readOnly}
          maxLength={1000}
          className="min-h-20 rounded-xl md:max-w-xl"
        />

        {saved ? <PlanFeedback planId={planId} athleteId={athleteId} rows={flatRows} nameOf={nameOf} /> : null}
      </main>

      <ExercisePicker
        open={pickerDay !== null}
        onOpenChange={(open) => !open && setPickerDay(null)}
        onPick={(exercise: Exercise) => {
          if (pickerDay) updateDay(pickerDay, (rows) => [...rows, newRow(exercise.id)])
          setPickerDay(null)
        }}
        athleteId={athleteId ?? myAthleteId}
      />

      <CellDrawer
        target={drawerTarget}
        readOnly={readOnly}
        canStart={canStart && !dirty}
        starting={start.isPending}
        onClose={() => setDrawer(null)}
        onSave={(sets: SpecSet[]) => {
          if (drawer) update((d) => setCell(d, drawer.rowId, drawer.week, sets))
          setDrawer(null)
        }}
        onStart={onStart}
      >
        {drawerTarget && saved ? (
          <CellFeedbackThread planId={planId} athleteId={athleteId} rowId={drawerTarget.rowId} week={drawerTarget.week} fact={drawerTarget.fact} />
        ) : null}
      </CellDrawer>

      <Drawer open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DrawerContent className="mx-auto max-w-md">
          <DrawerHeader className="group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
            <DrawerTitle className="font-heading text-lg">{t('plan.delete')}</DrawerTitle>
            <DrawerDescription>{t('plan.deleteConfirm')}</DrawerDescription>
          </DrawerHeader>
          <div className="flex flex-col gap-2 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
            <Button
              variant="destructive"
              size="xl"
              disabled={busy}
              onClick={() =>
                remove.mutate(planId, {
                  onSuccess: () => navigate(athleteId ? `/trainer/clients/${athleteId}` : '/templates', { replace: true }),
                  onError: () => toast.error(t('templates.saveError')),
                })
              }
            >
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

function NextSlotCard({ week, dayName, busy, onStart }: { week: number; dayName: string; busy: boolean; onStart: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-3 rounded-2xl border-[1.5px] border-primary bg-lime-muted px-4 py-3 md:max-w-md">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-lime-text dark:text-lime">{t('plan.next')}</p>
        <p className="truncate text-[15px] font-medium">
          {t('plan.weekN', { n: week })} · {dayName}
        </p>
      </div>
      <Button size="touch" onClick={onStart} disabled={busy}>
        <Play aria-hidden />
        {t('plan.start')}
      </Button>
    </div>
  )
}

/** Horizontal week cards that open scrolled to the week before the current one. */
function WeekStrip({ currentWeek, children }: { currentWeek: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    const target = el?.children[Math.max(0, currentWeek - 2)] as HTMLElement | undefined
    if (el && target) el.scrollLeft = target.offsetLeft - (el.children[0] as HTMLElement).offsetLeft
  }, [currentWeek])
  return (
    <div ref={ref} className="-mx-3 mt-2 flex snap-x snap-mandatory gap-2 overflow-x-auto px-3 pb-1">
      {children}
    </div>
  )
}

function WeekMenu({
  week,
  weeks,
  totals,
  readOnly,
  onCopy,
  onRemove,
}: {
  week: number
  weeks: number
  totals: { volumeKg: number; workingSets: number }
  readOnly: boolean
  onCopy: (withStep: boolean) => void
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const lang = currentLanguage()
  const label = t('plan.weekN', { n: week })
  if (readOnly) return <span className="inline-flex h-9 items-center px-1 text-xs font-medium text-muted-foreground">{label}</span>
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full bg-secondary px-3 text-[13px] font-medium whitespace-nowrap hover:bg-secondary/70 md:rounded-lg md:bg-transparent md:px-1.5"
        >
          {label}
          <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {totals.workingSets ? (
          <p className="tabular px-2 py-1.5 text-xs text-muted-foreground">
            {formatVolume(totals.volumeKg, lang)} {t('workout.kg')} · {t('plan.setsCount', { count: totals.workingSets })}
          </p>
        ) : null}
        {week < weeks ? (
          <>
            <DropdownMenuItem onSelect={() => onCopy(false)}>
              <Copy />
              {t('plan.copyToNext', { n: week + 1 })}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onCopy(true)}>
              <CopyPlus />
              {t('plan.copyToNextStep', { n: week + 1 })}
            </DropdownMenuItem>
          </>
        ) : null}
        {weeks > 1 ? (
          <DropdownMenuItem variant="destructive" onSelect={onRemove}>
            <Trash2 />
            {t('plan.removeWeek')}
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function DayHeader({
  name,
  fallback,
  readOnly,
  onRename,
  onAddExercise,
  onRemove,
}: {
  name: string
  fallback: string
  readOnly: boolean
  onRename: (name: string) => void
  onAddExercise: () => void
  onRemove?: () => void
}) {
  const { t } = useTranslation()
  if (readOnly) return <p className="px-1 py-1.5 text-sm font-medium">{name || fallback}</p>
  return (
    <div className="flex items-center gap-1">
      <Input
        value={name}
        onChange={(e) => onRename(e.target.value)}
        placeholder={fallback}
        aria-label={t('plan.dayName')}
        maxLength={80}
        className="h-9 max-w-64 flex-1 rounded-lg border-transparent bg-transparent text-sm font-medium shadow-none focus-visible:bg-background"
      />
      <Button variant="ghost" size="sm" className="hidden md:inline-flex" onClick={onAddExercise}>
        <Plus aria-hidden />
        {t('templates.addExercise')}
      </Button>
      {onRemove ? (
        <Button variant="ghost" size="icon" onClick={onRemove} aria-label={t('plan.removeDay')}>
          <X />
        </Button>
      ) : null}
    </div>
  )
}

function RowLabel({
  name,
  readOnly,
  onMove,
  onRemove,
}: {
  name: string
  readOnly: boolean
  onMove: (delta: -1 | 1) => void
  onRemove: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex items-start gap-1">
      <span className="min-w-0 flex-1 py-1 text-sm leading-snug font-medium">{name}</span>
      {readOnly ? null : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={t('templates.itemMenu')}>
              <EllipsisVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onMove(-1)}>
              <ArrowUp />
              {t('plan.moveUp')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onMove(1)}>
              <ArrowDown />
              {t('plan.moveDown')}
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={onRemove}>
              <X />
              {t('templates.removeItem')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}
