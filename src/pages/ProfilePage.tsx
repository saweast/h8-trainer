import { ChevronRight, Lock, LogOut, Users } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { PageHeader } from '@/components/common/PageHeader'
import { SegmentedControl } from '@/components/common/SegmentedControl'
import { UserAvatar } from '@/components/common/UserAvatar'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useAuth } from '@/features/auth/authContext'
import { useMode } from '@/features/mode/modeContext'
import { currentLanguage, type Language } from '@/i18n'

type ThemeChoice = 'dark' | 'light' | 'system'

export function ProfilePage() {
  const { t, i18n } = useTranslation()
  const { user, isDemo, signOut } = useAuth()
  const { isTrainer, canBeTrainer, isAdmin, setIsTrainer, setMode } = useMode()
  const { theme = 'dark', setTheme } = useTheme()
  const navigate = useNavigate()

  const toggleTrainer = (value: boolean) => {
    setIsTrainer(value)
    if (!value) {
      setMode('athlete')
      navigate('/profile', { replace: true })
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('profile.title')} />

      <div className="flex items-center gap-3 rounded-2xl border bg-card p-4">
        <UserAvatar name={user?.displayName ?? ''} src={user?.avatarUrl} className="size-12" />
        <div className="min-w-0">
          <p className="truncate font-medium">{user?.displayName}</p>
          {isDemo ? <p className="text-xs text-warning-text">{t('profile.demo')}</p> : null}
        </div>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-xs font-medium text-muted-foreground">{t('profile.language')}</h2>
        <SegmentedControl<Language>
          ariaLabel={t('profile.language')}
          value={currentLanguage()}
          onChange={(lng) => void i18n.changeLanguage(lng)}
          options={[
            { value: 'uk', label: 'Українська' },
            { value: 'en', label: 'English' },
          ]}
        />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xs font-medium text-muted-foreground">{t('profile.theme')}</h2>
        <SegmentedControl<ThemeChoice>
          ariaLabel={t('profile.theme')}
          value={theme as ThemeChoice}
          onChange={setTheme}
          options={[
            { value: 'dark', label: t('profile.themeDark') },
            { value: 'light', label: t('profile.themeLight') },
            { value: 'system', label: t('profile.themeSystem') },
          ]}
        />
      </section>

      {canBeTrainer ? (
        <label className="flex items-start gap-3 rounded-2xl border bg-card p-4">
          <div className="flex-1">
            <p className="text-sm font-medium">{t('profile.trainerMode')}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('profile.trainerModeHint')}</p>
          </div>
          <Switch checked={isTrainer} onCheckedChange={toggleTrainer} aria-label={t('profile.trainerMode')} />
        </label>
      ) : (
        <div className="flex items-start gap-3 rounded-2xl border bg-card p-4">
          <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="flex-1">
            <p className="text-sm font-medium">{t('profile.trainerMode')}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('profile.trainerLocked')}</p>
          </div>
        </div>
      )}

      {isAdmin ? (
        <Link
          to="/admin/users"
          className="flex items-center gap-3 rounded-2xl border bg-card p-4 transition-colors hover:bg-secondary/50"
        >
          <Users className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{t('admin.usersTitle')}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('admin.usersHint')}</p>
          </div>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </Link>
      ) : null}

      <Button variant="secondary" size="touch" onClick={() => void signOut()}>
        <LogOut aria-hidden />
        {t('profile.signOut')}
      </Button>
    </div>
  )
}
