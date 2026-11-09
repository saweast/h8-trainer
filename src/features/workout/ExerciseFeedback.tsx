import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { ExerciseFeedbackPatch } from './api'

const LEVELS = [1, 2, 3] as const

interface ExerciseFeedbackProps {
  difficulty: number | null
  text: string | null
  onChange: (patch: ExerciseFeedbackPatch) => void
  className?: string
}

/** «Як пішло?»: easy / ok / hard and an optional note for the trainer. Tap the chosen level again to clear. */
export function ExerciseFeedback({ difficulty, text, onChange, className }: ExerciseFeedbackProps) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(text ?? '')
  const [writing, setWriting] = useState(false)
  const showNote = writing || Boolean(text) || difficulty !== null

  const saveNote = () => {
    setWriting(false)
    if (draft.trim() !== (text ?? '')) onChange({ athleteFeedback: draft })
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-center gap-1.5">
        <span className="mr-1 text-xs text-muted-foreground">{t('feedback.howWasIt')}</span>
        {LEVELS.map((level) => (
          <button
            key={level}
            type="button"
            aria-pressed={difficulty === level}
            onClick={() => onChange({ difficulty: difficulty === level ? null : level })}
            className={cn(
              'h-8 rounded-full px-3 text-xs font-medium transition-colors',
              difficulty === level
                ? level === 3
                  ? 'bg-warning text-black'
                  : 'bg-primary text-primary-foreground'
                : 'bg-secondary text-secondary-foreground hover:bg-secondary/70',
            )}
          >
            {t(`feedback.level${level}`)}
          </button>
        ))}
        {showNote ? null : (
          <button type="button" onClick={() => setWriting(true)} className="ml-auto text-xs text-muted-foreground underline-offset-2 hover:underline">
            {t('feedback.addNote')}
          </button>
        )}
      </div>
      {showNote ? (
        <Input
          autoFocus={writing}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={saveNote}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
          placeholder={t('feedback.notePlaceholder')}
          aria-label={t('feedback.notePlaceholder')}
          maxLength={300}
          className="h-10 rounded-lg text-sm"
        />
      ) : null}
    </div>
  )
}
