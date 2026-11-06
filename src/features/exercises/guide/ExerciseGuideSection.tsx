import { ChevronDown } from 'lucide-react'
import { lazy, Suspense, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Skeleton } from '@/components/ui/skeleton'
import { useIsMine } from '@/features/templates/api'
import { cn } from '@/lib/utils'
import { ExerciseThumb } from './ExerciseThumb'
import { hasGuide, type GuideExercise } from './model'

const ExerciseGuideContent = lazy(() => import('./ExerciseGuideContent'))

/**
 * «Техніка» card on the exercise page. Open by default until there is history to look at,
 * so the records and chart stay at the top for regulars.
 */
export function ExerciseGuideSection({ exercise, defaultOpen }: { exercise: GuideExercise; defaultOpen: boolean }) {
  const { t } = useTranslation()
  const isMine = useIsMine()
  const [open, setOpen] = useState(defaultOpen)
  const panelId = useId()
  if (!hasGuide(exercise, isMine(exercise.ownerId))) return null

  return (
    <section className="rounded-2xl border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 py-2 text-left focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <ExerciseThumb slug={exercise.slug} />
        <h2 className="flex-1 text-[15px] font-medium">{t('guide.title')}</h2>
        <ChevronDown className={cn('size-5 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open ? (
        <div id={panelId} className="px-3 pb-3">
          <Suspense fallback={<Skeleton className="aspect-[3/1] w-full rounded-xl" />}>
            <ExerciseGuideContent exercise={exercise} />
          </Suspense>
        </div>
      ) : null}
    </section>
  )
}
