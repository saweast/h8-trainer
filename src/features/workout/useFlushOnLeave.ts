import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { pendingWrites } from './api'

/**
 * Leaving the page must not lose the last change: a field still being typed in is committed when
 * the tab is hidden, and closing the tab asks first while changes are still on their way.
 */
export function useFlushOnLeave(workoutIds: string[]) {
  const queryClient = useQueryClient()
  const ids = workoutIds.join(',')
  useEffect(() => {
    const list = ids.split(',').filter(Boolean)
    const flush = () => {
      if (document.activeElement instanceof HTMLInputElement) document.activeElement.blur()
    }
    const onHidden = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      flush()
      if (list.some((id) => pendingWrites(queryClient, id) > 0)) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    document.addEventListener('visibilitychange', onHidden)
    window.addEventListener('pagehide', flush)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      document.removeEventListener('visibilitychange', onHidden)
      window.removeEventListener('pagehide', flush)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [queryClient, ids])
}
