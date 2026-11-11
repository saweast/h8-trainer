import { SearchX } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { toast } from 'sonner'
import { EmptyState } from '@/components/common/EmptyState'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ActiveWorkout } from './ActiveWorkout'
import { finishedHere, useWorkout, WorkoutGoneError } from './api'
import { WorkoutSummary } from './WorkoutSummary'

export function WorkoutPage() {
  const { t } = useTranslation()
  const { workoutId } = useParams()
  const { data: workout, isPending, error } = useWorkout(workoutId)
  const wasActive = useRef(false)

  // Finished by the other device or automatically while this screen was open: say so.
  const finished = Boolean(workout?.finishedAt)
  useEffect(() => {
    if (!workout) return
    if (!finished) {
      wasActive.current = true
    } else if (wasActive.current) {
      wasActive.current = false
      if (!finishedHere.has(workout.id)) toast(t('workout.finishedElsewhere'))
    }
  }, [finished, workout, t])

  if (isPending) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-3 px-4 pt-20">
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    )
  }
  // A failed live sync keeps the last good copy on screen; only a missing workout ends it.
  if (!workout || error instanceof WorkoutGoneError) {
    return (
      <div className="mx-auto max-w-md px-4 pt-20">
        <EmptyState icon={SearchX} title={t('workout.notFound')}>
          <Button asChild variant="secondary" size="touch">
            <Link to="/">{t('workout.home')}</Link>
          </Button>
        </EmptyState>
      </div>
    )
  }
  return workout.finishedAt ? <WorkoutSummary workout={workout} /> : <ActiveWorkout workout={workout} />
}
