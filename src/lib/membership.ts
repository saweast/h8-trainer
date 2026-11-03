import { differenceInCalendarDays, parseISO, startOfDay } from 'date-fns'

export type MembershipKind = 'trainer' | 'gym'
export type MembershipStatus = 'upcoming' | 'active' | 'expiring' | 'expired' | 'used_up'

/** A membership row joined with its usage (`membership_usage` view). Dates are `YYYY-MM-DD`. */
export interface MembershipWithUsage {
  id: string
  kind: MembershipKind
  trainerId: string | null
  startsOn: string
  endsOn: string | null
  sessionsTotal: number | null
  sessionsUsed: number
}

export const EXPIRING_DAYS = 7
export const EXPIRING_SESSIONS = 2

function toLocalDay(date: string): Date {
  return startOfDay(parseISO(date))
}

/** Calendar days until the last valid day; 0 = ends today, negative = already over. */
export function daysLeft(m: Pick<MembershipWithUsage, 'endsOn'>, today: Date): number | null {
  if (!m.endsOn) return null
  return differenceInCalendarDays(toLocalDay(m.endsOn), startOfDay(today))
}

export function sessionsLeft(m: Pick<MembershipWithUsage, 'sessionsTotal' | 'sessionsUsed'>): number | null {
  if (m.sessionsTotal === null) return null
  return Math.max(m.sessionsTotal - m.sessionsUsed, 0)
}

export function membershipStatus(m: MembershipWithUsage, today: Date): MembershipStatus {
  const days = daysLeft(m, today)
  const left = sessionsLeft(m)
  if (days !== null && days < 0) return 'expired'
  if (left !== null && left === 0) return 'used_up'
  if (differenceInCalendarDays(toLocalDay(m.startsOn), startOfDay(today)) > 0) return 'upcoming'
  if ((days !== null && days <= EXPIRING_DAYS) || (left !== null && left <= EXPIRING_SESSIONS)) {
    return 'expiring'
  }
  return 'active'
}

export function isUsable(status: MembershipStatus): boolean {
  return status === 'active' || status === 'expiring'
}

/**
 * The trainer package a new session should be charged to: usable packages of this trainer,
 * the one ending soonest first (FIFO), open-ended ones last.
 */
export function pickMembershipToCharge(
  memberships: MembershipWithUsage[],
  trainerId: string,
  today: Date,
): MembershipWithUsage | null {
  const candidates = memberships.filter(
    (m) => m.kind === 'trainer' && m.trainerId === trainerId && isUsable(membershipStatus(m, today)),
  )
  candidates.sort((a, b) => {
    if (a.endsOn !== b.endsOn) {
      if (a.endsOn === null) return 1
      if (b.endsOn === null) return -1
      return a.endsOn < b.endsOn ? -1 : 1
    }
    return a.startsOn < b.startsOn ? -1 : a.startsOn > b.startsOn ? 1 : 0
  })
  return candidates[0] ?? null
}
