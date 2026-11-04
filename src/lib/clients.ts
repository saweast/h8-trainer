import { differenceInCalendarDays } from 'date-fns'
import { isUsable, membershipStatus, pickMembershipToCharge, type MembershipStatus, type MembershipWithUsage } from './membership'

export const INACTIVE_DAYS = 10

export interface CurrentMembership<M extends MembershipWithUsage> {
  membership: M
  status: MembershipStatus
}

/**
 * The membership to show on a card: the usable one (soonest-ending first), otherwise the most
 * recently started one so an expired package is still visible.
 */
export function currentMembership<M extends MembershipWithUsage>(
  memberships: M[],
  kind: 'trainer' | 'gym',
  today: Date,
  trainerId?: string,
): CurrentMembership<M> | null {
  const ofKind = memberships.filter((m) => m.kind === kind && (kind === 'gym' || !trainerId || m.trainerId === trainerId))
  if (!ofKind.length) return null
  const usable =
    kind === 'trainer' && trainerId
      ? pickMembershipToCharge(ofKind, trainerId, today)
      : (ofKind.filter((m) => isUsable(membershipStatus(m, today))).sort((a, b) => (a.endsOn ?? '9999') < (b.endsOn ?? '9999') ? -1 : 1)[0] ?? null)
  const membership = (usable as M | null) ?? [...ofKind].sort((a, b) => (a.startsOn < b.startsOn ? 1 : -1))[0]
  return { membership, status: membershipStatus(membership, today) }
}

export function daysSince(iso: string | null, today: Date): number | null {
  return iso ? differenceInCalendarDays(today, new Date(iso)) : null
}

export interface ClientFlags {
  /** A package or gym membership that needs attention (ending soon, over, used up). */
  needsRenewal: boolean
  inactive: boolean
}

export function clientFlags(
  lastWorkoutAt: string | null,
  pkg: CurrentMembership<MembershipWithUsage> | null,
  gym: CurrentMembership<MembershipWithUsage> | null,
  today: Date,
): ClientFlags {
  const attention = (c: CurrentMembership<MembershipWithUsage> | null) =>
    c !== null && (c.status === 'expiring' || c.status === 'expired' || c.status === 'used_up')
  const days = daysSince(lastWorkoutAt, today)
  return {
    needsRenewal: attention(pkg) || attention(gym),
    inactive: days === null || days >= INACTIVE_DAYS,
  }
}
