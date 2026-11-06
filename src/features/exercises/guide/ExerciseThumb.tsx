import { Dumbbell } from 'lucide-react'
import { useState } from 'react'
import { mediaFor, thumbUrl } from '@/data/exerciseMedia'
import { cn } from '@/lib/utils'

/** 40×40 photo of the exercise for lists; custom exercises get an icon instead. */
export function ExerciseThumb({ slug, className }: { slug: string | null; className?: string }) {
  const media = mediaFor(slug)
  const [failed, setFailed] = useState(false)
  const box = cn('size-10 shrink-0 overflow-hidden rounded-lg', className)

  if (!slug || !media?.images || failed) {
    return (
      <span className={cn(box, 'grid place-items-center bg-secondary text-muted-foreground')} aria-hidden>
        <Dumbbell className="size-4" />
      </span>
    )
  }
  return (
    <img
      src={thumbUrl(slug)}
      alt=""
      width={40}
      height={40}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={cn(box, 'bg-white object-cover')}
    />
  )
}
