import { History } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { EmptyState } from '@/components/common/EmptyState'
import { UserAvatar } from '@/components/common/UserAvatar'
import { Skeleton } from '@/components/ui/skeleton'
import { WorkoutList } from '@/features/workout/WorkoutList'
import { useAdminAthleteWorkouts, useAdminTrainerClients, useAdminUsers } from './api'
import { BackHeader } from './BackHeader'

/** A trainer's client and their finished workouts (read-only). */
export function AdminAthletePage() {
  const { t } = useTranslation()
  const { userId, athleteId } = useParams()
  const { data: users } = useAdminUsers()
  const { data: clients } = useAdminTrainerClients(userId)
  const { data: workouts, isPending, isError } = useAdminAthleteWorkouts(athleteId)
  const trainer = users?.find((u) => u.id === userId)
  const client = clients?.find((c) => c.athleteId === athleteId)

  return (
    <div className="flex flex-col gap-4">
      <BackHeader fallback={`/admin/users/${userId}`}>
        <UserAvatar name={client?.displayName ?? ''} src={client?.avatarUrl} />
        <div className="min-w-0 flex-1">
          <h1 className="font-heading truncate text-lg leading-tight">{client?.displayName ?? '…'}</h1>
          {trainer ? (
            <p className="truncate text-xs text-muted-foreground">{t('admin.trainerOf', { name: trainer.displayName })}</p>
          ) : null}
        </div>
      </BackHeader>

      <section className="flex flex-col gap-2">
        <h2 className="text-xs font-medium text-muted-foreground">{t('admin.workoutsTitle')}</h2>
        {isPending ? (
          <Skeleton className="h-32 rounded-2xl" />
        ) : isError ? (
          <EmptyState icon={History} title={t('admin.loadError')} />
        ) : workouts.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t('trainer.noWorkouts')}</p>
        ) : (
          <WorkoutList workouts={workouts} hrefFor={(id) => `/admin/workouts/${id}`} />
        )}
      </section>
    </div>
  )
}
