import { ChevronRight, Search, UserPlus, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate } from 'react-router'
import { toast } from 'sonner'
import { Chip } from '@/components/common/Chip'
import { EmptyState } from '@/components/common/EmptyState'
import { PageHeader } from '@/components/common/PageHeader'
import { UserAvatar } from '@/components/common/UserAvatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/features/auth/authContext'
import { FeedbackFeedCard } from '@/features/feedback/FeedbackFeed'
import { useMemberships, type Membership } from '@/features/memberships/api'
import { useMode } from '@/features/mode/modeContext'
import { AddClientDrawer } from '@/features/trainer/AddClientDrawer'
import { useTrainerClients } from '@/features/trainer/api'
import { currentLanguage } from '@/i18n'
import { clientFlags, currentMembership, daysSince } from '@/lib/clients'
import { relativeDay } from '@/lib/dates'
import { sessionsLeft } from '@/lib/membership'
import { isSupabaseConfigured } from '@/lib/supabase'
import { cn } from '@/lib/utils'

type Filter = 'all' | 'expiring' | 'inactive'

export function TrainerClientsPage() {
  const { t } = useTranslation()
  const lang = currentLanguage()
  const { user } = useAuth()
  const { isTrainer, ready } = useMode()
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState<'offline' | 'invite' | null>(null)
  const [today] = useState(() => new Date())
  const { data: clients, isPending } = useTrainerClients(isTrainer)
  const { data: memberships } = useMemberships()

  const rows = useMemo(
    () =>
      (clients ?? []).map((c) => {
        const own = (memberships ?? []).filter((m) => m.athleteId === c.athleteId)
        const pkg = currentMembership<Membership>(own, 'trainer', today, user?.id)
        const gym = currentMembership<Membership>(own, 'gym', today)
        return { client: c, pkg, gym, flags: clientFlags(c.lastWorkoutAt, pkg, gym, today) }
      }),
    [clients, memberships, today, user?.id],
  )

  if (!ready) return <Skeleton className="h-64 rounded-2xl" />
  if (!isTrainer) return <Navigate to="/" replace />

  const add = (mode: 'offline' | 'invite') => {
    if (!isSupabaseConfigured) {
      toast(t('common.needsDatabase'))
      return
    }
    setAdding(mode)
  }

  const counts = {
    expiring: rows.filter((r) => r.flags.needsRenewal).length,
    inactive: rows.filter((r) => r.flags.inactive).length,
  }
  const q = query.trim().toLocaleLowerCase('uk')
  const shown = rows.filter(
    (r) =>
      (!q || r.client.displayName.toLocaleLowerCase('uk').includes(q)) &&
      (filter === 'all' || (filter === 'expiring' ? r.flags.needsRenewal : r.flags.inactive)),
  )

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title={t('trainer.clientsTitle')}
        action={
          rows.length ? (
            <Button size="icon-touch" onClick={() => add('offline')} aria-label={t('trainer.addClient')}>
              <UserPlus />
            </Button>
          ) : undefined
        }
      />

      {isSupabaseConfigured && isPending ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-16 rounded-2xl" />
          <Skeleton className="h-16 rounded-2xl" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={Users} title={t('trainer.emptyTitle')} body={t('trainer.emptyBody')}>
          <Button size="xl" onClick={() => add('offline')}>
            <UserPlus aria-hidden />
            {t('trainer.addOffline')}
          </Button>
          <Button variant="secondary" size="touch" onClick={() => add('invite')}>
            {t('trainer.invite')}
          </Button>
        </EmptyState>
      ) : (
        <>
          <FeedbackFeedCard />
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('trainer.search')}
              aria-label={t('trainer.search')}
              className="h-11 rounded-xl pl-10"
            />
          </div>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
            <Chip active={filter === 'all'} onClick={() => setFilter('all')}>
              {t('common.all')}
            </Chip>
            <Chip active={filter === 'expiring'} onClick={() => setFilter(filter === 'expiring' ? 'all' : 'expiring')}>
              {t('trainer.filterExpiring')}
              {counts.expiring ? ` · ${counts.expiring}` : ''}
            </Chip>
            <Chip active={filter === 'inactive'} onClick={() => setFilter(filter === 'inactive' ? 'all' : 'inactive')}>
              {t('trainer.filterInactive')}
              {counts.inactive ? ` · ${counts.inactive}` : ''}
            </Chip>
          </div>

          {shown.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t('trainer.noResults')}</p>
          ) : (
            <ul className="divide-y rounded-2xl border bg-card">
              {shown.map(({ client: c, pkg, gym, flags }) => {
                const left = pkg ? sessionsLeft(pkg.membership) : null
                const pkgBad = pkg && (pkg.status === 'expired' || pkg.status === 'used_up')
                const days = daysSince(c.lastWorkoutAt, today)
                return (
                  <li key={c.athleteId}>
                    <Link
                      to={`/trainer/clients/${c.athleteId}`}
                      className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary/50"
                    >
                      <UserAvatar name={c.displayName} src={c.avatarUrl} />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                          <span className="truncate">{c.displayName}</span>
                          {c.hasAccount ? null : (
                            <span className="shrink-0 rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
                              {t('trainer.noAccount')}
                            </span>
                          )}
                        </p>
                        <p className={cn('truncate text-xs', flags.inactive && c.lastWorkoutAt ? 'text-danger-text' : 'text-muted-foreground')}>
                          {!c.lastWorkoutAt
                            ? t('trainer.noWorkouts')
                            : flags.inactive
                              ? t('trainer.inactiveDays', { count: days ?? 0 })
                              : `${c.lastWorkoutTitle || t('recent.untitled')} · ${relativeDay(new Date(c.lastWorkoutAt), today, lang, {
                                  today: t('common.today'),
                                  yesterday: t('common.yesterday'),
                                })}`}
                          {gym && gym.status !== 'active' && gym.status !== 'upcoming' ? (
                            <span className={gym.status === 'expiring' ? 'text-warning-text' : 'text-danger-text'}>
                              {' · '}
                              {t('membership.gym')}: {t(`membership.status.${gym.status}`)}
                            </span>
                          ) : null}
                        </p>
                      </div>
                      {pkg ? (
                        <span
                          className={cn(
                            'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium',
                            pkgBad ? 'bg-danger-muted text-danger-text' : pkg.status === 'expiring' ? 'bg-warning-muted text-warning-text' : 'bg-secondary',
                          )}
                        >
                          {pkgBad
                            ? t(`membership.status.${pkg.status}`)
                            : left !== null
                              ? t('trainer.sessionsLeft', { count: left })
                              : t('membership.unlimited')}
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-full bg-danger-muted px-2 py-0.5 text-[11px] font-medium text-danger-text">
                          {t('membership.none')}
                        </span>
                      )}
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}

      <AddClientDrawer open={adding !== null} onOpenChange={(o) => !o && setAdding(null)} initialMode={adding ?? 'offline'} />
    </div>
  )
}
