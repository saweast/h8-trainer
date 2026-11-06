import { CircleHelp } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Skeleton } from '@/components/ui/skeleton'
import { exerciseName } from '@/data/exercises'
import { useIsMine } from '@/features/templates/api'
import { currentLanguage } from '@/i18n'
import { cn } from '@/lib/utils'
import { hasGuide, type GuideExercise } from './model'

const ExerciseGuideContent = lazy(() => import('./ExerciseGuideContent'))

/** «?» next to an exercise name; opens the guide sheet. Renders nothing when there is no guide. */
export function ExerciseHintButton({ exercise, className }: { exercise: GuideExercise; className?: string }) {
  const { t } = useTranslation()
  const lang = currentLanguage()
  const isMine = useIsMine()
  const [open, setOpen] = useState(false)
  if (!hasGuide(exercise, isMine(exercise.ownerId))) return null
  const name = exerciseName(exercise, lang)

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-touch"
        aria-label={t('guide.openFor', { name })}
        className={cn('text-muted-foreground', className)}
        onClick={(e) => {
          // Rows in the picker and lists are buttons/links themselves.
          e.preventDefault()
          e.stopPropagation()
          setOpen(true)
        }}
      >
        <CircleHelp />
      </Button>
      <ExerciseGuideDrawer exercise={exercise} open={open} onOpenChange={setOpen} />
    </>
  )
}

export function ExerciseGuideDrawer({
  exercise,
  open,
  onOpenChange,
}: {
  exercise: GuideExercise
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const lang = currentLanguage()
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-h-[92dvh] max-w-md">
        <DrawerHeader className="group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
          <DrawerTitle className="font-heading text-lg leading-tight">{exerciseName(exercise, lang)}</DrawerTitle>
          <DrawerDescription>
            {t(`equipment.${exercise.equipment}`)} · {t(`muscle.${exercise.muscle}`)}
          </DrawerDescription>
        </DrawerHeader>
        <div className="overflow-y-auto px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          {open ? (
            <Suspense fallback={<Skeleton className="aspect-[3/1] w-full rounded-xl" />}>
              <ExerciseGuideContent exercise={exercise} />
            </Suspense>
          ) : null}
        </div>
      </DrawerContent>
    </Drawer>
  )
}
