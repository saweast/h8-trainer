import { ArrowLeft, Plus, Search } from 'lucide-react'
import { useDeferredValue, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Chip } from '@/components/common/Chip'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { MUSCLE_GROUPS, exerciseName, namesMatch, type MuscleGroup } from '@/data/exercises'
import { currentLanguage } from '@/i18n'
import { useExercises, type Exercise } from './api'
import { CreateExerciseForm } from './CreateExerciseForm'

interface ExercisePickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (exercise: Exercise) => void
  athleteId?: string
}

export function ExercisePicker({ open, onOpenChange, onPick, athleteId }: ExercisePickerProps) {
  const { t } = useTranslation()
  const lang = currentLanguage()
  const { data: exercises, isPending } = useExercises()
  const [query, setQuery] = useState('')
  const [muscle, setMuscle] = useState<MuscleGroup | null>(null)
  const [creating, setCreating] = useState(false)
  const deferredQuery = useDeferredValue(query)

  const list = useMemo(() => {
    const items = (exercises ?? []).filter(
      (e) =>
        (!muscle || e.muscle === muscle) &&
        namesMatch([exerciseName(e, 'uk'), exerciseName(e, 'en')], deferredQuery),
    )
    return items.sort((a, b) => exerciseName(a, lang).localeCompare(exerciseName(b, lang), lang))
  }, [exercises, muscle, deferredQuery, lang])

  const close = (next: boolean) => {
    onOpenChange(next)
    if (!next) {
      setCreating(false)
      setQuery('')
      setMuscle(null)
    }
  }

  const pick = (exercise: Exercise) => {
    onPick(exercise)
    close(false)
  }

  return (
    <Drawer open={open} onOpenChange={close}>
      <DrawerContent className="mx-auto h-[88dvh] max-w-md">
        <DrawerHeader className="flex-row items-center gap-2 group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
          {creating ? (
            <Button variant="ghost" size="icon-touch" onClick={() => setCreating(false)} aria-label={t('common.back')}>
              <ArrowLeft />
            </Button>
          ) : null}
          <div>
            <DrawerTitle className="font-heading text-lg">
              {creating ? t('exerciseForm.title') : t('picker.title')}
            </DrawerTitle>
            <DrawerDescription>{creating ? t('exerciseForm.description') : t('picker.description')}</DrawerDescription>
          </div>
        </DrawerHeader>

        {creating ? (
          <div className="overflow-y-auto px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
            <CreateExerciseForm initialName={query.trim()} athleteId={athleteId} onCreated={pick} />
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3 px-4">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('exercises.search')}
                  aria-label={t('exercises.search')}
                  className="h-11 rounded-xl pl-10"
                />
              </div>
              <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
                <Chip active={muscle === null} onClick={() => setMuscle(null)}>
                  {t('common.all')}
                </Chip>
                {MUSCLE_GROUPS.map((m) => (
                  <Chip key={m} active={muscle === m} onClick={() => setMuscle(muscle === m ? null : m)}>
                    {t(`muscle.${m}`)}
                  </Chip>
                ))}
              </div>
            </div>

            <div className="mt-2 flex-1 overflow-y-auto px-4">
              {isPending ? (
                <div className="flex flex-col gap-2">
                  {Array.from({ length: 6 }, (_, i) => (
                    <Skeleton key={i} className="h-14 rounded-xl" />
                  ))}
                </div>
              ) : (
                <ul className="divide-y">
                  {list.map((e) => (
                    <li key={e.id}>
                      <button
                        type="button"
                        onClick={() => pick(e)}
                        className="flex min-h-14 w-full items-center gap-3 py-2.5 text-left transition-colors hover:bg-secondary/50"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{exerciseName(e, lang)}</span>
                          <span className="block text-xs text-muted-foreground">
                            {t(`equipment.${e.equipment}`)} · {t(`muscle.${e.muscle}`)}
                          </span>
                        </span>
                        {e.ownerId ? (
                          <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">
                            {t('picker.custom')}
                          </span>
                        ) : null}
                        <Plus className="size-4 text-muted-foreground" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {!isPending && list.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">{t('exercises.noResults')}</p>
              ) : null}
            </div>

            <div className="border-t px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
              <Button variant="secondary" size="touch" className="w-full" onClick={() => setCreating(true)}>
                <Plus aria-hidden />
                {query.trim() ? t('exercises.createNamed', { name: query.trim() }) : t('exercises.create')}
              </Button>
            </div>
          </>
        )}
      </DrawerContent>
    </Drawer>
  )
}
