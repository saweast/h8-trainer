import { useEffect } from 'react'

/** Keeps the screen on while `active` (Screen Wake Lock API; silently no-op where unsupported). */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return
    const lock: { sentinel: WakeLockSentinel | null; cancelled: boolean } = { sentinel: null, cancelled: false }

    const request = async () => {
      try {
        const sentinel = await navigator.wakeLock.request('screen')
        lock.sentinel = sentinel
        if (lock.cancelled) void sentinel.release()
      } catch {
        // denied (battery saver, iframe) — fine
      }
    }
    // The lock is dropped whenever the tab is hidden; take it again on return.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void request()
    }

    void request()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      lock.cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      void lock.sentinel?.release()
    }
  }, [active])
}
