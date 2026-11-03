import { useCallback, useEffect, useRef, useState } from 'react'
import { safeStorage } from '@/lib/storage'
import { secondsUntil } from '@/lib/time'
import { useNow } from './useNow'

const KEY = 'h8.rest'

interface RestState {
  workoutId: string
  endsAt: number
  totalS: number
}

function load(workoutId: string): RestState | null {
  try {
    const raw = safeStorage.get(KEY)
    if (!raw) return null
    const state = JSON.parse(raw) as RestState
    return state.workoutId === workoutId && state.endsAt > Date.now() ? state : null
  } catch {
    return null
  }
}

/** Two short beeps. The AudioContext is created on a user tap (iOS requires it). */
function beep(ctx: AudioContext | null) {
  if (!ctx) return
  for (const offset of [0, 0.25]) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.0001, ctx.currentTime + offset)
    gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + offset + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + offset + 0.18)
    osc.connect(gain).connect(ctx.destination)
    osc.start(ctx.currentTime + offset)
    osc.stop(ctx.currentTime + offset + 0.2)
  }
}

/**
 * Rest countdown that survives reloads (end time in localStorage) and alerts with vibration +
 * sound when it runs out.
 */
export function useRestTimer(workoutId: string) {
  const [state, setState] = useState<RestState | null>(() => load(workoutId))
  const audio = useRef<AudioContext | null>(null)
  const now = useNow(250, state !== null)

  const remainingS = state ? secondsUntil(state.endsAt, now) : 0
  // Countdown reached zero: show "rest is over" for a few seconds, then hide the bar.
  const expired = state !== null && remainingS === 0

  const start = useCallback(
    (seconds: number) => {
      if (seconds <= 0) return
      try {
        audio.current ??= new AudioContext()
        void audio.current.resume()
      } catch {
        audio.current = null
      }
      const next = { workoutId, endsAt: Date.now() + seconds * 1000, totalS: seconds }
      setState(next)
      safeStorage.set(KEY, JSON.stringify(next))
    },
    [workoutId],
  )

  const adjust = useCallback((deltaS: number) => {
    setState((prev) => {
      if (!prev) return prev
      const endsAt = Math.max(Date.now() + 1000, prev.endsAt + deltaS * 1000)
      const next = { ...prev, endsAt, totalS: Math.max(prev.totalS + deltaS, 1) }
      safeStorage.set(KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const stop = useCallback(() => {
    setState(null)
    safeStorage.remove(KEY)
  }, [])

  const endsAt = state?.endsAt
  useEffect(() => {
    if (!expired) return
    safeStorage.remove(KEY)
    navigator.vibrate?.([200, 100, 200])
    beep(audio.current)
    const id = window.setTimeout(() => setState((s) => (s?.endsAt === endsAt ? null : s)), 4000)
    return () => window.clearTimeout(id)
  }, [expired, endsAt])

  return {
    running: state !== null && !expired,
    remainingS,
    totalS: state?.totalS ?? 0,
    justFinished: expired,
    start,
    adjust,
    stop,
  }
}

export type RestTimer = ReturnType<typeof useRestTimer>
