import { Send, Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/features/auth/authContext'
import { useMode } from '@/features/mode/modeContext'
import { useAddComment, useDeleteComment, useWorkoutComments } from '@/features/trainer/api'
import { currentLanguage } from '@/i18n'
import { dateLocale } from '@/lib/dates'

/** Trainer ↔ client notes on a workout. Hidden for solo users until there's something to show. */
export function WorkoutComments({ workoutId, createdBy }: { workoutId: string; createdBy: string | null }) {
  const { t } = useTranslation()
  const lang = currentLanguage()
  const { user } = useAuth()
  const { isTrainer } = useMode()
  const { data: comments } = useWorkoutComments(workoutId)
  const add = useAddComment(workoutId)
  const remove = useDeleteComment(workoutId)
  const [body, setBody] = useState('')

  const relevant = isTrainer || (comments?.length ?? 0) > 0 || (createdBy !== null && createdBy !== user?.id)
  if (!relevant) return null

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!body.trim()) return
    add.mutate(body, { onSuccess: () => setBody(''), onError: () => toast.error(t('comments.error')) })
  }

  return (
    <section className="mt-4 rounded-2xl border bg-card p-3">
      <h2 className="mb-2 text-[15px] font-medium">{t('comments.title')}</h2>
      {comments?.length ? (
        <ul className="mb-3 flex flex-col gap-2">
          {comments.map((c) => (
            <li key={c.id} className="rounded-xl bg-secondary/60 px-3 py-2">
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
      ) : (
        <p className="mb-3 text-sm text-muted-foreground">{t('comments.empty')}</p>
      )}
      <form onSubmit={submit} className="flex items-end gap-2">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t('comments.placeholder')}
          aria-label={t('comments.placeholder')}
          maxLength={1000}
          rows={1}
          className="min-h-11 flex-1 resize-none rounded-xl"
        />
        <Button type="submit" variant="secondary" size="icon-touch" aria-label={t('comments.send')} disabled={add.isPending || !body.trim()}>
          <Send />
        </Button>
      </form>
    </section>
  )
}
