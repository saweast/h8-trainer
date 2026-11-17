import { ArrowLeft, Check, ChevronRight, ClipboardList, Play, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { UserAvatar } from '@/components/common/UserAvatar'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Switch } from '@/components/ui/switch'
import { useAuth } from '@/features/auth/authContext'
import { useMemberships, type Membership } from '@/features/memberships/api'
import { useIsMine, useTemplates } from '@/features/templates/api'
import { useTrainerClients } from '@/features/trainer/api'
import { currentMembership } from '@/lib/clients'
import { cn } from '@/lib/utils'
import { useStartGroupWorkout, useTrainingNow } from './groupApi'

const MAX_CLIENTS = 10

interface StartGroupDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Split session: pick clients (and whose package to charge), then empty or a template. */
export function StartGroupDrawer({ open, onOpenChange }: StartGroupDrawerProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isMine = useIsMine()
  const [step, setStep] = useState<'clients' | 'start'>('clients')
  const [selected, setSelected] = useState<string[]>([])
  const [noCharge, setNoCharge] = useState<Set<string>>(new Set())
  const [today] = useState(() => new Date())
  const { data: clients } = useTrainerClients(open)
  const { data: memberships } = useMemberships()
  const { data: training } = useTrainingNow(open)
  const { data: templates } = useTemplates()
  const start = useStartGroupWorkout()

  // The package each client would be charged from (mine, usable today), if any.
  const chargeable = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of clients ?? []) {
      const own = (memberships ?? []).filter((m) => m.athleteId === c.athleteId)
      const pkg = currentMembership<Membership>(own, 'trainer', today, user?.id)
      if (pkg && (pkg.status === 'active' || pkg.status === 'expiring')) map.set(c.athleteId, pkg.membership.id)
    }
    return map
  }, [clients, memberships, today, user?.id])

  const myTemplates = [...(templates ?? [])].filter((tpl) => isMine(tpl.ownerId)).sort((a, b) => a.name.localeCompare(b.name))

  const change = (next: boolean) => {
    if (!next) {
      setStep('clients')
      setSelected([])
      setNoCharge(new Set())
    }
    onOpenChange(next)
  }

  const toggle = (athleteId: string) => {
    setSelected((list) =>
      list.includes(athleteId) ? list.filter((id) => id !== athleteId) : list.length >= MAX_CLIENTS ? list : [...list, athleteId],
    )
  }

  const toggleCharge = (athleteId: string, charge: boolean) => {
    setNoCharge((set) => {
      const next = new Set(set)
      if (charge) next.delete(athleteId)
      else next.add(athleteId)
      return next
    })
  }

  const go = (templateId: string | null) => {
    if (start.isPending) return
    start.mutate(
      {
        athleteIds: selected,
        membershipIds: selected.map((id) => (noCharge.has(id) ? null : (chargeable.get(id) ?? null))),
        templateId,
      },
      {
        onSuccess: (groupId) => {
          change(false)
          navigate(`/group/${groupId}`)
        },
        onError: () => toast.error(t('group.startError')),
      },
    )
  }

  return (
    <Drawer open={open} onOpenChange={change}>
      <DrawerContent className="mx-auto max-h-[88dvh] max-w-md">
        <DrawerHeader className="group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
          <div className="flex items-center gap-1">
            {step === 'start' ? (
              <Button variant="ghost" size="icon-touch" className="-ml-3" aria-label={t('common.back')} onClick={() => setStep('clients')}>
                <ArrowLeft />
              </Button>
            ) : null}
            <DrawerTitle className="font-heading text-lg">{t('group.title')}</DrawerTitle>
          </div>
          <DrawerDescription>
            {step === 'clients' ? t('group.description') : t('group.clients', { count: selected.length })}
          </DrawerDescription>
        </DrawerHeader>

        {step === 'clients' ? (
          <>
            <ul className="mx-4 min-h-0 flex-1 divide-y overflow-y-auto rounded-2xl border bg-card">
              {(clients ?? []).map((c) => {
                const busy = training?.has(c.athleteId) ?? false
                const on = selected.includes(c.athleteId)
                const pkg = chargeable.get(c.athleteId)
                return (
                  <li key={c.athleteId} className="flex min-h-14 items-center gap-3 px-3 py-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => toggle(c.athleteId)}
                      aria-pressed={on}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:opacity-50"
                    >
                      <span
                        className={cn(
                          'flex size-6 shrink-0 items-center justify-center rounded-md border-2',
                          on ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
                        )}
                        aria-hidden
                      >
                        {on ? <Check className="size-4" /> : null}
                      </span>
                      <UserAvatar name={c.displayName} src={c.avatarUrl} className="size-8" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{c.displayName}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {busy ? t('group.busy') : pkg ? t('group.hasPackage') : t('membership.none')}
                        </span>
                      </span>
                    </button>
                    {on && pkg ? (
                      <label className="flex shrink-0 items-center gap-2 text-xs text-trainer-text">
                        {t('group.charge')}
                        <Switch
                          checked={!noCharge.has(c.athleteId)}
                          onCheckedChange={(v) => toggleCharge(c.athleteId, v)}
                          aria-label={t('group.chargeFor', { name: c.displayName })}
                        />
                      </label>
                    ) : null}
                  </li>
                )
              })}
            </ul>
            <div className="px-4 pt-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
              <Button size="xl" className="w-full" disabled={selected.length < 2} onClick={() => setStep('start')}>
                {selected.length < 2 ? t('group.pickTwo') : t('group.next', { count: selected.length })}
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-3 overflow-y-auto px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={() => go(null)}
              disabled={start.isPending}
              className="flex min-h-16 items-center gap-3 rounded-2xl border bg-card px-4 py-3 text-left transition-colors hover:bg-secondary"
            >
              <span className="flex size-10 items-center justify-center rounded-xl bg-secondary">
                <Plus className="size-5" aria-hidden />
              </span>
              <span className="flex-1">
                <span className="block text-sm font-medium">{t('start.empty')}</span>
                <span className="block text-xs text-muted-foreground">{t('start.emptyHint')}</span>
              </span>
              <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
            </button>

            <p className="mt-2 text-xs font-medium text-muted-foreground">{t('start.templates')}</p>
            {myTemplates.length ? (
              <ul className="divide-y rounded-2xl border bg-card">
                {myTemplates.map((tpl) => (
                  <li key={tpl.id}>
                    <button
                      type="button"
                      disabled={start.isPending}
                      onClick={() => go(tpl.id)}
                      className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-secondary/50"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{tpl.name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {t('templates.exercises', { count: tpl.exerciseCount })}
                        </span>
                      </span>
                      <Play className="size-4 text-muted-foreground" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex items-start gap-3 rounded-2xl bg-secondary/60 px-4 py-3 text-sm text-muted-foreground">
                <ClipboardList className="mt-0.5 size-4 shrink-0" aria-hidden />
                {t('start.noTemplates')}
              </div>
            )}
            <p className="text-xs text-muted-foreground">{t('group.prefillHint')}</p>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  )
}
