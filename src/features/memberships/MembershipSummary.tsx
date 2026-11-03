import { Building2, UserStar, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface SummaryCardProps {
  icon: LucideIcon
  label: string
  value: string
  hint?: string
  empty?: boolean
}

function SummaryCard({ icon: Icon, label, value, hint, empty = false }: SummaryCardProps) {
  return (
    <div className="rounded-2xl border bg-card p-3">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5" aria-hidden />
        {label}
      </p>
      <p className={empty ? 'mt-1.5 text-sm text-muted-foreground' : 'tabular mt-1 text-[17px] font-medium'}>{value}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

// TODO(stage 8): read `membership_usage` and show days / sessions left with expiring badges.
export function MembershipSummary() {
  const { t } = useTranslation()
  return (
    <div className="grid grid-cols-2 gap-2">
      <SummaryCard icon={Building2} label={t('home.gym')} value={t('home.noGym')} empty />
      <SummaryCard icon={UserStar} label={t('home.trainerPackage')} value={t('home.noPackage')} empty />
    </div>
  )
}
