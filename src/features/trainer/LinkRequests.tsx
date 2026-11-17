import { Handshake } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { UserAvatar } from '@/components/common/UserAvatar'
import { Button } from '@/components/ui/button'
import { useAnswerLinkRequest, useMyLinkRequests, type IncomingLinkRequest } from './api'

/** Trainers asking (by my email) to move an offline client's history into my account. */
export function LinkRequests() {
  const { data: requests } = useMyLinkRequests()
  if (!requests?.length) return null
  return (
    <div className="flex flex-col gap-3">
      {requests.map((r) => (
        <RequestCard key={r.id} request={r} />
      ))}
    </div>
  )
}

function RequestCard({ request }: { request: IncomingLinkRequest }) {
  const { t } = useTranslation()
  const answer = useAnswerLinkRequest()

  const respond = (accept: boolean) =>
    answer.mutate(
      { id: request.id, accept },
      {
        onSuccess: () =>
          toast.success(accept ? t('invite.accepted', { trainer: request.trainerName }) : t('merge.declined')),
        onError: () => toast.error(t('merge.answerError')),
      },
    )

  return (
    <section aria-label={t('merge.incomingTitle')} className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
      <div className="flex items-center gap-3">
        <UserAvatar name={request.trainerName} src={request.trainerAvatarUrl} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Handshake className="size-3.5" aria-hidden />
            {t('merge.incomingTitle')}
          </p>
          <p className="truncate text-[15px] font-medium">{request.trainerName}</p>
        </div>
      </div>
      <p className="text-sm">
        {t('merge.incomingBody', { trainer: request.trainerName, athlete: request.athleteName })}{' '}
        {request.workoutsCount > 0 ? (
          <span className="text-muted-foreground">{t('merge.incomingWorkouts', { count: request.workoutsCount })}</span>
        ) : null}
      </p>
      <p className="text-xs text-muted-foreground">{t('invite.privacy')}</p>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" size="touch" disabled={answer.isPending} onClick={() => respond(false)}>
          {t('merge.decline')}
        </Button>
        <Button size="touch" disabled={answer.isPending} onClick={() => respond(true)}>
          {t('merge.accept')}
        </Button>
      </div>
    </section>
  )
}
