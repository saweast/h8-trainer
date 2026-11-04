import { ArrowLeft, EllipsisVertical, GripVertical, Plus, Trash2, X } from 'lucide-react'
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
import { useDeleteProgram, useIsMine, usePrograms, useSaveProgram, useTemplates, type ProgramSummary } from './api'

interface Day {
  key: string
  templateId: string
}

/** /programs/new and /programs/:programId */
export function ProgramEditorPage() {
  const { programId } = useParams()
  const isNew = !programId || programId === 'new'
  const { data: programs, isPending } = usePrograms()
  const program = isNew ? undefined : programs?.find((p) => p.id === programId)

  if (!isNew && isPending) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-3 px-4 pt-20">
        <Skeleton className="h-11 rounded-xl" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    )
  }
  return <Editor key={program?.id ?? 'new'} program={program} />
}

function Editor({ program }: { program: ProgramSummary | undefined }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const isMine = useIsMine()
  const { data: templates } = useTemplates()
  const save = useSaveProgram()
  const remove = useDeleteProgram()

  const readOnly = program !== undefined && !isMine(program.ownerId)
  const [name, setName] = useState(program?.name ?? '')
  const [days, setDays] = useState<Day[]>(() =>
    (program?.days ?? []).map((d) => ({ key: crypto.randomUUID(), templateId: d.templateId })),
  )
  const [nameError, setNameError] = useState(false)
  const [picking, setPicking] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const mine = (templates ?? []).filter((tpl) => isMine(tpl.ownerId))
  const templateName = (id: string) =>
    templates?.find((tpl) => tpl.id === id)?.name ?? program?.days.find((d) => d.templateId === id)?.name ?? '…'

  const onSave = async () => {
    if (!name.trim()) {
      setNameError(true)
      return
    }
    try {
      const id = await save.mutateAsync({ id: program?.id ?? null, name, templateIds: days.map((d) => d.templateId) })
      toast.success(t('programs.saved'))
      navigate(`/programs/${id}`, { replace: true })
    } catch {
      toast.error(t('templates.saveError'))
    }
  }

  const onDelete = () => {
    if (!program) return
    remove.mutate(program.id, {
      onSuccess: () => navigate('/templates', { replace: true }),
      onError: () => toast.error(t('templates.saveError')),
    })
  }

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b bg-background/95 pt-safe backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex h-14 max-w-md items-center justify-between gap-2 px-2">
          <Button
            variant="ghost"
            size="icon-touch"
            onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/templates'))}
            aria-label={t('common.back')}
          >
            <ArrowLeft />
          </Button>
          <p className="text-[15px] font-medium">{program ? t('programs.editTitle') : t('programs.newTitle')}</p>
          <div className="flex items-center">
            {readOnly ? (
              <span className="w-11" />
            ) : (
              <>
                <Button size="touch" onClick={() => void onSave()} disabled={save.isPending}>
                  {t('templates.save')}
                </Button>
                {program ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-touch" aria-label={t('workout.moreActions')}>
                        <EllipsisVertical />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                        <Trash2 />
                        {t('programs.delete')}
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
        <div className="flex flex-col gap-1.5">
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setNameError(false)
            }}
            placeholder={t('programs.namePlaceholder')}
            aria-label={t('programs.name')}
            aria-invalid={nameError}
            readOnly={readOnly}
            maxLength={80}
            className="font-heading h-12 rounded-xl text-base"
          />
          {nameError ? <p className="text-xs text-destructive">{t('programs.nameRequired')}</p> : null}
        </div>

        <h2 className="-mb-2 text-xs font-medium text-muted-foreground">{t('programs.days')}</h2>
        {days.length ? (
          <SortableList
            items={days}
            getId={(d) => d.key}
            disabled={readOnly}
            onReorder={setDays}
            className="divide-y overflow-hidden rounded-2xl border bg-card"
            renderItem={(day, index, handle) => (
              <div className="flex min-h-14 items-center gap-1 py-1.5 pr-1 pl-1">
                {readOnly ? (
                  <span className="w-2" />
                ) : (
                  <button
                    type="button"
                    ref={handle.ref}
                    {...handle.listeners}
                    {...handle.attributes}
                    aria-label={t('templates.dragHandle')}
                    className="flex size-11 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground/60"
                  >
                    <GripVertical className="size-5" aria-hidden />
                  </button>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">{t('programs.day', { n: index + 1 })}</p>
                  <p className="truncate text-sm font-medium">{templateName(day.templateId)}</p>
                </div>
                {readOnly ? null : (
                  <Button
                    variant="ghost"
                    size="icon-touch"
                    aria-label={t('programs.removeDay')}
                    onClick={() => setDays((ds) => ds.filter((d) => d.key !== day.key))}
                  >
                    <X />
                  </Button>
                )}
              </div>
            )}
          />
        ) : (
          <p className="rounded-2xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">{t('programs.noDays')}</p>
        )}

        {readOnly ? null : (
          <Button variant="secondary" size="touch" onClick={() => setPicking(true)}>
            <Plus aria-hidden />
            {t('programs.addDay')}
          </Button>
        )}
      </main>

      <Drawer open={picking} onOpenChange={setPicking}>
        <DrawerContent className="mx-auto max-h-[80dvh] max-w-md">
          <DrawerHeader className="group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
            <DrawerTitle className="font-heading text-lg">{t('programs.pickTemplate')}</DrawerTitle>
            <DrawerDescription className="sr-only">{t('programs.addDay')}</DrawerDescription>
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
            {mine.length ? (
              <ul className="divide-y">
                {mine.map((tpl) => (
                  <li key={tpl.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setDays((ds) => [...ds, { key: crypto.randomUUID(), templateId: tpl.id }])
                        setPicking(false)
                      }}
                      className="flex min-h-14 w-full items-center gap-3 py-2 text-left hover:bg-secondary/50"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{tpl.name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {t('templates.exercises', { count: tpl.exerciseCount })}
                        </span>
                      </span>
                      <Plus className="size-4 text-muted-foreground" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">{t('programs.noTemplates')}</p>
            )}
          </div>
        </DrawerContent>
      </Drawer>

      <Drawer open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DrawerContent className="mx-auto max-w-md">
          <DrawerHeader className="group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
            <DrawerTitle className="font-heading text-lg">{t('programs.delete')}</DrawerTitle>
            <DrawerDescription>{t('programs.deleteConfirm')}</DrawerDescription>
          </DrawerHeader>
          <div className="flex flex-col gap-2 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
            <Button variant="destructive" size="xl" onClick={onDelete} disabled={remove.isPending}>
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
