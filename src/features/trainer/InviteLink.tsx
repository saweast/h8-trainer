import { Copy, Share2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { inviteUrl, useCreateInvite } from './api'

/** Creates an invite once when shown and offers copy / native share for the link. */
export function InviteLink({ athleteId, athleteName }: { athleteId: string | null; athleteName?: string }) {
  const { t } = useTranslation()
  const create = useCreateInvite()
  const [url, setUrl] = useState<string | null>(null)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    create.mutate(athleteId, {
      onSuccess: (code) => setUrl(inviteUrl(code)),
      onError: () => toast.error(t('trainer.inviteError')),
    })
  }, [athleteId, create, t])

  const copy = async () => {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      toast.success(t('trainer.copied'))
    } catch {
      toast.error(t('trainer.inviteError'))
    }
  }

  const share = async () => {
    if (!url) return
    try {
      await navigator.share({ title: 'h8 trainer', text: t('trainer.inviteBody'), url })
    } catch {
      // cancelled
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        {athleteName ? t('trainer.inviteClaimBody', { name: athleteName }) : t('trainer.inviteBody')}
      </p>
      {url ? (
        <output className="block rounded-xl bg-secondary px-3 py-3 text-sm break-all select-all">{url}</output>
      ) : (
        <Skeleton className="h-12 rounded-xl" />
      )}
      <p className="text-xs text-muted-foreground">{t('trainer.inviteExpires')}</p>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" size="touch" onClick={() => void copy()} disabled={!url}>
          <Copy aria-hidden />
          {t('trainer.copy')}
        </Button>
        {'share' in navigator ? (
          <Button size="touch" onClick={() => void share()} disabled={!url}>
            <Share2 aria-hidden />
            {t('trainer.share')}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
