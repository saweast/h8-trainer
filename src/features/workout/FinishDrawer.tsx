import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'

interface FinishDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  doneSets: number
  pendingSets: number
  busy: boolean
  onFinish: () => void
  onDiscard: () => void
}

export function FinishDrawer({ open, onOpenChange, doneSets, pendingSets, busy, onFinish, onDiscard }: FinishDrawerProps) {
  const { t } = useTranslation()
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  const change = (next: boolean) => {
    if (!next) setConfirmDiscard(false)
    onOpenChange(next)
  }

  return (
    <Drawer open={open} onOpenChange={change}>
      <DrawerContent className="mx-auto max-w-md">
        <DrawerHeader className="group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
          <DrawerTitle className="font-heading text-lg">{t('workout.finishTitle')}</DrawerTitle>
          <DrawerDescription>
            {doneSets > 0 ? t('workout.doneSets', { count: doneSets }) : t('workout.nothingDone')}
          </DrawerDescription>
        </DrawerHeader>
        <div className="flex flex-col gap-2 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          {doneSets > 0 && pendingSets > 0 ? (
            <p className="mb-2 rounded-xl bg-warning-muted px-3 py-2 text-sm text-warning-text">
              {t('workout.pendingNote', { count: pendingSets })}
            </p>
          ) : null}

          {confirmDiscard ? (
            <>
              <p className="mb-2 rounded-xl bg-danger-muted px-3 py-2 text-sm text-danger-text">
                {t('workout.discardConfirm')}
              </p>
              <Button variant="destructive" size="xl" disabled={busy} onClick={onDiscard}>
                {t('workout.discardYes')}
              </Button>
              <Button variant="secondary" size="touch" onClick={() => setConfirmDiscard(false)}>
                {t('common.cancel')}
              </Button>
            </>
          ) : (
            <>
              {doneSets > 0 ? (
                <Button size="xl" disabled={busy} onClick={onFinish}>
                  {t('workout.finishConfirm')}
                </Button>
              ) : null}
              <Button variant="secondary" size="touch" onClick={() => change(false)}>
                {t('workout.keepGoing')}
              </Button>
              <Button variant="ghost" size="touch" className="text-destructive" onClick={() => setConfirmDiscard(true)}>
                {t('workout.discard')}
              </Button>
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  )
}
