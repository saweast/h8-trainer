import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { useMode, type AppMode } from '@/features/mode/modeContext'
import { cn } from '@/lib/utils'

export function ModeSwitch() {
  const { t } = useTranslation()
  const { mode, setMode } = useMode()
  const navigate = useNavigate()

  const select = (next: AppMode) => {
    if (next === mode) return
    setMode(next)
    navigate(next === 'trainer' ? '/trainer' : '/')
  }

  const item = (value: AppMode, label: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={mode === value}
      onClick={() => select(value)}
      className={cn(
        'h-7 rounded-full px-3 text-xs font-medium transition-colors',
        mode === value
          ? value === 'trainer'
            ? 'bg-trainer text-trainer-foreground'
            : 'bg-secondary text-foreground'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
    </button>
  )

  return (
    <div role="radiogroup" aria-label={t('mode.label')} className="flex rounded-full border bg-card p-0.5">
      {item('athlete', t('mode.me'))}
      {item('trainer', t('mode.trainer'))}
    </div>
  )
}
