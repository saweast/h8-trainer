import { Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '@/components/common/EmptyState'

export function ComingSoonPage() {
  const { t } = useTranslation()
  return <EmptyState icon={Sparkles} title={t('comingSoon.title')} body={t('comingSoon.body')} className="mt-6" />
}
