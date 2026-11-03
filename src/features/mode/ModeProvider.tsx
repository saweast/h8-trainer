import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { safeStorage } from '@/lib/storage'
import { ModeContext, type AppMode, type ModeContextValue } from './modeContext'

const TRAINER_KEY = 'h8.isTrainer'
const MODE_KEY = 'h8.mode'

// TODO(stage 2): read/write `profiles.is_trainer` through Supabase instead of localStorage.
export function ModeProvider({ children }: { children: ReactNode }) {
  const [isTrainer, setIsTrainerState] = useState(() => safeStorage.get(TRAINER_KEY) === '1')
  const [storedMode, setStoredMode] = useState<AppMode>(() =>
    safeStorage.get(MODE_KEY) === 'trainer' ? 'trainer' : 'athlete',
  )

  const setIsTrainer = useCallback((value: boolean) => {
    setIsTrainerState(value)
    safeStorage.set(TRAINER_KEY, value ? '1' : '0')
    if (!value) {
      setStoredMode('athlete')
      safeStorage.set(MODE_KEY, 'athlete')
    }
  }, [])

  const setMode = useCallback((next: AppMode) => {
    setStoredMode(next)
    safeStorage.set(MODE_KEY, next)
  }, [])

  const value = useMemo<ModeContextValue>(
    () => ({ isTrainer, setIsTrainer, mode: isTrainer ? storedMode : 'athlete', setMode }),
    [isTrainer, storedMode, setIsTrainer, setMode],
  )

  return <ModeContext.Provider value={value}>{children}</ModeContext.Provider>
}
