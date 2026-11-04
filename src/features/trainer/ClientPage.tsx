import { ArrowLeft, Check, ChevronRight, EllipsisVertical, Pencil, Play, Plus, Ruler, Send, Trash2, UserMinus } from 'lucide-react'
import { format } from 'date-fns'
import { useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { EmptyState } from '@/components/common/EmptyState'
import { UserAvatar } from '@/components/common/UserAvatar'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { exerciseName } from '@/data/exercises'
import { useAuth } from '@/features/auth/authContext'
import { useExerciseMap } from '@/features/exercises/api'
import { useMemberships, type Membership } from '@/features/memberships/api'
import { MembershipCard } from '@/features/memberships/MembershipCard'
import { MembershipDrawer, type MembershipDraftTarget } from '@/features/memberships/MembershipDrawer'
import { useMode } from '@/features/mode/modeContext'
import { useIsMine, usePrograms, useTemplates } from '@/features/templates/api'
import { useExerciseRecords, useRecentWorkouts } from '@/features/workout/api'
import { StartWorkoutDrawer } from '@/features/workout/StartWorkoutDrawer'
import { WorkoutList } from '@/features/workout/WorkoutList'
import { currentLanguage } from '@/i18n'
import { currentMembership } from '@/lib/clients'
import { dateLocale } from '@/lib/dates'
import { formatKg, formatVolume } from '@/lib/format'
import { minutesBetween } from '@/lib/time'
import { cn } from '@/lib/utils'
import { useAssignments, useAthlete, useRemoveClient, useRenameAthlete, useToggleAssignment, useTrainerClients } from './api'
import { InviteLink } from './InviteLink'

type Sheet = 'rename' | 'invite' | 'remove' | null

export function ClientPage() {
  const { t } = useTranslation()
  const lang = currentLanguage()
  const navigate = useNavigate()
  const { athleteId } = useParams()
  const { user } = useAuth()
  const { isTrainer, ready } = useMode()
  const { data: athlete, isPending, isError } = useAthlete(athleteId)
  const { data: clients } = useTrainerClients(isTrainer)
  const { data: memberships } = useMemberships(athleteId)
  const { data: recent } = useRecentWorkouts(athleteId, 20)
  const [today] = useState(() => new Date())
  const [membershipTarget, setMembershipTarget] = useState<MembershipDraftTarget | null>(null)
  const [sheet, setSheet] = useState<Sheet>(null)

  const client = clients?.find((c) => c.athleteId === athleteId)
  const pkg = currentMembership<Membership>(memberships ?? [], 'trainer', today, user?.id)
  const gym = currentMembership<Membership>(memberships ?? [], 'gym', today)
  const chargeable = pkg && (pkg.status === 'active' || pkg.status === 'expiring') ? pkg.membership.id : null
  const last = recent?.[0]

  if (!ready) return <Skeleton className="h-64 rounded-2xl" />
  if (!isTrainer) return <Navigate to="/" replace />
  if (isPending) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-20 rounded-2xl" />
      </div>
    )
  }
  if (isError || !athlete || !athleteId) {
    return <EmptyState icon={UserMinus} title={t('trainer.notFound')} className="mt-6" />
  }

  const hasAccount = athlete.userId !== null
  const kg = t('workout.kg')

  return (
    <div className="flex flex-col gap-4">
      <div className="-mt-1 flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon-touch"
          className="-ml-2"
          aria-label={t('common.back')}
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/trainer'))}
        >
          <ArrowLeft />
        </Button>
        <UserAvatar name={athlete.displayName} src={athlete.avatarUrl} />
        <div className="min-w-0 flex-1">
          <h1 className="font-heading truncate text-lg leading-tight">{athlete.displayName}</h1>
          {hasAccount ? null : <p className="text-xs text-muted-foreground">{t('trainer.noAccount')}</p>}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-touch" aria-label={t('trainer.clientMenu')} className="-mr-2">
              <EllipsisVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {hasAccount ? null : (
              <>
                <DropdownMenuItem onSelect={() => setSheet('rename')}>
                  <Pencil />
                  {t('trainer.rename')}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setSheet('invite')}>
                  <Send />
                  {t('trainer.inviteToAccount')}
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuItem variant="destructive" onSelect={() => setSheet('remove')}>
              {hasAccount ? <UserMinus /> : <Trash2 />}
              {hasAccount ? t('trainer.unlink') : t('trainer.deleteClient')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <MembershipCard
        kind="trainer"
        current={pkg}
        today={today}
        onClick={() => setMembershipTarget(pkg ? { mode: 'edit', membership: pkg.membership } : { mode: 'new', kind: 'trainer' })}
      />
      {pkg && (pkg.status === 'expired' || pkg.status === 'used_up' || pkg.status === 'expiring') ? (
        <Button variant="secondary" size="touch" className="-mt-2" onClick={() => setMembershipTarget({ mode: 'new', kind: 'trainer' })}>
          <Plus aria-hidden />
          {t('membership.add')}
        </Button>
      ) : null}
      <MembershipCard
        kind="gym"
        current={gym}
        today={today}
        onClick={() => setMembershipTarget(gym ? { mode: 'edit', membership: gym.membership } : { mode: 'new', kind: 'gym' })}
      />

      {last ? (
        <Link to={`/workout/${last.id}`} className="rounded-2xl border bg-card p-3 transition-colors hover:bg-secondary/50">
          <span className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{t('trainer.lastSession')}</span>
            <span className="tabular">
              {format(new Date(last.startedAt), 'd MMM', { locale: dateLocale(lang) })}
              {last.finishedAt ? ` · ${t('workout.minutes', { count: minutesBetween(last.startedAt, last.finishedAt) })}` : ''}
            </span>
          </span>
          <span className="mt-1 flex items-center justify-between gap-2">
            <span className="truncate text-[15px] font-medium">{last.title || t('recent.untitled')}</span>
            <span className="tabular shrink-0 text-sm text-muted-foreground">
              {formatVolume(last.volumeKg, lang)} {kg}
            </span>
          </span>
        </Link>
      ) : null}

      <div>
        <StartWorkoutDrawer
          athleteId={athleteId}
          forClient={{ athleteId, userId: athlete.userId, name: athlete.displayName, membershipId: chargeable }}
          trigger={
            <Button size="xl" className="w-full">
              <Play aria-hidden />
              {t('trainer.start')}
            </Button>
          }
        />
        <p className={cn('mt-1.5 text-center text-xs', chargeable ? 'text-muted-foreground' : 'text-warning-text')}>
          {chargeable ? t('membership.charge') : t('membership.noActivePackage')}
        </p>
      </div>

      <Tabs defaultValue="history">
        <TabsList className="w-full">
          <TabsTrigger value="history">{t('trainer.tabHistory')}</TabsTrigger>
          <TabsTrigger value="progress">{t('trainer.tabProgress')}</TabsTrigger>
          <TabsTrigger value="templates">{t('trainer.tabTemplates')}</TabsTrigger>
          <TabsTrigger value="body">{t('trainer.tabBody')}</TabsTrigger>
        </TabsList>
        <TabsContent value="history" className="mt-3">
          {recent?.length ? <WorkoutList workouts={recent} /> : <p className="py-6 text-center text-sm text-muted-foreground">{t('trainer.noWorkouts')}</p>}
        </TabsContent>
        <TabsContent value="progress" className="mt-3">
          <ClientProgress athleteId={athleteId} />
        </TabsContent>
        <TabsContent value="templates" className="mt-3">
          <ClientAssignments athleteId={athleteId} />
        </TabsContent>
        <TabsContent value="body" className="mt-3">
          <Button asChild variant="secondary" size="touch" className="w-full">
            <Link to={`/body?athlete=${athleteId}`}>
              <Ruler aria-hidden />
              {t('trainer.openBody')}
            </Link>
          </Button>
        </TabsContent>
      </Tabs>

      <MembershipDrawer
        athleteId={athleteId}
        target={membershipTarget}
        canSellPackages
        onClose={() => setMembershipTarget(null)}
      />
      <ClientSheets
        sheet={sheet}
        onClose={() => setSheet(null)}
        athleteId={athleteId}
        name={athlete.displayName}
        hasAccount={hasAccount || Boolean(client?.hasAccount)}
      />
    </div>
  )
}

function ClientProgress({ athleteId }: { athleteId: string }) {
  const { t } = useTranslation()
  const lang = currentLanguage()
  const { data: records, isPending } = useExerciseRecords(athleteId)
  const { map: exercises } = useExerciseMap()
  const rows = useMemo(
    () =>
      [...(records?.entries() ?? [])]
        .map(([id, r]) => ({ id, ...r, exercise: exercises.get(id) }))
        .filter((r) => r.exercise)
        .sort((a, b) => b.lastPerformedAt.localeCompare(a.lastPerformedAt)),
    [records, exercises],
  )
  if (isPending) return <Skeleton className="h-16 rounded-2xl" />
  if (!rows.length) return <p className="py-6 text-center text-sm text-muted-foreground">{t('trainer.noRecords')}</p>
  return (
    <ul className="divide-y rounded-2xl border bg-card">
      {rows.map((r) => (
        <li key={r.id}>
          <Link to={`/exercises/${r.id}?athlete=${athleteId}`} className="flex min-h-14 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-secondary/50">
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{exerciseName(r.exercise!, lang)}</span>
            {r.bestE1rmKg ?? r.bestWeightKg ? (
              <span className="tabular text-sm">
                {formatKg((r.bestE1rmKg ?? r.bestWeightKg)!, lang)} {t('workout.kg')}
                <span className="ml-1 text-[11px] text-muted-foreground">{r.bestE1rmKg ? t('progress.e1rm') : t('progress.best')}</span>
              </span>
            ) : null}
            <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  )
}

function ClientAssignments({ athleteId }: { athleteId: string }) {
  const { t } = useTranslation()
  const isMine = useIsMine()
  const { data: templates } = useTemplates()
  const { data: programs } = usePrograms()
  const { data: assignments } = useAssignments(athleteId)
  const toggle = useToggleAssignment(athleteId)

  const mineTemplates = (templates ?? []).filter((x) => isMine(x.ownerId))
  const minePrograms = (programs ?? []).filter((x) => isMine(x.ownerId))
  if (!mineTemplates.length && !minePrograms.length) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{t('trainer.noTemplates')}</p>
  }

  const row = (key: string, name: string, sub: string, assignment: { id: string } | undefined, onAssign: () => void) => (
    <li key={key} className="flex min-h-14 items-center gap-3 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{name}</p>
        <p className="truncate text-xs text-muted-foreground">{sub}</p>
      </div>
      <Button
        size="sm"
        variant={assignment ? 'default' : 'secondary'}
        disabled={toggle.isPending}
        aria-pressed={Boolean(assignment)}
        onClick={() => (assignment ? toggle.mutate({ assignmentId: assignment.id }) : onAssign())}
        className="h-9 rounded-full px-3"
      >
        {assignment ? <Check aria-hidden /> : <Plus aria-hidden />}
        {assignment ? t('trainer.assigned') : t('trainer.assign')}
      </Button>
    </li>
  )

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">{t('trainer.assignedHint')}</p>
      <ul className="divide-y rounded-2xl border bg-card">
        {minePrograms.map((p) =>
          row(
            `p-${p.id}`,
            p.name,
            t('programs.daysCount', { count: p.days.length }),
            assignments?.find((a) => a.programId === p.id),
            () => toggle.mutate({ programId: p.id }),
          ),
        )}
        {mineTemplates.map((tpl) =>
          row(
            `t-${tpl.id}`,
            tpl.name,
            t('templates.exercises', { count: tpl.exerciseCount }),
            assignments?.find((a) => a.templateId === tpl.id),
            () => toggle.mutate({ templateId: tpl.id }),
          ),
        )}
      </ul>
    </div>
  )
}

function ClientSheets({
  sheet,
  onClose,
  athleteId,
  name,
  hasAccount,
}: {
  sheet: Sheet
  onClose: () => void
  athleteId: string
  name: string
  hasAccount: boolean
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const rename = useRenameAthlete()
  const remove = useRemoveClient()
  const [draft, setDraft] = useState(name)

  const titles: Record<Exclude<Sheet, null>, string> = {
    rename: t('trainer.rename'),
    invite: t('trainer.inviteToAccount'),
    remove: hasAccount ? t('trainer.unlink') : t('trainer.deleteClient'),
  }

  const submitRename = (e: FormEvent) => {
    e.preventDefault()
    if (!draft.trim()) return
    rename.mutate({ athleteId, name: draft }, { onSuccess: onClose, onError: () => toast.error(t('trainer.removeError')) })
  }

  return (
    <Drawer open={sheet !== null} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent className="mx-auto max-w-md">
        {sheet ? (
          <>
            <DrawerHeader className="group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
              <DrawerTitle className="font-heading text-lg">{titles[sheet]}</DrawerTitle>
              <DrawerDescription className="sr-only">{titles[sheet]}</DrawerDescription>
            </DrawerHeader>
            <div className="flex flex-col gap-3 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
              {sheet === 'rename' ? (
                <form onSubmit={submitRename} className="flex flex-col gap-3">
                  <Input value={draft} onChange={(e) => setDraft(e.target.value)} aria-label={t('trainer.renamePrompt')} maxLength={80} className="h-11 rounded-xl" />
                  <Button type="submit" size="xl" disabled={rename.isPending || !draft.trim()}>
                    {t('common.save')}
                  </Button>
                </form>
              ) : sheet === 'invite' ? (
                <InviteLink athleteId={athleteId} athleteName={name} />
              ) : (
                <>
                  <p className="rounded-xl bg-danger-muted px-3 py-2 text-sm text-danger-text">
                    {hasAccount ? t('trainer.unlinkConfirm') : t('trainer.deleteClientConfirm')}
                  </p>
                  <Button
                    variant="destructive"
                    size="xl"
                    disabled={remove.isPending}
                    onClick={() =>
                      remove.mutate(
                        { athleteId, hasAccount, trainerId: user!.id },
                        {
                          onSuccess: () => {
                            onClose()
                            navigate('/trainer', { replace: true })
                          },
                          onError: () => toast.error(t('trainer.removeError')),
                        },
                      )
                    }
                  >
                    {t('workout.discardYes')}
                  </Button>
                  <Button variant="secondary" size="touch" onClick={onClose}>
                    {t('common.cancel')}
                  </Button>
                </>
              )}
            </div>
          </>
        ) : null}
      </DrawerContent>
    </Drawer>
  )
}
