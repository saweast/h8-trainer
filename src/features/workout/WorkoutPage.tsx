import { SearchX } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { EmptyState } from '@/components/common/EmptyState'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ActiveWorkout } from './ActiveWorkout'
import { useWorkout } from './api'
import { WorkoutSummary } from './WorkoutSummary'

export function WorkoutPage() {
  const { t } = useTranslation()
  const { workoutId } = useParams()
  const { data: workout, isPending, isError } = useWorkout(workoutId)

  if (isPending) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-3 px-4 pt-20">
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    )
  }
  if (isError || !workout) {
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
