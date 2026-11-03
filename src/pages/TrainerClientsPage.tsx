import { Search, Send, UserPlus, Users } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate } from 'react-router'
import { toast } from 'sonner'
import { Chip } from '@/components/common/Chip'
import { EmptyState } from '@/components/common/EmptyState'
import { PageHeader } from '@/components/common/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useMode } from '@/features/mode/modeContext'

type Filter = 'all' | 'expiring' | 'inactive'

// TODO(stage 7): rows from `trainer_clients_overview()` + `membership_usage`.
export function TrainerClientsPage() {
  const { t } = useTranslation()
  const { isTrainer, ready } = useMode()
  const [filter, setFilter] = useState<Filter>('all')

  if (!ready) return <Skeleton className="h-64 rounded-2xl" />
  if (!isTrainer) return <Navigate to="/" replace />

  const notYet = () => toast(t('common.needsDatabase'))

  return (
    <div className="flex flex-col gap-3">
      <PageHeader title={t('trainer.clientsTitle')} />
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input type="search" placeholder={t('trainer.search')} aria-label={t('trainer.search')} className="h-11 rounded-xl pl-10" />
      </div>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        <Chip active={filter === 'all'} onClick={() => setFilter('all')}>
          {t('common.all')}
        </Chip>
        <Chip active={filter === 'expiring'} onClick={() => setFilter('expiring')}>
          {t('trainer.filterExpiring')}
        </Chip>
        <Chip active={filter === 'inactive'} onClick={() => setFilter('inactive')}>
          {t('trainer.filterInactive')}
        </Chip>
      </div>
      <EmptyState icon={Users} title={t('trainer.emptyTitle')} body={t('trainer.emptyBody')}>
        <Button size="xl" onClick={notYet}>
          <UserPlus aria-hidden />
          {t('trainer.addOffline')}
        </Button>
        <Button variant="secondary" size="touch" onClick={notYet}>
          <Send aria-hidden />
          {t('trainer.invite')}
        </Button>
      </EmptyState>
    </div>
  )
}
