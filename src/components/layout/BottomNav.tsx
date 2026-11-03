import { CalendarDays, ChartLine, ClipboardList, Dumbbell, House, User, Users, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { NavLink } from 'react-router'
import { useMode } from '@/features/mode/modeContext'
import { cn } from '@/lib/utils'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

export function BottomNav() {
  const { t } = useTranslation()
  const { mode } = useMode()

  const items: NavItem[] =
    mode === 'trainer'
      ? [
          { to: '/trainer', label: t('nav.clients'), icon: Users, end: true },
          { to: '/templates', label: t('nav.templates'), icon: ClipboardList },
          { to: '/exercises', label: t('nav.exercises'), icon: Dumbbell },
          { to: '/profile', label: t('nav.profile'), icon: User },
        ]
      : [
          { to: '/', label: t('nav.home'), icon: House, end: true },
          { to: '/history', label: t('nav.history'), icon: CalendarDays },
          { to: '/exercises', label: t('nav.exercises'), icon: Dumbbell },
          { to: '/progress', label: t('nav.progress'), icon: ChartLine },
          { to: '/profile', label: t('nav.profile'), icon: User },
        ]

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-safe backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <ul className="mx-auto flex max-w-md">
        {items.map(({ to, label, icon: Icon, end }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors',
                  isActive ? 'text-lime-text dark:text-lime' : 'text-muted-foreground hover:text-foreground',
                )
              }
            >
              <Icon className="size-5" aria-hidden />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
