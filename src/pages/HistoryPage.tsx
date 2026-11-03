import { CalendarDays } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '@/components/common/EmptyState'
import { PageHeader } from '@/components/common/PageHeader'

export function HistoryPage() {
  const { t } = useTranslation()
  return (
    <div>
      <PageHeader title={t('history.title')} />
      <EmptyState icon={CalendarDays} title={t('history.emptyTitle')} body={t('history.emptyBody')} />
    </div>
  )
}
