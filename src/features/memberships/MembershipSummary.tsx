import { useState } from 'react'
import { useAuth } from '@/features/auth/authContext'
import { currentMembership } from '@/lib/clients'
import { isSupabaseConfigured } from '@/lib/supabase'
import { useMemberships, type Membership } from './api'
import { MembershipCard } from './MembershipCard'
import { MembershipDrawer, type MembershipDraftTarget } from './MembershipDrawer'

/** Home tiles: my gym membership (I can add/edit it) and my trainer package (read-only). */
export function MembershipSummary({ athleteId }: { athleteId: string | undefined }) {
  const { user } = useAuth()
  const { data } = useMemberships(athleteId)
  const [today] = useState(() => new Date())
  const [target, setTarget] = useState<MembershipDraftTarget | null>(null)
  const mine = (data ?? []).filter((m) => m.athleteId === athleteId)

  const gym = currentMembership<Membership>(mine, 'gym', today)
  const pkg = currentMembership<Membership>(mine, 'trainer', today)
  const canEditGym = isSupabaseConfigured && Boolean(athleteId)
  // A trainer who logs their own training can't sell themselves a package.
  const ownPackage = pkg && pkg.membership.trainerId === user?.id

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <MembershipCard
          kind="gym"
          current={gym}
          today={today}
          variant="tile"
          onClick={canEditGym ? () => setTarget(gym ? { mode: 'edit', membership: gym.membership } : { mode: 'new', kind: 'gym' }) : undefined}
        />
        <MembershipCard kind="trainer" current={ownPackage ? null : pkg} today={today} variant="tile" />
      </div>
      <MembershipDrawer athleteId={athleteId} target={target} canSellPackages={false} onClose={() => setTarget(null)} />
    </>
  )
}
