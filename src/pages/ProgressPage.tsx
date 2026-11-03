import { ChartLine, ChevronRight, Ruler } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { EmptyState } from '@/components/common/EmptyState'
import { PageHeader } from '@/components/common/PageHeader'

export function ProgressPage() {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('progress.title')} />
      <EmptyState icon={ChartLine} title={t('progress.emptyTitle')} body={t('progress.emptyBody')} />
      <Link to="/body" className="flex min-h-14 items-center gap-3 rounded-2xl border bg-card px-4 transition-colors hover:bg-secondary">
        <Ruler className="size-5 text-muted-foreground" aria-hidden />
        <span className="flex-1 text-sm font-medium">{t('progress.body')}</span>
        <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
      </Link>
    </div>
  )
}
