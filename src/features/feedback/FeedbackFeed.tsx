import { format } from 'date-fns'
import { ChevronRight, MessageSquareText } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { exerciseName } from '@/data/exercises'
import { useExerciseMap } from '@/features/exercises/api'
import { currentLanguage } from '@/i18n'
import { dateLocale } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { useMarkFeedbackSeen, useUnseenFeedback, type FeedbackItem } from './api'

const PREVIEW = 3

/** «Нові відгуки» on the clients page: what clients said about plans, exercises and workouts. */
export function FeedbackFeedCard() {
  const { t } = useTranslation()
  const { feed, unseen, seenAt } = useUnseenFeedback()
  const markSeen = useMarkFeedbackSeen()
  const [open, setOpen] = useState(false)

  if (!feed.length) return null
  const isNew = (f: FeedbackItem) => !seenAt || f.createdAt > seenAt
  const preview = (unseen.length ? unseen : feed).slice(0, PREVIEW)

  const openAll = () => {
    setOpen(true)
    if (unseen.length) markSeen.mutate()
  }

  return (
    <section className={cn('rounded-2xl border bg-card p-3', unseen.length && 'border-warning/60')}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[15px] font-medium">
          <MessageSquareText className="size-4 text-muted-foreground" aria-hidden />
          {unseen.length ? t('feedback.newTitle', { count: unseen.length }) : t('feedback.title')}
        </h2>
        {unseen.length ? (
          <Button variant="ghost" size="sm" onClick={() => markSeen.mutate()} disabled={markSeen.isPending}>
            {t('feedback.markSeen')}
          </Button>
        ) : null}
      </div>
      <ul className="divide-y">
        {preview.map((f) => (
          <FeedRow key={f.key} item={f} isNew={isNew(f)} />
        ))}
      </ul>
      {feed.length > preview.length ? (
        <Button variant="ghost" size="touch" className="mt-1 w-full" onClick={openAll}>
          {t('feedback.showAll')}
        </Button>
      ) : null}

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="mx-auto max-h-[88dvh] max-w-md">
          <DrawerHeader className="group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
            <DrawerTitle className="font-heading text-lg">{t('feedback.title')}</DrawerTitle>
            <DrawerDescription className="sr-only">{t('feedback.title')}</DrawerDescription>
          </DrawerHeader>
          <ul className="divide-y overflow-y-auto px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
            {feed.map((f) => (
              <FeedRow key={f.key} item={f} isNew={isNew(f)} />
            ))}
          </ul>
        </DrawerContent>
      </Drawer>
    </section>
  )
}

function FeedRow({ item, isNew }: { item: FeedbackItem; isNew: boolean }) {
  const { t } = useTranslation()
  const lang = currentLanguage()
  const { map: exercises } = useExerciseMap()
  const exercise = item.exerciseId ? exercises.get(item.exerciseId) : undefined
  const to = item.planId && item.kind !== 'workout' ? `/plans/${item.planId}` : item.workoutId ? `/workout/${item.workoutId}` : null
  const context = [
    exercise ? exerciseName(exercise, lang) : null,
    item.week ? t('plan.weekN', { n: item.week }) : null,
    item.kind === 'workout' ? t('feedback.onWorkout') : item.kind === 'plan' ? t('feedback.onPlan') : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const content = (
    <span className="flex items-start gap-2 py-2.5">
      <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', isNew ? 'bg-warning' : 'bg-transparent')} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="truncate font-medium text-foreground">{item.athleteName}</span>
          <span className="shrink-0">{format(new Date(item.createdAt), 'd MMM, HH:mm', { locale: dateLocale(lang) })}</span>
        </span>
        {context ? <span className="block truncate text-xs text-muted-foreground">{context}</span> : null}
        <span className="mt-0.5 block text-sm">
          {item.difficulty ? (
            <span className={cn('mr-1.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium', item.difficulty === 3 ? 'bg-warning-muted text-warning-text' : 'bg-secondary')}>
              {t(`feedback.level${item.difficulty}`)}
            </span>
          ) : null}
          {item.body}
        </span>
      </span>
      {to ? <ChevronRight className="mt-3 size-4 shrink-0 text-muted-foreground" aria-hidden /> : null}
    </span>
  )

  return <li>{to ? <Link to={to} className="block hover:bg-secondary/40">{content}</Link> : content}</li>
}
