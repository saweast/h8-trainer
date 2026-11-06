import { useTranslation } from 'react-i18next'

export function RoleBadges({ isAdmin, isTrainer }: { isAdmin: boolean; isTrainer: boolean }) {
  const { t } = useTranslation()
  return (
    <>
      {isAdmin ? (
        <span className="shrink-0 rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium">{t('admin.badgeAdmin')}</span>
      ) : null}
      {isTrainer ? (
        <span className="shrink-0 rounded-full bg-trainer-muted px-1.5 py-0.5 text-[10px] font-medium text-trainer-text">
          {t('admin.badgeTrainer')}
        </span>
      ) : null}
    </>
  )
}
