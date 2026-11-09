import { Check, ChevronDown, Maximize2, MessageSquare } from 'lucide-react'
import { useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { currentLanguage } from '@/i18n'
import { cellStatus, doneAsSpec, type CellStatus } from '@/lib/planGrid'
import { formatSetSpec, parseSetSpec, type SpecSet } from '@/lib/setSpec'
import { cn } from '@/lib/utils'
import type { PlanFact } from './api'

export interface CellFeedback {
  difficulty: number | null
  text: string | null
  comments: number
}

interface CellViewProps {
  planned: SpecSet[] | undefined
  fact: PlanFact | undefined
  feedback?: CellFeedback | null
  bodyweight: boolean
  isNext?: boolean
  compact?: boolean
}

export function StatusIcon({ status, className }: { status: CellStatus; className?: string }) {
  const { t } = useTranslation()
  if (status === 'done' || status === 'extra')
    return <Check className={cn('size-3.5 shrink-0 text-lime-text dark:text-lime', className)} aria-label={t('plan.statusDone')} />
  if (status === 'under')
    return <ChevronDown className={cn('size-3.5 shrink-0 text-warning-text', className)} aria-label={t('plan.statusUnder')} />
  return null
}

/** Planned sets, what was done, and a feedback marker — the content of one grid cell. */
export function CellView({ planned, fact, feedback, bodyweight, isNext }: CellViewProps) {
  const { t } = useTranslation()
  const lang = currentLanguage()
  const status = cellStatus(planned, fact?.sets)
  const done = fact ? doneAsSpec(fact.sets) : []
  const hasFeedback = Boolean(feedback && (feedback.difficulty || feedback.text || feedback.comments))

  return (
    <span className="relative flex min-h-11 flex-col gap-0.5 text-left">
      {hasFeedback ? (
        <span
          className="absolute -top-1.5 -right-1.5 size-0 border-t-[10px] border-l-[10px] border-t-warning border-l-transparent"
          aria-label={t('plan.hasFeedback')}
        />
      ) : null}
      {planned?.length ? (
        <span className="tabular font-mono text-[13px] leading-snug break-words">
          {formatSetSpec(planned, { bodyweight, locale: lang })}
        </span>
      ) : (
        <span className="text-[13px] text-muted-foreground/60">—</span>
      )}
      {done.length ? (
        <span className="flex items-start gap-1 text-[11px] leading-snug text-muted-foreground">
          <StatusIcon status={status} className="mt-px" />
          <span className="tabular font-mono break-words">{formatSetSpec(done, { bodyweight, locale: lang })}</span>
        </span>
      ) : isNext ? (
        <span className="text-[11px] font-medium text-lime-text dark:text-lime">{t('plan.nextShort')}</span>
      ) : null}
      {hasFeedback && feedback?.comments ? (
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <MessageSquare className="size-3" aria-hidden />
          {feedback.comments}
        </span>
      ) : null}
    </span>
  )
}

interface InlineEditorProps {
  initial: SpecSet[] | undefined
  bodyweight: boolean
  onCommit: (sets: SpecSet[]) => void
  /** Leave editing (Esc, click outside). */
  onClose: () => void
  /** Move after committing: Enter → down, Tab → right, Shift+Tab → left. */
  onMove: (direction: 'down' | 'right' | 'left') => void
  /** Open the cell drawer: what was done, feedback, comments, start. */
  onDetails: () => void
}

/** Spreadsheet-like editing in place: type, Enter/Tab to commit and move on, Esc to cancel. */
export function InlineCellEditor({ initial, bodyweight, onCommit, onClose, onMove, onDetails }: InlineEditorProps) {
  const { t } = useTranslation()
  const lang = currentLanguage()
  const [text, setText] = useState(() => (initial?.length ? formatSetSpec(initial, { bodyweight, locale: lang }) : ''))
  const parsed = parseSetSpec(text, { bodyweight })
  const invalid = parsed.warnings.find((w) => w.kind === 'invalid')
  const swapped = parsed.warnings.find((w) => w.kind === 'swapped')

  // Set once the editor has been left by a key or button, so the following blur doesn't act again.
  const left = useRef(false)
  const leave = (fn: () => void) => {
    left.current = true
    fn()
  }

  const commit = () => {
    if (invalid) return false
    onCommit(parsed.sets)
    return true
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      leave(onClose)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (commit()) leave(() => onMove('down'))
    } else if (e.key === 'Tab') {
      e.preventDefault()
      if (commit()) leave(() => onMove(e.shiftKey ? 'left' : 'right'))
    }
  }

  const warm = parsed.sets.filter((s) => s.isWarmup)
  const work = parsed.sets.filter((s) => !s.isWarmup)

  return (
    <span className="flex flex-col gap-1">
      <input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => {
          if (left.current) return
          // click outside: keep valid input, drop invalid
          commit()
          leave(onClose)
        }}
        aria-label={t('setSpec.label')}
        aria-invalid={Boolean(invalid)}
        spellCheck={false}
        autoComplete="off"
        className={cn(
          'tabular h-9 w-full rounded-lg border bg-background px-2 font-mono text-[13px] outline-none focus:ring-3 focus:ring-ring/50',
          invalid && 'border-destructive',
        )}
      />
      {invalid ? (
        <span className="text-[11px] text-destructive">{t('setSpec.invalid', { token: invalid.token })}</span>
      ) : swapped ? (
        <span className="text-[11px] text-warning-text">
          {t('setSpec.swapped', { token: swapped.token })} {swapped.suggestion}?
        </span>
      ) : parsed.sets.length ? (
        <span className="tabular text-[11px] leading-snug text-muted-foreground">
          {warm.length ? `${t('setSpec.warmup')}: ${formatSetSpec(warm, { bodyweight, locale: lang, warmupMarker: '' })} · ` : ''}
          {t('setSpec.working')}: {formatSetSpec(work, { bodyweight, locale: lang })}
        </span>
      ) : null}
      <button
        type="button"
        // keep focus in the input so blur doesn't close the editor first
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          commit()
          leave(onDetails)
        }}
        className="flex items-center gap-1 self-start text-[11px] font-medium text-lime-text underline-offset-2 hover:underline dark:text-lime"
      >
        <Maximize2 className="size-3" aria-hidden />
        {t('plan.details')}
      </button>
    </span>
  )
}
