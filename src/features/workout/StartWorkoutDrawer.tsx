import { ChevronRight, ClipboardList, Play, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'

/** «Почати тренування» bottom sheet: next in program · empty workout · templates. */
export function StartWorkoutDrawer() {
  const { t } = useTranslation()

  // TODO(stage 3): create the workout in Supabase and navigate to /workout/:id.
  const startEmpty = () => toast(t('common.needsDatabase'))

  return (
    <Drawer>
      <DrawerTrigger asChild>
        <Button size="xl" className="w-full">
          <Play aria-hidden />
          {t('home.start')}
        </Button>
      </DrawerTrigger>
      <DrawerContent className="mx-auto max-w-md">
        <DrawerHeader className="group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
          <DrawerTitle className="font-heading text-lg">{t('start.title')}</DrawerTitle>
          <DrawerDescription>{t('start.description')}</DrawerDescription>
        </DrawerHeader>
        <div className="flex flex-col gap-3 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={startEmpty}
            className="flex min-h-16 items-center gap-3 rounded-2xl border bg-card px-4 py-3 text-left transition-colors hover:bg-secondary"
          >
            <span className="flex size-10 items-center justify-center rounded-xl bg-secondary">
              <Plus className="size-5" aria-hidden />
            </span>
            <span className="flex-1">
              <span className="block text-sm font-medium">{t('start.empty')}</span>
              <span className="block text-xs text-muted-foreground">{t('start.emptyHint')}</span>
            </span>
            <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
          </button>

          <p className="mt-2 text-xs font-medium text-muted-foreground">{t('start.templates')}</p>
          <div className="flex items-start gap-3 rounded-2xl bg-secondary/60 px-4 py-3 text-sm text-muted-foreground">
            <ClipboardList className="mt-0.5 size-4 shrink-0" aria-hidden />
            {t('start.noTemplates')}
          </div>

          <Button asChild variant="ghost" size="touch" className="justify-start text-lime-text dark:text-lime">
            <Link to="/templates">
              <Plus aria-hidden />
              {t('start.newTemplate')}
            </Link>
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
