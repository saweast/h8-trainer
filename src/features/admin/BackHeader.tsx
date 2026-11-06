import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'

/** Back button + title row used by the nested admin pages. */
export function BackHeader({ fallback, children }: { fallback: string; children: ReactNode }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  return (
    <div className="-mt-1 flex items-center gap-2">
      <Button
        variant="ghost"
        size="icon-touch"
        className="-ml-2"
        aria-label={t('common.back')}
        onClick={() => (window.history.length > 1 ? navigate(-1) : navigate(fallback))}
      >
        <ArrowLeft />
      </Button>
      {children}
    </div>
  )
}
