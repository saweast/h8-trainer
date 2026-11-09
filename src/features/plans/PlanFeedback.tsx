import { format } from 'date-fns'
import { Send, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/features/auth/authContext'
import { currentLanguage } from '@/i18n'
import { dateLocale } from '@/lib/dates'
import type { PlanRowDraft } from '@/lib/planGrid'
import { cn } from '@/lib/utils'
import { useAddPlanComment, useDeletePlanComment, usePlanComments, type PlanComment, type PlanFact } from './api'

/** Client feedback on the performed exercise plus the comment thread for one cell. */
export function CellFeedbackThread({
  planId,
  athleteId,
  rowId,
  week,
  fact,
}: {
  planId: string
  athleteId: string | null
  rowId: string
  week: number
  fact: PlanFact | undefined
}) {
  const { t } = useTranslation()
  const { data: comments } = usePlanComments(planId)
  if (!athleteId) return null
  const thread = (comments ?? []).filter((c) => c.rowId === rowId && c.week === week)

  return (
    <div className="flex flex-col gap-2">
      {fact?.difficulty || fact?.athleteFeedback ? (
        <div className="rounded-xl bg-warning-muted px-3 py-2 text-sm text-warning-text">
          <p className="text-xs font-medium">
            {t('feedback.fromClient')}
            {fact.difficulty ? ` · ${t(`feedback.level${fact.difficulty}`)}` : ''}
          </p>
          {fact.athleteFeedback ? <p className="mt-0.5 whitespace-pre-wrap">{fact.athleteFeedback}</p> : null}
        </div>
      ) : null}
      <CommentThread planId={planId} rowId={rowId} week={week} comments={thread} placeholder={t('feedback.cellPlaceholder')} />
    </div>
  )
}

/** Comments on the whole plan and the latest cell comments, under the grid. */
export function PlanFeedback({
  planId,
  athleteId,
  rows,
  nameOf,
}: {
  planId: string
  athleteId: string | null
  rows: { row: PlanRowDraft }[]
  nameOf: (exerciseId: string) => string
}) {
  const { t } = useTranslation()
  const { data: comments } = usePlanComments(planId)
  if (!athleteId) return null
  const general = (comments ?? []).filter((c) => c.rowId === null)
  const exerciseOf = (rowId: string) => {
    const row = rows.find((r) => r.row.id === rowId)?.row
    return row ? nameOf(row.exerciseId) : ''
  }
  const cellComments = (comments ?? []).filter((c) => c.rowId !== null).slice(-5).reverse()

  return (
    <section className="flex flex-col gap-3 rounded-2xl border bg-card p-3 md:max-w-xl">
      <h2 className="text-[15px] font-medium">{t('feedback.planTitle')}</h2>
      {cellComments.length ? (
        <div className="flex flex-col gap-1">
          <p className="text-xs text-muted-foreground">{t('feedback.latestInCells')}</p>
          <ul className="flex flex-col gap-1">
            {cellComments.map((c) => (
              <li key={c.id} className="text-sm">
                <span className="text-xs text-muted-foreground">
                  {exerciseOf(c.rowId!)}
                  {c.week ? ` · ${t('plan.weekN', { n: c.week })}` : ''} · {c.authorName}:
                </span>{' '}
                {c.body}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <CommentThread planId={planId} rowId={null} week={null} comments={general} placeholder={t('feedback.planPlaceholder')} />
    </section>
  )
}

function CommentThread({
  planId,
  rowId,
  week,
  comments,
  placeholder,
}: {
  planId: string
  rowId: string | null
  week: number | null
  comments: PlanComment[]
  placeholder: string
}) {
  const { t } = useTranslation()
  const lang = currentLanguage()
  const { user } = useAuth()
  const add = useAddPlanComment(planId)
  const remove = useDeletePlanComment(planId)
  const [body, setBody] = useState('')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!body.trim()) return
    add.mutate({ rowId, week, body }, { onSuccess: () => setBody(''), onError: () => toast.error(t('comments.error')) })
  }

  return (
    <div className="flex flex-col gap-2">
      {comments.length ? (
        <ul className="flex flex-col gap-1.5">
          {comments.map((c) => (
            <li key={c.id} className={cn('rounded-xl px-3 py-2', c.authorId === user?.id ? 'bg-secondary/60' : 'bg-trainer-muted')}>
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="truncate font-medium text-foreground">{c.authorName}</span>
                <span className="flex shrink-0 items-center gap-1">
                  {format(new Date(c.createdAt), 'd MMM, HH:mm', { locale: dateLocale(lang) })}
                  {c.authorId === user?.id ? (
                    <button
                      type="button"
                      onClick={() => remove.mutate(c.id)}
                      aria-label={t('comments.delete')}
                      className="flex size-7 items-center justify-center rounded-md hover:bg-secondary"
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </button>
                  ) : null}
                </span>
              </div>
              <p className="mt-0.5 text-sm whitespace-pre-wrap">{c.body}</p>
            </li>
          ))}
        </ul>
      ) : null}
      <form onSubmit={submit} className="flex items-end gap-2">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          maxLength={1000}
          rows={1}
          className="min-h-11 flex-1 resize-none rounded-xl"
        />
        <Button type="submit" variant="secondary" size="icon-touch" aria-label={t('comments.send')} disabled={add.isPending || !body.trim()}>
          <Send />
        </Button>
      </form>
    </div>
  )
}
