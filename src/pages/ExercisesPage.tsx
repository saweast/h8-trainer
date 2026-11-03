import { Plus, Search } from 'lucide-react'
import { useDeferredValue, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Chip } from '@/components/common/Chip'
import { EmptyState } from '@/components/common/EmptyState'
import { PageHeader } from '@/components/common/PageHeader'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { EXERCISE_CATALOG, MUSCLE_GROUPS, exerciseName, namesMatch, type Equipment, type MuscleGroup } from '@/data/exercises'
import { useMyAthleteId } from '@/features/athlete/useMyAthlete'
import { useExercises } from '@/features/exercises/api'
import { CreateExerciseForm } from '@/features/exercises/CreateExerciseForm'
import { currentLanguage } from '@/i18n'
import { isSupabaseConfigured } from '@/lib/supabase'

interface Row {
  key: string
  slug: string | null
  name: string
  muscle: MuscleGroup
  equipment: Equipment
  custom: boolean
}

const DEMO_ROWS: Row[] = EXERCISE_CATALOG.map((e) => ({
  key: e.slug,
  slug: e.slug,
  name: e.en,
  muscle: e.muscle,
  equipment: e.equipment,
  custom: false,
}))

export function ExercisesPage() {
  const { t } = useTranslation()
  const lang = currentLanguage()
  const { data: exercises, isPending } = useExercises()
  const { data: athleteId } = useMyAthleteId()
  const [query, setQuery] = useState('')
  const [muscle, setMuscle] = useState<MuscleGroup | null>(null)
  const [creating, setCreating] = useState(false)
  const deferredQuery = useDeferredValue(query)

  const all = useMemo<Row[]>(
    () =>
      isSupabaseConfigured
        ? (exercises ?? []).map((e) => ({
            key: e.id,
            slug: e.slug,
            name: e.name,
            muscle: e.muscle,
            equipment: e.equipment,
            custom: e.ownerId !== null,
          }))
        : DEMO_ROWS,
    [exercises],
  )
  const groups = useMemo(() => MUSCLE_GROUPS.filter((m) => all.some((e) => e.muscle === m)), [all])
  const rows = useMemo(
    () =>
      all
        .filter(
          (e) => (!muscle || e.muscle === muscle) && namesMatch([exerciseName(e, 'uk'), exerciseName(e, 'en')], deferredQuery),
        )
        .sort((a, b) => exerciseName(a, lang).localeCompare(exerciseName(b, lang), lang)),
    [all, muscle, deferredQuery, lang],
  )

  const create = () => {
    if (!isSupabaseConfigured) {
      toast(t('common.needsDatabase'))
      return
    }
    setCreating(true)
  }

  const loading = isSupabaseConfigured && isPending

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title={t('exercises.title')}
        subtitle={loading ? undefined : t('exercises.count', { count: rows.length })}
        action={
          <Button variant="secondary" size="icon-touch" onClick={create} aria-label={t('exercises.create')}>
            <Plus />
          </Button>
        }
      />
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
        {groups.map((m) => (
          <Chip key={m} active={muscle === m} onClick={() => setMuscle(muscle === m ? null : m)}>
            {t(`muscle.${m}`)}
          </Chip>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={Search} title={t('exercises.noResults')}>
          {query.trim() ? (
            <Button variant="secondary" size="touch" onClick={create}>
              <Plus aria-hidden />
              {t('exercises.createNamed', { name: query.trim() })}
            </Button>
          ) : null}
        </EmptyState>
      ) : (
        <ul className="divide-y rounded-2xl border bg-card">
          {rows.map((e) => (
            <li key={e.key} className="flex min-h-14 items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{exerciseName(e, lang)}</p>
                <p className="text-xs text-muted-foreground">
                  {t(`equipment.${e.equipment}`)} · {t(`muscle.${e.muscle}`)}
                </p>
              </div>
              {e.custom ? (
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">{t('picker.custom')}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <Drawer open={creating} onOpenChange={setCreating}>
        <DrawerContent className="mx-auto max-h-[92dvh] max-w-md">
          <DrawerHeader className="group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
            <DrawerTitle className="font-heading text-lg">{t('exerciseForm.title')}</DrawerTitle>
            <DrawerDescription>{t('exerciseForm.description')}</DrawerDescription>
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
            <CreateExerciseForm
              initialName={query.trim()}
              athleteId={athleteId}
              onCreated={() => {
                setCreating(false)
                setQuery('')
              }}
            />
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  )
}
