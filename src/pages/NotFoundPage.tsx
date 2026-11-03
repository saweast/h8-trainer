import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <p className="font-heading text-5xl text-muted-foreground">404</p>
      <h1 className="text-lg font-medium">{t('notFound.title')}</h1>
      <Button asChild variant="secondary" size="touch">
        <Link to="/">{t('notFound.home')}</Link>
      </Button>
    </div>
  )
}
