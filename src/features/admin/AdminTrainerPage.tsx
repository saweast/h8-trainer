import { ChevronRight, Users } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { toast } from 'sonner'
import { EmptyState } from '@/components/common/EmptyState'
import { UserAvatar } from '@/components/common/UserAvatar'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { currentLanguage } from '@/i18n'
import { relativeDay } from '@/lib/dates'
import { useAdminTrainerClients, useAdminUsers, useSetCanBeTrainer } from './api'
import { BackHeader } from './BackHeader'
import { RoleBadges } from './RoleBadges'

/** One user: trainer permission and the clients they created or invited. */
export function AdminTrainerPage() {
  const { t } = useTranslation()
  const lang = currentLanguage()
  const { userId } = useParams()
  const { data: users } = useAdminUsers()
  const { data: clients, isPending, isError } = useAdminTrainerClients(userId)
  const setCanBeTrainer = useSetCanBeTrainer()
  const user = users?.find((u) => u.id === userId)
  const [today] = useState(() => new Date())

  return (
    <div className="flex flex-col gap-4">
      <BackHeader fallback="/admin/users">
        <UserAvatar name={user?.displayName ?? ''} src={user?.avatarUrl} />
        <div className="min-w-0 flex-1">
          <h1 className="font-heading flex items-center gap-1.5 text-lg leading-tight">
            <span className="truncate">{user?.displayName ?? '…'}</span>
            {user ? <RoleBadges isAdmin={user.isAdmin} isTrainer={user.isTrainer} /> : null}
          </h1>
        </div>
      </BackHeader>

      {user ? (
        <label className="flex items-start gap-3 rounded-2xl border bg-card p-4">
          <div className="flex-1">
            <p className="text-sm font-medium">{t('admin.canBeTrainer')}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('admin.canBeTrainerHint')}</p>
          </div>
          <Switch
            checked={user.canBeTrainer}
            onCheckedChange={(allowed) =>
              setCanBeTrainer.mutate({ userId: user.id, allowed }, { onError: () => toast.error(t('profile.saveError')) })
            }
            aria-label={t('admin.canBeTrainer')}
          />
        </label>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="text-xs font-medium text-muted-foreground">{t('admin.clientsTitle')}</h2>
        {isPending ? (
          <Skeleton className="h-32 rounded-2xl" />
        ) : isError ? (
          <EmptyState icon={Users} title={t('admin.loadError')} />
        ) : clients.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t('admin.noClients')}</p>
        ) : (
          <ul className="divide-y rounded-2xl border bg-card">
            {clients.map((c) => (
              <li key={c.athleteId}>
                <Link
                  to={`/admin/users/${userId}/clients/${c.athleteId}`}
                  className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary/50"
                >
                  <UserAvatar name={c.displayName} src={c.avatarUrl} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-sm font-medium">
                      <span className="truncate">{c.displayName}</span>
                      <span className="shrink-0 rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
                        {c.hasAccount ? t('admin.invited') : t('trainer.noAccount')}
                      </span>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {c.lastWorkoutAt
                        ? `${t('admin.workoutsCount', { count: c.workoutsCount })} · ${relativeDay(new Date(c.lastWorkoutAt), today, lang, {
                            today: t('common.today'),
                            yesterday: t('common.yesterday'),
                          })}`
                        : t('trainer.noWorkouts')}
                    </p>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
