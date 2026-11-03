import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { initials } from '@/lib/initials'
import { cn } from '@/lib/utils'

export function UserAvatar({ name, src, className }: { name: string; src?: string | null; className?: string }) {
  return (
    <Avatar className={cn('size-9', className)}>
      {src ? <AvatarImage src={src} alt="" referrerPolicy="no-referrer" /> : null}
      <AvatarFallback className="bg-secondary text-xs font-medium">{initials(name)}</AvatarFallback>
    </Avatar>
  )
}
