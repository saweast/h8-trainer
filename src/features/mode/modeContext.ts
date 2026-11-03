import { createContext, useContext } from 'react'

export type AppMode = 'athlete' | 'trainer'

export interface ModeContextValue {
  /** Self-declared in the profile ("Я тренер"). */
  isTrainer: boolean
  /** False while the profile is still loading — don't redirect on `isTrainer` before this. */
  ready: boolean
  setIsTrainer: (value: boolean) => void
  /** Which bottom navigation is shown; always 'athlete' for non-trainers. */
  mode: AppMode
  setMode: (mode: AppMode) => void
}

export const ModeContext = createContext<ModeContextValue | null>(null)

export function useMode(): ModeContextValue {
  const ctx = useContext(ModeContext)
  if (!ctx) throw new Error('useMode must be used inside <ModeProvider>')
  return ctx
}
