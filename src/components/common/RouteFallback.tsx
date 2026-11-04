import { Skeleton } from '@/components/ui/skeleton'

export function RouteFallback() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-3 px-4 pt-20" aria-busy="true">
      <Skeleton className="h-8 w-40 rounded-lg" />
      <Skeleton className="h-32 rounded-2xl" />
      <Skeleton className="h-32 rounded-2xl" />
    </div>
  )
}
