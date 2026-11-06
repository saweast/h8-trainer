import { ChevronRight, Search, Users } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { EmptyState } from '@/components/common/EmptyState'
import { PageHeader } from '@/components/common/PageHeader'
import { UserAvatar } from '@/components/common/UserAvatar'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { useAdminUsers, useSetCanBeTrainer } from './api'
import { RoleBadges } from './RoleBadges'

/** Every registered user; the admin decides who may become a trainer. */
export function AdminUsersPage() {
  const { t } = useTranslation()
  const { data: users, isPending, isError } = useAdminUsers()
  const setCanBeTrainer = useSetCanBeTrainer()
  const [query, setQuery] = useState('')

  const q = query.trim().toLocaleLowerCase('uk')
  const shown = (users ?? []).filter((u) => !q || u.displayName.toLocaleLowerCase('uk').includes(q))

  const toggle = (userId: string, allowed: boolean) =>
    setCanBeTrainer.mutate({ userId, allowed }, { onError: () => toast.error(t('profile.saveError')) })

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title={t('admin.usersTitle')}
        subtitle={users ? t('admin.usersCount', { count: users.length }) : undefined}
      />

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('admin.search')}
          aria-label={t('admin.search')}
          className="h-11 rounded-xl pl-10"
        />
      </div>

      {isPending ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-16 rounded-2xl" />
          <Skeleton className="h-16 rounded-2xl" />
          <Skeleton className="h-16 rounded-2xl" />
        </div>
      ) : isError ? (
        <EmptyState icon={Users} title={t('admin.loadError')} />
      ) : shown.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t('admin.noResults')}</p>
      ) : (
        <>
          <p className="px-1 text-xs text-muted-foreground">{t('admin.canBeTrainerHint')}</p>
          <ul className="divide-y rounded-2xl border bg-card">
            {shown.map((u) => (
              <li key={u.id} className="flex min-h-16 items-center gap-2 pr-4">
                <Link
                  to={`/admin/users/${u.id}`}
                  className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-4 transition-colors hover:bg-secondary/50"
                >
                  <UserAvatar name={u.displayName} src={u.avatarUrl} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-sm font-medium">
                      <span className="truncate">{u.displayName || '—'}</span>
                      <RoleBadges isAdmin={u.isAdmin} isTrainer={u.isTrainer} />
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {u.clientsCount ? t('admin.clientsCount', { count: u.clientsCount }) : t('admin.noClients')}
                    </p>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
                <Switch
                  checked={u.canBeTrainer}
                  onCheckedChange={(value) => toggle(u.id, value)}
                  aria-label={t('admin.canBeTrainerFor', { name: u.displayName })}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
