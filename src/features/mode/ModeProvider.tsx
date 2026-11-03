import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth/authContext'
import { useProfile, useUpdateProfile } from '@/features/profile/useProfile'
import { isSupabaseConfigured } from '@/lib/supabase'
import { safeStorage } from '@/lib/storage'
import { ModeContext, type AppMode, type ModeContextValue } from './modeContext'

const DEMO_TRAINER_KEY = 'h8.isTrainer'
const MODE_KEY = 'h8.mode'

/**
 * "Я тренер" lives in `profiles.is_trainer` (demo mode: localStorage). The chosen mode
 * (athlete / trainer navigation) is a per-device preference.
 */
export function ModeProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const userId = isSupabaseConfigured ? user?.id : undefined
  const profile = useProfile(userId)
  const updateProfile = useUpdateProfile(userId)

  const [demoTrainer, setDemoTrainer] = useState(() => safeStorage.get(DEMO_TRAINER_KEY) === '1')
  const [storedMode, setStoredMode] = useState<AppMode>(() =>
    safeStorage.get(MODE_KEY) === 'trainer' ? 'trainer' : 'athlete',
  )

  const isTrainer = isSupabaseConfigured ? (profile.data?.isTrainer ?? false) : demoTrainer

  const setMode = useCallback((next: AppMode) => {
    setStoredMode(next)
    safeStorage.set(MODE_KEY, next)
  }, [])

  const { mutate } = updateProfile
  const setIsTrainer = useCallback(
    (value: boolean) => {
      if (!value) setMode('athlete')
      if (isSupabaseConfigured) {
        mutate({ isTrainer: value }, { onError: () => toast.error(t('profile.saveError')) })
      } else {
        setDemoTrainer(value)
        safeStorage.set(DEMO_TRAINER_KEY, value ? '1' : '0')
      }
    },
    [mutate, setMode, t],
  )

  const value = useMemo<ModeContextValue>(
    () => ({ isTrainer, setIsTrainer, mode: isTrainer ? storedMode : 'athlete', setMode }),
    [isTrainer, storedMode, setIsTrainer, setMode],
  )

  return <ModeContext.Provider value={value}>{children}</ModeContext.Provider>
}
