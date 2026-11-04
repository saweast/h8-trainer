import { ArrowLeft, Copy, EllipsisVertical, GripVertical, Play, Plus, SlidersHorizontal, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { SortableList } from '@/components/common/SortableList'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { exerciseName } from '@/data/exercises'
import { useMyAthleteId } from '@/features/athlete/useMyAthlete'
import { useExerciseMap, type Exercise } from '@/features/exercises/api'
import { ExercisePicker } from '@/features/exercises/ExercisePicker'
import { currentLanguage } from '@/i18n'
import { formatKg } from '@/lib/format'
import { formatTargets } from '@/lib/templateFromWorkout'
import {
  useDeleteTemplate,
  useIsMine,
  useSaveTemplate,
  useStartFromTemplate,
  useTemplate,
  type Template,
  type TemplateItem,
} from './api'
import { TemplateItemDrawer } from './TemplateItemDrawer'

interface DraftItem extends TemplateItem {
  key: string
}

interface Draft {
  name: string
  notes: string
  items: DraftItem[]
}

function toDraft(template: Template | undefined): Draft {
  return {
    name: template?.name ?? '',
    notes: template?.notes ?? '',
    items: (template?.items ?? []).map((i) => ({ ...i, key: crypto.randomUUID() })),
  }
}

const sameDraft = (a: Draft, b: Draft) =>
  JSON.stringify({ ...a, items: a.items.map(({ key: _k, ...i }) => i) }) ===
  JSON.stringify({ ...b, items: b.items.map(({ key: _k, ...i }) => i) })

/** /templates/new and /templates/:templateId */
export function TemplateEditorPage() {
  const { templateId } = useParams()
  const isNew = !templateId || templateId === 'new'
  const { data: template, isPending, isError } = useTemplate(isNew ? undefined : templateId)
  const { t } = useTranslation()

  if (!isNew && isPending) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-3 px-4 pt-20">
        <Skeleton className="h-11 rounded-xl" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    )
  }
  if (!isNew && (isError || !template)) {
    return <p className="mx-auto max-w-md px-4 pt-20 text-center text-sm text-muted-foreground">{t('workout.notFound')}</p>
  }
  // Re-mount the editor when another template opens so the draft starts fresh.
  return <Editor key={template?.id ?? 'new'} template={isNew ? undefined : template} />
}

function Editor({ template }: { template: Template | undefined }) {
  const { t } = useTranslation()
  const lang = currentLanguage()
  const navigate = useNavigate()
  const isMine = useIsMine()
  const { map: exercises } = useExerciseMap()
  const { data: athleteId } = useMyAthleteId()
  const save = useSaveTemplate()
  const remove = useDeleteTemplate()
  const start = useStartFromTemplate(athleteId)

  const readOnly = template !== undefined && !isMine(template.ownerId)
  const [initial] = useState(() => toDraft(template))
  const [draft, setDraft] = useState(initial)
  const [nameError, setNameError] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [editing, setEditing] = useState<DraftItem | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const dirty = !sameDraft(draft, initial)
  const busy = save.isPending || start.isPending || remove.isPending

  const nameOf = (exerciseId: string) => {
    const e = exercises.get(exerciseId)
    return e ? exerciseName(e, lang) : '…'
  }

  const addExercise = (exercise: Exercise) =>
    setDraft((d) => ({
      ...d,
      items: [
        ...d.items,
        {
          key: crypto.randomUUID(),
          exerciseId: exercise.id,
          targetSets: 3,
          targetRepsMin: 8,
          targetRepsMax: 12,
          targetWeightKg: null,
          restS: null,
          notes: null,
        },
      ],
    }))

  const persist = async (asCopy = false): Promise<string | null> => {
    if (!draft.name.trim()) {
      setNameError(true)
      return null
    }
    try {
      return await save.mutateAsync({
        id: asCopy ? null : (template?.id ?? null),
        name: asCopy ? `${draft.name.trim()} ${t('templates.copySuffix')}` : draft.name,
        notes: draft.notes,
        items: draft.items.map(({ key: _key, ...item }) => item),
      })
    } catch {
      toast.error(t('templates.saveError'))
      return null
    }
  }

  const onSave = async () => {
    const id = await persist()
    if (!id) return
    toast.success(t('templates.saved'))
    navigate(`/templates/${id}`, { replace: true })
  }

  const onDuplicate = async () => {
    const id = await persist(true)
    if (id) navigate(`/templates/${id}`, { replace: true })
  }

  const onStart = async () => {
    let id = template?.id ?? null
    if (!readOnly && (dirty || !id)) id = await persist()
    if (!id) return
    start.mutate(
      { templateId: id },
      {
        onSuccess: (workoutId) => navigate(`/workout/${workoutId}`),
        onError: () => toast.error(t('templates.startError')),
      },
    )
  }

  const onDelete = () => {
    if (!template) return
    remove.mutate(template.id, {
      onSuccess: () => navigate('/templates', { replace: true }),
      onError: () => toast.error(t('templates.saveError')),
    })
  }

  const back = () => {
    if (dirty && !window.confirm(t('templates.unsaved'))) return
    if (window.history.length > 1) navigate(-1)
    else navigate('/templates')
  }

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b bg-background/95 pt-safe backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex h-14 max-w-md items-center justify-between gap-2 px-2">
          <Button variant="ghost" size="icon-touch" onClick={back} aria-label={t('common.back')}>
            <ArrowLeft />
          </Button>
          <p className="text-[15px] font-medium">{template ? t('templates.editTitle') : t('templates.newTitle')}</p>
          <div className="flex items-center">
            {readOnly ? (
              <Button variant="secondary" size="touch" onClick={() => void onDuplicate()} disabled={busy}>
                <Copy aria-hidden />
                {t('templates.duplicate')}
              </Button>
            ) : (
              <>
                <Button size="touch" onClick={() => void onSave()} disabled={busy || (!dirty && Boolean(template))}>
                  {t('templates.save')}
                </Button>
                {template ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-touch" aria-label={t('workout.moreActions')}>
                        <EllipsisVertical />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => void onDuplicate()}>
                        <Copy />
                        {t('templates.duplicate')}
                      </DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                        <Trash2 />
                        {t('templates.delete')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-md flex-col gap-4 px-4 pt-4 pb-[calc(2rem+env(safe-area-inset-bottom))]">
        {readOnly ? (
          <p className="rounded-xl bg-trainer-muted px-3 py-2 text-sm text-trainer-text">{t('templates.readOnly')}</p>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <Input
            value={draft.name}
            onChange={(e) => {
              setDraft((d) => ({ ...d, name: e.target.value }))
              setNameError(false)
            }}
            placeholder={t('templates.namePlaceholder')}
            aria-label={t('templates.name')}
            aria-invalid={nameError}
            readOnly={readOnly}
            maxLength={80}
            className="font-heading h-12 rounded-xl text-base"
          />
          {nameError ? <p className="text-xs text-destructive">{t('templates.nameRequired')}</p> : null}
        </div>

        {draft.items.length ? (
          <SortableList
            items={draft.items}
            getId={(i) => i.key}
            disabled={readOnly}
            onReorder={(items) => setDraft((d) => ({ ...d, items }))}
            className="divide-y overflow-hidden rounded-2xl border bg-card"
            renderItem={(item, _index, handle) => (
              <div className="flex min-h-16 items-center gap-1 py-2 pr-1 pl-1">
                {readOnly ? (
                  <span className="w-2" />
                ) : (
                  <button
                    type="button"
                    ref={handle.ref}
                    {...handle.listeners}
                    {...handle.attributes}
                    aria-label={t('templates.dragHandle')}
                    className="flex size-11 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground/60 active:cursor-grabbing"
                  >
                    <GripVertical className="size-5" aria-hidden />
                  </button>
                )}
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={() => setEditing(item)}
                  className="min-w-0 flex-1 py-1 text-left"
                >
                  <span className="block truncate text-sm font-medium">{nameOf(item.exerciseId)}</span>
                  <span className="tabular block text-xs text-muted-foreground">
                    {[
                      formatTargets(item),
                      item.targetWeightKg ? `${formatKg(item.targetWeightKg, lang)} ${t('workout.kg')}` : null,
                      item.restS ? t('templates.restShort', { s: item.restS }) : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </button>
                {readOnly ? null : (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-touch" aria-label={t('templates.itemMenu')}>
                        <EllipsisVertical />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setEditing(item)}>
                        <SlidersHorizontal />
                        {t('templates.editItem')}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => setDraft((d) => ({ ...d, items: d.items.filter((i) => i.key !== item.key) }))}
                      >
                        <X />
                        {t('templates.removeItem')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            )}
          />
        ) : (
          <p className="rounded-2xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            {t('templates.noExercises')}
          </p>
        )}

        {readOnly ? null : (
          <Button variant="secondary" size="touch" onClick={() => setPickerOpen(true)}>
            <Plus aria-hidden />
            {t('templates.addExercise')}
          </Button>
        )}

        <Textarea
          value={draft.notes}
          onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
          placeholder={t('templates.notesPlaceholder')}
          aria-label={t('templates.notes')}
          readOnly={readOnly}
          maxLength={1000}
          className="min-h-20 rounded-xl"
        />

        {draft.items.length ? (
          <Button size="xl" variant={readOnly ? 'default' : 'secondary'} onClick={() => void onStart()} disabled={busy}>
            <Play aria-hidden />
            {t('templates.start')}
          </Button>
        ) : null}
      </main>

      <ExercisePicker open={pickerOpen} onOpenChange={setPickerOpen} onPick={addExercise} athleteId={athleteId} />
      <TemplateItemDrawer
        item={editing}
        title={editing ? nameOf(editing.exerciseId) : ''}
        onClose={(updated) => {
          if (updated && editing) {
            setDraft((d) => ({ ...d, items: d.items.map((i) => (i.key === editing.key ? { ...updated, key: i.key } : i)) }))
          }
          setEditing(null)
        }}
      />
      <Drawer open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DrawerContent className="mx-auto max-w-md">
          <DrawerHeader className="group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
            <DrawerTitle className="font-heading text-lg">{t('templates.delete')}</DrawerTitle>
            <DrawerDescription>{t('templates.deleteConfirm')}</DrawerDescription>
          </DrawerHeader>
          <div className="flex flex-col gap-2 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
            <Button variant="destructive" size="xl" onClick={onDelete} disabled={busy}>
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
