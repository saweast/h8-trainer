import { CircleAlert, Handshake } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { EmptyState } from '@/components/common/EmptyState'
import { UserAvatar } from '@/components/common/UserAvatar'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useClaimInvite, useInvite } from './api'

export function InvitePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { code } = useParams()
  const { data: invite, isPending } = useInvite(code)
  const claim = useClaimInvite()

  if (isPending) return <Skeleton className="mt-6 h-56 rounded-2xl" />

  if (!invite || invite.status !== 'valid') {
    const message = invite ? t(`invite.${invite.status === 'not_found' ? 'notFound' : invite.status}`) : t('invite.notFound')
    return (
      <EmptyState icon={CircleAlert} title={message} className="mt-6">
        <Button asChild variant="secondary" size="touch">
          <Link to="/">{t('invite.home')}</Link>
        </Button>
      </EmptyState>
    )
  }

  const accept = () =>
    claim.mutate(code!, {
      onSuccess: () => {
        toast.success(t('invite.accepted', { trainer: invite.trainerName }))
        navigate('/', { replace: true })
      },
      onError: () => toast.error(t('invite.error')),
    })

  return (
    <div className="mt-4 flex flex-col items-center gap-4 rounded-2xl border bg-card px-5 py-8 text-center">
      <UserAvatar name={invite.trainerName} src={invite.trainerAvatarUrl} className="size-16" />
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Handshake className="size-4" aria-hidden />
        {t('invite.title')}
      </div>
      <p className="font-heading text-lg leading-snug">{t('invite.body', { trainer: invite.trainerName })}</p>
      {invite.athleteName ? (
        <p className="rounded-xl bg-trainer-muted px-3 py-2 text-sm text-trainer-text">
          {t('invite.claimBody', { athlete: invite.athleteName })}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">{t('invite.privacy')}</p>
      <Button size="xl" className="w-full" onClick={accept} disabled={claim.isPending}>
        {t('invite.accept')}
      </Button>
    </div>
  )
}
