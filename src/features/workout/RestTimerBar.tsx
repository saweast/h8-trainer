import { BellRing } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { formatClock } from '@/lib/time'
import type { RestTimer } from './useRestTimer'

export function RestTimerBar({ timer }: { timer: RestTimer }) {
  const { t } = useTranslation()
  if (!timer.running && !timer.justFinished) return null

  const progress = timer.totalS ? Math.min(1, Math.max(0, 1 - timer.remainingS / timer.totalS)) : 1

  return (
    <div
      role="timer"
      aria-live="polite"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-card pb-safe shadow-[0_-8px_24px_rgb(0_0_0/0.25)]"
    >
      <div className="mx-auto max-w-md px-4 pt-3 pb-3">
        {timer.justFinished ? (
          <p className="flex h-12 items-center gap-2 text-sm font-medium text-lime-text dark:text-lime">
            <BellRing className="size-5" aria-hidden />
            {t('workout.restDone')}
          </p>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground">{t('workout.rest')}</p>
              <p className="font-heading tabular text-2xl leading-tight">{formatClock(timer.remainingS)}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="touch" onClick={() => timer.adjust(-15)} aria-label="−15 s">
                −15
              </Button>
              <Button variant="secondary" size="touch" onClick={() => timer.adjust(15)} aria-label="+15 s">
                +15
              </Button>
              <Button size="touch" onClick={timer.stop}>
                {t('workout.restNext')}
              </Button>
            </div>
          </div>
        )}
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-secondary">
          <div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${progress * 100}%` }} />
        </div>
      </div>
    </div>
  )
}
