import { Dumbbell } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '@/components/common/EmptyState'
import { PageHeader } from '@/components/common/PageHeader'
import { MembershipSummary } from '@/features/memberships/MembershipSummary'
import { StartWorkoutDrawer } from '@/features/workout/StartWorkoutDrawer'
import { currentLanguage } from '@/i18n'
import { formatLongDay } from '@/lib/dates'

export function HomePage() {
  const { t } = useTranslation()
  const [today] = useState(() => new Date())
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('home.title')} subtitle={formatLongDay(today, currentLanguage())} />
      <MembershipSummary />
      <StartWorkoutDrawer />
      <section className="mt-2">
        <h2 className="mb-2 text-[15px] font-medium">{t('home.recent')}</h2>
        <EmptyState icon={Dumbbell} title={t('home.recentEmptyTitle')} body={t('home.recentEmptyBody')} />
      </section>
    </div>
  )
}
