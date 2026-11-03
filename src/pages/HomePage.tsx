import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '@/components/common/PageHeader'
import { useMyAthleteId } from '@/features/athlete/useMyAthlete'
import { MembershipSummary } from '@/features/memberships/MembershipSummary'
import { RecentWorkouts, StartOrResume } from '@/features/workout/HomeWorkouts'
import { currentLanguage } from '@/i18n'
import { formatLongDay } from '@/lib/dates'

export function HomePage() {
  const { t } = useTranslation()
  const [today] = useState(() => new Date())
  const { data: athleteId } = useMyAthleteId()

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('home.title')} subtitle={formatLongDay(today, currentLanguage())} />
      <MembershipSummary />
      <StartOrResume athleteId={athleteId} />
      <section className="mt-2">
        <h2 className="mb-2 text-[15px] font-medium">{t('home.recent')}</h2>
        <RecentWorkouts athleteId={athleteId} />
      </section>
    </div>
  )
}
