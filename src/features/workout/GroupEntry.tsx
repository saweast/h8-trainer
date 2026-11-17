import { ChevronRight, Play, Users } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { isSupabaseConfigured } from '@/lib/supabase'
import { ElapsedClock } from './ElapsedClock'
import { useActiveGroups } from './groupApi'
import { StartGroupDrawer } from './StartGroupDrawer'

/** On the trainer's clients page: split sessions still going, and a way to start one. */
export function GroupEntry({ canStart }: { canStart: boolean }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const { data: active } = useActiveGroups()

  const startNew = () => {
    if (!isSupabaseConfigured) {
      toast(t('common.needsDatabase'))
      return
    }
    setOpen(true)
  }

  return (
    <>
      {active?.map((g) => (
        <div key={g.groupId} className="rounded-2xl border-[1.5px] border-primary bg-lime-muted p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-lime-text dark:text-lime">{t('group.inProgress')}</p>
            <ElapsedClock since={g.startedAt} className="tabular text-sm font-medium" />
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{g.names.join(', ')}</p>
          <Button asChild size="xl" className="mt-3 w-full">
            <Link to={`/group/${g.groupId}`}>
              <Play aria-hidden />
              {t('group.resume')}
            </Link>
          </Button>
        </div>
      ))}
      {canStart ? (
        <button
          type="button"
          onClick={startNew}
          className="flex min-h-14 items-center gap-3 rounded-2xl border bg-card px-4 py-3 text-left transition-colors hover:bg-secondary"
        >
          <span className="flex size-10 items-center justify-center rounded-xl bg-trainer-muted text-trainer-text">
            <Users className="size-5" aria-hidden />
          </span>
          <span className="flex-1">
            <span className="block text-sm font-medium">{t('group.title')}</span>
            <span className="block text-xs text-muted-foreground">{t('group.startHint')}</span>
          </span>
          <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
        </button>
      ) : null}
      <StartGroupDrawer open={open} onOpenChange={setOpen} />
    </>
  )
}
