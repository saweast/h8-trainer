import { Dumbbell, Eye, Play } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { EmptyState } from '@/components/common/EmptyState'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/features/auth/authContext'
import { useActiveWorkout, useRecentWorkouts, type ActiveWorkoutInfo } from './api'
import { ElapsedClock } from './ElapsedClock'
import { StartWorkoutDrawer } from './StartWorkoutDrawer'
import { WorkoutList } from './WorkoutList'

/** Start button, or a "resume" card when a workout is already in progress. */
export function StartOrResume({ athleteId }: { athleteId: string | undefined }) {
  const { data: active, isPending } = useActiveWorkout(athleteId)

  if (athleteId && isPending) return <Skeleton className="h-12 rounded-xl" />
  if (!active) return <StartWorkoutDrawer athleteId={athleteId} />
  return <ResumeCard active={active} />
}

/** "Workout in progress" with a way back into it (also on the trainer's client card). */
export function ResumeCard({ active }: { active: ActiveWorkoutInfo }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const byOther = Boolean(user && active.createdBy && active.createdBy !== user.id)

  return (
    <div className="rounded-2xl border-[1.5px] border-primary bg-lime-muted p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-lime-text dark:text-lime">{t('workout.inProgress')}</p>
        <ElapsedClock since={active.startedAt} className="tabular text-sm font-medium" />
      </div>
      {active.title ? <p className="mt-0.5 text-xs text-muted-foreground">{active.title}</p> : null}
      <Button asChild size="xl" className="mt-3 w-full">
        <Link to={`/workout/${active.id}`}>
          {byOther ? <Eye aria-hidden /> : <Play aria-hidden />}
          {byOther ? t('workout.watch') : t('workout.resume')}
        </Link>
      </Button>
    </div>
  )
}

export function RecentWorkouts({ athleteId }: { athleteId: string | undefined }) {
  const { t } = useTranslation()
  const { data, isPending } = useRecentWorkouts(athleteId)

  if (athleteId && isPending) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-16 rounded-2xl" />
        <Skeleton className="h-16 rounded-2xl" />
      </div>
    )
  }
  if (!data?.length) {
    return <EmptyState icon={Dumbbell} title={t('home.recentEmptyTitle')} body={t('home.recentEmptyBody')} />
  }

  return <WorkoutList workouts={data} />
}
