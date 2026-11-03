import { ClipboardList, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { EmptyState } from '@/components/common/EmptyState'
import { PageHeader } from '@/components/common/PageHeader'
import { Button } from '@/components/ui/button'

// TODO(stage 5): template list + editor.
export function TemplatesPage() {
  const { t } = useTranslation()
  return (
    <div>
      <PageHeader title={t('templates.title')} />
      <EmptyState icon={ClipboardList} title={t('templates.emptyTitle')} body={t('templates.emptyBody')}>
        <Button size="xl" onClick={() => toast(t('common.needsDatabase'))}>
          <Plus aria-hidden />
          {t('templates.create')}
        </Button>
      </EmptyState>
    </div>
  )
}
