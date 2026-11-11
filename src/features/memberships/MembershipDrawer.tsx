import { addMonths, format, parseISO } from 'date-fns'
import { Minus, Plus, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Chip } from '@/components/common/Chip'
import { SegmentedControl } from '@/components/common/SegmentedControl'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { MembershipKind } from '@/lib/membership'
import { useDeleteMembership, useSaveMembership, type Membership } from './api'

export type MembershipDraftTarget =
  | { mode: 'new'; kind: MembershipKind }
  | { mode: 'edit'; membership: Membership }

interface MembershipDrawerProps {
  athleteId: string | undefined
  target: MembershipDraftTarget | null
  /** Only a linked trainer may create trainer packages. */
  canSellPackages: boolean
  onClose: () => void
}

export function MembershipDrawer({ athleteId, target, canSellPackages, onClose }: MembershipDrawerProps) {
  return (
    <Drawer open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="mx-auto max-h-[92dvh] max-w-md">
        {target && athleteId ? (
          <Form
            key={target.mode === 'edit' ? target.membership.id : `new-${target.kind}`}
            athleteId={athleteId}
            target={target}
            canSellPackages={canSellPackages}
            onClose={onClose}
          />
        ) : null}
      </DrawerContent>
    </Drawer>
  )
}

const PRESETS = [8, 10, 12, 16] as const
const ymd = (d: Date) => format(d, 'yyyy-MM-dd')

function Form({ athleteId, target, canSellPackages, onClose }: { athleteId: string; target: MembershipDraftTarget; canSellPackages: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const save = useSaveMembership()
  const remove = useDeleteMembership()
  const editing = target.mode === 'edit' ? target.membership : null
  const [today] = useState(() => ymd(new Date()))

  const [kind, setKind] = useState<MembershipKind>(editing?.kind ?? (target.mode === 'new' ? target.kind : 'gym'))
  const [sessions, setSessions] = useState<number | null>(editing ? editing.sessionsTotal : kind === 'trainer' ? 12 : null)
  const [startsOn, setStartsOn] = useState(editing?.startsOn ?? today)
  const [endsOn, setEndsOn] = useState<string>(editing?.endsOn ?? ymd(addMonths(parseISO(today), 1)))
  const [paidOn, setPaidOn] = useState<string>(editing?.paidOn ?? (editing ? '' : today))
  const [title, setTitle] = useState(editing?.title ?? '')
  const [notes, setNotes] = useState(editing?.notes ?? '')
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const extend = (months: number) => setEndsOn(ymd(addMonths(parseISO(startsOn || today), months)))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (endsOn && startsOn && endsOn < startsOn) {
      setError(t('membership.datesError'))
      return
    }
    save.mutate(
      {
        id: editing?.id ?? null,
        athleteId,
        kind,
        title,
        startsOn: startsOn || today,
        endsOn: endsOn || null,
        sessionsTotal: sessions,
        paidOn: paidOn || null,
        notes,
      },
      {
        onSuccess: () => {
          toast.success(t('membership.saved'))
          onClose()
        },
        onError: () => toast.error(t('membership.error')),
      },
    )
  }

  const heading = editing
    ? t('membership.edit')
    : kind === 'trainer'
      ? t('membership.newTrainer')
      : t('membership.newGym')

  return (
    <>
      <DrawerHeader className="group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
        <DrawerTitle className="font-heading text-lg">{heading}</DrawerTitle>
        <DrawerDescription className="sr-only">{heading}</DrawerDescription>
      </DrawerHeader>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4 overflow-x-hidden overflow-y-auto px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        {canSellPackages && !editing ? (
          <SegmentedControl<MembershipKind>
            ariaLabel={t('membership.kind')}
            value={kind}
            onChange={(k) => {
              setKind(k)
              setSessions(k === 'trainer' ? 12 : null)
            }}
            options={[
              { value: 'trainer', label: t('membership.kindTrainer') },
              { value: 'gym', label: t('membership.kindGym') },
            ]}
          />
        ) : null}

        <div className="flex flex-col gap-1.5">
          <Label>{kind === 'trainer' ? t('membership.sessions') : t('membership.visits')}</Label>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="icon-touch"
              aria-label="−1"
              onClick={() => setSessions((s) => (s === null ? 12 : Math.max(1, s - 1)))}
            >
              <Minus />
            </Button>
            <output className="font-heading tabular flex h-11 flex-1 items-center justify-center rounded-xl bg-secondary text-xl">
              {sessions ?? '∞'}
            </output>
            <Button
              type="button"
              variant="secondary"
              size="icon-touch"
              aria-label="+1"
              onClick={() => setSessions((s) => (s === null ? 12 : Math.min(500, s + 1)))}
            >
              <Plus />
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((n) => (
              <Chip key={n} active={sessions === n} onClick={() => setSessions(n)}>
                {n}
              </Chip>
            ))}
            <Chip active={sessions === null} onClick={() => setSessions(null)}>
              {t('membership.unlimited')}
            </Chip>
          </div>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="ms-start">{t('membership.startsOn')}</Label>
            <Input id="ms-start" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} className="h-11 rounded-xl" />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="ms-end">{t('membership.endsOn')}</Label>
            <Input
              id="ms-end"
              type="date"
              value={endsOn}
              min={startsOn}
              onChange={(e) => {
                setEndsOn(e.target.value)
                setError(null)
              }}
              className="h-11 rounded-xl"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3].map((n) => (
            <Chip key={n} onClick={() => extend(n)}>
              {t('membership.months', { n })}
            </Chip>
          ))}
          <Chip active={!endsOn} onClick={() => setEndsOn('')}>
            {t('membership.noEnd')}
          </Chip>
        </div>
        {error ? <p className="-mt-2 text-xs text-destructive">{error}</p> : null}

        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="ms-paid">{t('membership.paidOn')}</Label>
            <Input id="ms-paid" type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} className="h-11 rounded-xl" />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="ms-title">{t('membership.title')}</Label>
            <Input
              id="ms-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={kind === 'trainer' ? t('membership.titlePlaceholder') : 'Sport Life'}
              maxLength={80}
              className="h-11 rounded-xl"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ms-notes">{t('membership.notes')}</Label>
          <Input id="ms-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} className="h-11 rounded-xl" />
        </div>

        <Button type="submit" size="xl" disabled={save.isPending}>
          {t('membership.save')}
        </Button>

        {editing ? (
          confirmDelete ? (
            <div className="flex flex-col gap-2 rounded-xl bg-danger-muted p-3">
              <p className="text-sm text-danger-text">{t('membership.deleteConfirm')}</p>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="secondary" size="touch" onClick={() => setConfirmDelete(false)}>
                  {t('common.cancel')}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="touch"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(editing.id, { onSuccess: onClose, onError: () => toast.error(t('membership.error')) })}
                >
                  {t('workout.discardYes')}
                </Button>
              </div>
            </div>
          ) : (
            <Button type="button" variant="ghost" size="touch" className="text-destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 aria-hidden />
              {t('membership.delete')}
            </Button>
          )
        ) : null}
      </form>
    </>
  )
}
