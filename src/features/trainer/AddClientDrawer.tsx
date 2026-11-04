import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { SegmentedControl } from '@/components/common/SegmentedControl'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCreateOfflineClient } from './api'
import { InviteLink } from './InviteLink'

type Mode = 'offline' | 'invite'

export function AddClientDrawer({ open, onOpenChange, initialMode = 'offline' }: { open: boolean; onOpenChange: (open: boolean) => void; initialMode?: Mode }) {
  const { t } = useTranslation()
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-h-[92dvh] max-w-md">
        <DrawerHeader className="group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
          <DrawerTitle className="font-heading text-lg">{t('trainer.addTitle')}</DrawerTitle>
          <DrawerDescription className="sr-only">{t('trainer.addClient')}</DrawerDescription>
        </DrawerHeader>
        {open ? <Body key={initialMode} initialMode={initialMode} onDone={() => onOpenChange(false)} /> : null}
      </DrawerContent>
    </Drawer>
  )
}

function Body({ initialMode, onDone }: { initialMode: Mode; onDone: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const create = useCreateOfflineClient()
  const [mode, setMode] = useState<Mode>(initialMode)
  const [name, setName] = useState('')
  const [nameError, setNameError] = useState(false)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setNameError(true)
      return
    }
    create.mutate(name.trim(), {
      onSuccess: (athleteId) => {
        onDone()
        navigate(`/trainer/clients/${athleteId}`)
      },
      onError: () => toast.error(t('trainer.createError')),
    })
  }

  return (
    <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
      <SegmentedControl<Mode>
        ariaLabel={t('trainer.addClient')}
        value={mode}
        onChange={setMode}
        options={[
          { value: 'offline', label: t('trainer.addOffline') },
          { value: 'invite', label: t('trainer.invite') },
        ]}
      />
      {mode === 'offline' ? (
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="client-name">{t('trainer.offlineName')}</Label>
            <Input
              id="client-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setNameError(false)
              }}
              placeholder={t('trainer.offlineNamePlaceholder')}
              maxLength={80}
              aria-invalid={nameError || undefined}
              className="h-11 rounded-xl"
            />
            {nameError ? <p className="text-xs text-destructive">{t('trainer.nameRequired')}</p> : null}
          </div>
          <Button type="submit" size="xl" disabled={create.isPending}>
            {t('trainer.create')}
          </Button>
        </form>
      ) : (
        <InviteLink athleteId={null} />
      )}
    </div>
  )
}
