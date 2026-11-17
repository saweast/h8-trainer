import { ChevronRight, Mail } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { SegmentedControl } from '@/components/common/SegmentedControl'
import { UserAvatar } from '@/components/common/UserAvatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useCancelLinkRequest,
  useLinkRequest,
  useMergeClients,
  useRequestLink,
  useTrainerClients,
  type ClientOverview,
} from './api'

type Mode = 'client' | 'email'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** Merging an offline client: into another of my clients now, or by email once its owner accepts. */
export function MergeClient({ athleteId, name, onClose }: { athleteId: string; name: string; onClose: () => void }) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<Mode>('client')
  return (
    <div className="flex flex-col gap-3">
      <SegmentedControl<Mode>
        ariaLabel={t('merge.title')}
        value={mode}
        onChange={setMode}
        options={[
          { value: 'client', label: t('merge.withClient') },
          { value: 'email', label: t('merge.byEmail') },
        ]}
      />
      {mode === 'client' ? (
        <MergeWithClient athleteId={athleteId} name={name} onClose={onClose} />
      ) : (
        <LinkByEmail athleteId={athleteId} name={name} />
      )}
    </div>
  )
}

function MergeWithClient({ athleteId, name, onClose }: { athleteId: string; name: string; onClose: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data: clients, isPending } = useTrainerClients()
  const merge = useMergeClients()
  const [target, setTarget] = useState<ClientOverview | null>(null)
  const [query, setQuery] = useState('')

  if (isPending) return <Skeleton className="h-32 rounded-2xl" />

  if (target) {
    const submit = () =>
      merge.mutate(
        { fromId: athleteId, intoId: target.athleteId },
        {
          onSuccess: () => {
            onClose()
            toast.success(t('merge.done', { name: target.displayName }))
            navigate(`/trainer/clients/${target.athleteId}`, { replace: true })
          },
          onError: () => toast.error(t('merge.error')),
        },
      )
    return (
      <>
        <div className="flex items-center gap-3 rounded-2xl border bg-card px-4 py-3">
          <UserAvatar name={target.displayName} src={target.avatarUrl} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{target.displayName}</p>
            <p className="text-xs text-muted-foreground">{target.hasAccount ? t('merge.hasAccount') : t('trainer.noAccount')}</p>
          </div>
        </div>
        <p className="rounded-xl bg-danger-muted px-3 py-2 text-sm text-danger-text">
          {t('merge.confirm', { from: name, into: target.displayName })}
        </p>
        <Button variant="destructive" size="xl" disabled={merge.isPending} onClick={submit}>
          {t('merge.confirmYes')}
        </Button>
        <Button variant="secondary" size="touch" disabled={merge.isPending} onClick={() => setTarget(null)}>
          {t('common.back')}
        </Button>
      </>
    )
  }

  const others = (clients ?? []).filter((c) => c.athleteId !== athleteId)
  const q = query.trim().toLocaleLowerCase()
  const shown = q ? others.filter((c) => c.displayName.toLocaleLowerCase().includes(q)) : others

  return (
    <>
      <p className="text-sm text-muted-foreground">{t('merge.clientHint', { name })}</p>
      {others.length > 6 ? (
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('trainer.search')}
          aria-label={t('trainer.search')}
          className="h-11 rounded-xl"
        />
      ) : null}
      {others.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t('merge.noClients')}</p>
      ) : shown.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t('trainer.noResults')}</p>
      ) : (
        <ul className="max-h-[45dvh] divide-y overflow-y-auto rounded-2xl border bg-card">
          {shown.map((c) => (
            <li key={c.athleteId}>
              <button
                type="button"
                onClick={() => setTarget(c)}
                className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-secondary/50"
              >
                <UserAvatar name={c.displayName} src={c.avatarUrl} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{c.displayName}</span>
                  <span className="block text-xs text-muted-foreground">
                    {c.hasAccount ? t('merge.hasAccount') : t('trainer.noAccount')}
                  </span>
                </span>
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function LinkByEmail({ athleteId, name }: { athleteId: string; name: string }) {
  const { t } = useTranslation()
  const { data: request, isPending } = useLinkRequest(athleteId)
  const send = useRequestLink(athleteId)
  const cancel = useCancelLinkRequest(athleteId)
  const [email, setEmail] = useState('')
  const [invalid, setInvalid] = useState(false)

  if (isPending) return <Skeleton className="h-32 rounded-2xl" />

  if (request) {
    return (
      <>
        <p className="flex items-start gap-2 rounded-xl bg-trainer-muted px-3 py-2 text-sm text-trainer-text">
          <Mail className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span className="min-w-0 break-words">{t('merge.pending', { email: request.email })}</span>
        </p>
        <p className="text-xs text-muted-foreground">{t('merge.pendingHint')}</p>
        <Button
          variant="secondary"
          size="touch"
          disabled={cancel.isPending}
          onClick={() => cancel.mutate(request.id, { onError: () => toast.error(t('merge.sendError')) })}
        >
          {t('merge.cancelRequest')}
        </Button>
      </>
    )
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const value = email.trim()
    if (!EMAIL_RE.test(value)) {
      setInvalid(true)
      return
    }
    send.mutate(value, {
      onSuccess: () => toast.success(t('merge.sent')),
      onError: (err) => toast.error(err.message.includes('yourself') ? t('merge.selfError') : t('merge.sendError')),
    })
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{t('merge.emailHint', { name })}</p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="merge-email">{t('merge.emailLabel')}</Label>
        <Input
          id="merge-email"
          type="email"
          inputMode="email"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            setInvalid(false)
          }}
          placeholder="name@gmail.com"
          maxLength={254}
          aria-invalid={invalid || undefined}
          className="h-11 rounded-xl"
        />
        {invalid ? <p className="text-xs text-destructive">{t('merge.emailInvalid')}</p> : null}
      </div>
      <Button type="submit" size="xl" disabled={send.isPending}>
        {t('merge.send')}
      </Button>
    </form>
  )
}
