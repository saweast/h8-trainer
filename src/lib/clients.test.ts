import { describe, expect, it } from 'vitest'
import { clientFlags, currentMembership, daysSince } from './clients'
import type { MembershipWithUsage } from './membership'

const today = new Date(2026, 10, 5)
const m = (o: Partial<MembershipWithUsage>): MembershipWithUsage => ({
  id: 'x',
  kind: 'trainer',
  trainerId: 't1',
  startsOn: '2026-10-01',
  endsOn: '2026-12-31',
  sessionsTotal: 12,
  sessionsUsed: 3,
  ...o,
})

describe('currentMembership', () => {
  it('prefers the usable package of this trainer', () => {
    const list = [m({ id: 'old', startsOn: '2026-08-01', endsOn: '2026-09-01' }), m({ id: 'now' }), m({ id: 'other', trainerId: 't2' })]
    expect(currentMembership(list, 'trainer', today, 't1')?.membership.id).toBe('now')
  })

  it('falls back to the latest one so an expired package still shows', () => {
    const list = [m({ id: 'a', startsOn: '2026-07-01', endsOn: '2026-08-01' }), m({ id: 'b', startsOn: '2026-09-01', endsOn: '2026-10-01' })]
    expect(currentMembership(list, 'trainer', today, 't1')).toMatchObject({ membership: { id: 'b' }, status: 'expired' })
  })

  it('handles gym memberships and none', () => {
    const gym = m({ id: 'g', kind: 'gym', trainerId: null, sessionsTotal: null, endsOn: '2026-11-08' })
    expect(currentMembership([gym], 'gym', today)).toMatchObject({ membership: { id: 'g' }, status: 'expiring' })
    expect(currentMembership([gym], 'trainer', today, 't1')).toBeNull()
  })
})

describe('clientFlags', () => {
  it('flags renewals and inactivity', () => {
    const pkg = currentMembership([m({ sessionsUsed: 11 })], 'trainer', today, 't1')
    expect(clientFlags('2026-11-01T10:00:00Z', pkg, null, today)).toEqual({ needsRenewal: true, inactive: false })
    expect(clientFlags('2026-10-20T10:00:00Z', null, null, today)).toEqual({ needsRenewal: false, inactive: true })
    expect(clientFlags(null, null, null, today).inactive).toBe(true)
  })

  it('counts days since the last workout', () => {
    expect(daysSince('2026-11-02T18:00:00', today)).toBe(3)
    expect(daysSince(null, today)).toBeNull()
  })
})
