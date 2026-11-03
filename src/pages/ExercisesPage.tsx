import { Plus, Search } from 'lucide-react'
import { useDeferredValue, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Chip } from '@/components/common/Chip'
import { EmptyState } from '@/components/common/EmptyState'
import { PageHeader } from '@/components/common/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EXERCISE_CATALOG, MUSCLE_GROUPS, matchesQuery, type MuscleGroup } from '@/data/exercises'
import { currentLanguage } from '@/i18n'

// TODO(stage 3): merge custom exercises from Supabase and open the create form.
export function ExercisesPage() {
  const { t } = useTranslation()
  const lang = currentLanguage()
  const [query, setQuery] = useState('')
  const [muscle, setMuscle] = useState<MuscleGroup | null>(null)
  const deferredQuery = useDeferredValue(query)

  const groups = useMemo(() => MUSCLE_GROUPS.filter((m) => EXERCISE_CATALOG.some((e) => e.muscle === m)), [])
  const exercises = useMemo(
    () =>
      EXERCISE_CATALOG.filter((e) => (!muscle || e.muscle === muscle) && matchesQuery(e, deferredQuery)).sort((a, b) =>
        a[lang].localeCompare(b[lang], lang),
      ),
    [muscle, deferredQuery, lang],
  )

  const create = () => toast(t('common.needsDatabase'))

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title={t('exercises.title')}
        subtitle={t('exercises.count', { count: exercises.length })}
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
          inputMode="search"
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

      {exercises.length === 0 ? (
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
          {exercises.map((e) => (
            <li key={e.slug} className="flex min-h-14 items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{e[lang]}</p>
                <p className="text-xs text-muted-foreground">
                  {t(`equipment.${e.equipment}`)} · {t(`muscle.${e.muscle}`)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
