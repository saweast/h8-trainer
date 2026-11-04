import { Building2, Plus, UserStar } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { currentLanguage } from '@/i18n'
import type { CurrentMembership } from '@/lib/clients'
import { dateLocale } from '@/lib/dates'
import { daysLeft, sessionsLeft, type MembershipStatus } from '@/lib/membership'
import { cn } from '@/lib/utils'
import type { Membership } from './api'

const STATUS_CLASS: Record<MembershipStatus, string> = {
  upcoming: 'bg-secondary text-muted-foreground',
  active: 'bg-lime-muted text-lime-text',
  expiring: 'bg-warning-muted text-warning-text',
  expired: 'bg-danger-muted text-danger-text',
  used_up: 'bg-danger-muted text-danger-text',
}

export function StatusBadge({ status }: { status: MembershipStatus }) {
  const { t } = useTranslation()
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', STATUS_CLASS[status])}>
      {t(`membership.status.${status}`)}
    </span>
  )
}

interface MembershipCardProps {
  kind: 'trainer' | 'gym'
  current: CurrentMembership<Membership> | null
  today: Date
  /** Large card with a progress bar (client page) vs. compact tile (home). */
  variant?: 'full' | 'tile'
  onClick?: () => void
}

export function MembershipCard({ kind, current, today, variant = 'full', onClick }: MembershipCardProps) {
  const { t } = useTranslation()
  const lang = currentLanguage()
  const locale = dateLocale(lang)
  const Icon = kind === 'trainer' ? UserStar : Building2
  const label = kind === 'trainer' ? t('membership.trainerPackage') : t('membership.gym')
  const date = (d: string) => format(parseISO(d), 'd MMM', { locale })

  const Wrapper = onClick ? 'button' : 'div'

  if (!current) {
    return (
      <Wrapper
        type={onClick ? 'button' : undefined}
        onClick={onClick}
        className={cn('flex w-full flex-col rounded-2xl border bg-card p-3 text-left', onClick && 'transition-colors hover:bg-secondary/50')}
      >
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Icon className="size-3.5" aria-hidden />
          {label}
        </span>
        <span className="mt-1.5 flex items-center gap-1.5 text-sm text-muted-foreground">
          {onClick ? <Plus className="size-4" aria-hidden /> : null}
          {kind === 'trainer' ? t('membership.none') : t('membership.noneGym')}
        </span>
      </Wrapper>
    )
  }

  const { membership: m, status } = current
  const left = sessionsLeft(m)
  const days = daysLeft(m, today)
  const daysText = days === null ? null : days === 0 ? t('membership.endsToday') : days > 0 ? t('membership.days', { count: days }) : null

  // Headline: sessions left for packages with a count, otherwise days left.
  const headline =
    left !== null
      ? { big: String(left), small: t('membership.ofTotal', { total: m.sessionsTotal }) }
      : daysText
        ? { big: daysText, small: '' }
        : { big: t('membership.unlimited'), small: '' }

  const details = [
    m.endsOn ? t('membership.until', { date: date(m.endsOn) }) : t('membership.since', { date: date(m.startsOn) }),
    left !== null && daysText && variant === 'full' ? daysText : null,
    m.paidOn && variant === 'full' ? t('membership.paid', { date: date(m.paidOn) }) : null,
  ].filter(Boolean)

  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn('flex w-full flex-col rounded-2xl border bg-card p-3 text-left', onClick && 'transition-colors hover:bg-secondary/50')}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <Icon className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{m.title || label}</span>
        </span>
        {variant === 'full' || status !== 'active' ? <StatusBadge status={status} /> : null}
      </span>
      <span className="mt-1 flex items-baseline gap-1.5">
        <span className={cn('tabular font-medium', variant === 'full' && left !== null ? 'font-heading text-3xl' : 'text-[17px]')}>
          {headline.big}
        </span>
        {headline.small ? <span className="text-xs text-muted-foreground">{headline.small}</span> : null}
      </span>
      {variant === 'full' && left !== null && m.sessionsTotal ? (
        <span className="my-2 block h-1.5 overflow-hidden rounded-full bg-secondary" aria-hidden>
          <span
            className="block h-full rounded-full bg-primary"
            style={{ width: `${Math.min(100, (left / m.sessionsTotal) * 100)}%` }}
          />
        </span>
      ) : null}
      <span className="tabular text-xs text-muted-foreground">{details.join(' · ')}</span>
    </Wrapper>
  )
}
