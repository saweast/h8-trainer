import { describe, expect, it } from 'vitest'
import {
  daysLeft,
  membershipStatus,
  pickMembershipToCharge,
  sessionsLeft,
  type MembershipWithUsage,
} from './membership'

const today = new Date(2026, 10, 4) // 4 Nov 2026, local time

function pkg(overrides: Partial<MembershipWithUsage> = {}): MembershipWithUsage {
  return {
    id: 'm1',
    kind: 'trainer',
    trainerId: 't1',
    startsOn: '2026-10-01',
    endsOn: '2026-12-15',
    sessionsTotal: 12,
    sessionsUsed: 7,
    ...overrides,
  }
}

describe('daysLeft / sessionsLeft', () => {
  it('counts calendar days to the last valid day', () => {
    expect(daysLeft(pkg({ endsOn: '2026-11-04' }), today)).toBe(0)
    expect(daysLeft(pkg({ endsOn: '2026-11-28' }), today)).toBe(24)
    expect(daysLeft(pkg({ endsOn: '2026-11-03' }), today)).toBe(-1)
    expect(daysLeft(pkg({ endsOn: null }), today)).toBeNull()
  })

  it('never goes below zero sessions and supports unlimited packages', () => {
    expect(sessionsLeft(pkg())).toBe(5)
    expect(sessionsLeft(pkg({ sessionsUsed: 15 }))).toBe(0)
    expect(sessionsLeft(pkg({ sessionsTotal: null }))).toBeNull()
  })
})

describe('membershipStatus', () => {
  it('is active with plenty of time and sessions left', () => {
    expect(membershipStatus(pkg(), today)).toBe('active')
  })

  it('is expiring within 7 days or 2 sessions', () => {
    expect(membershipStatus(pkg({ endsOn: '2026-11-11' }), today)).toBe('expiring')
    expect(membershipStatus(pkg({ endsOn: '2026-11-12' }), today)).toBe('active')
    expect(membershipStatus(pkg({ sessionsUsed: 10 }), today)).toBe('expiring')
  })

  it('stays usable on its last day', () => {
    expect(membershipStatus(pkg({ endsOn: '2026-11-04' }), today)).toBe('expiring')
  })

  it('detects expired, used-up and future packages', () => {
    expect(membershipStatus(pkg({ endsOn: '2026-11-03' }), today)).toBe('expired')
    expect(membershipStatus(pkg({ sessionsUsed: 12 }), today)).toBe('used_up')
    expect(membershipStatus(pkg({ startsOn: '2026-11-05' }), today)).toBe('upcoming')
  })

  it('handles open-ended gym memberships', () => {
    expect(
      membershipStatus(pkg({ kind: 'gym', trainerId: null, endsOn: null, sessionsTotal: null, sessionsUsed: 40 }), today),
    ).toBe('active')
  })
})

describe('pickMembershipToCharge', () => {
  it('charges the usable package that ends first', () => {
    const later = pkg({ id: 'later', endsOn: '2027-01-31' })
    const sooner = pkg({ id: 'sooner', endsOn: '2026-11-30' })
    const openEnded = pkg({ id: 'open', endsOn: null })
    expect(pickMembershipToCharge([openEnded, later, sooner], 't1', today)?.id).toBe('sooner')
  })

  it('skips other trainers, gym memberships and unusable packages', () => {
    const memberships = [
      pkg({ id: 'other-trainer', trainerId: 't2' }),
      pkg({ id: 'gym', kind: 'gym', trainerId: null }),
      pkg({ id: 'used-up', sessionsUsed: 12 }),
      pkg({ id: 'expired', endsOn: '2026-10-31' }),
      pkg({ id: 'future', startsOn: '2026-12-01' }),
    ]
    expect(pickMembershipToCharge(memberships, 't1', today)).toBeNull()
  })

  it('falls back to open-ended packages', () => {
    expect(pickMembershipToCharge([pkg({ id: 'open', endsOn: null })], 't1', today)?.id).toBe('open')
  })
})
