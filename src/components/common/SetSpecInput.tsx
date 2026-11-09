import { TriangleAlert } from 'lucide-react'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { currentLanguage } from '@/i18n'
import { formatKg, formatVolume } from '@/lib/format'
import { formatSetSpec, parseSetSpec, specVolume, type SpecSet, type SpecWarning } from '@/lib/setSpec'
import { cn } from '@/lib/utils'

export interface SetSpecValue {
  sets: SpecSet[]
  /** False while some token can't be read — callers shouldn't save then. */
  valid: boolean
}

interface SetSpecInputProps {
  initial: SpecSet[] | null
  onChange: (value: SetSpecValue) => void
  bodyweight?: boolean
  /** Shown under the preview for comparison (e.g. the previous week). */
  previous?: { label: string; sets: SpecSet[] } | null
  label?: string
  autoFocus?: boolean
  className?: string
}

/**
 * Text input for the spreadsheet notation ("20x10, 50x5, 80x8x3") with a live preview of the
 * sets. Tapping a set toggles warm-up; the text is then rewritten from the sets.
 */
export function SetSpecInput({ initial, onChange, bodyweight = false, previous, label, autoFocus, className }: SetSpecInputProps) {
  const { t } = useTranslation()
  const lang = currentLanguage()
  const id = useId()
  const [text, setText] = useState(() => (initial?.length ? formatSetSpec(initial, { bodyweight, locale: lang }) : ''))
  const [parsed, setParsed] = useState(() => parseSetSpec(text, { bodyweight }))

  const update = (next: string) => {
    const result = parseSetSpec(next, { bodyweight })
    setText(next)
    setParsed(result)
    onChange({ sets: result.sets, valid: !result.warnings.some((w) => w.kind === 'invalid') })
  }

  const toggle = (index: number) => {
    const sets = parsed.sets.map((s, i) => (i === index ? { ...s, isWarmup: !s.isWarmup } : s))
    update(formatSetSpec(sets, { bodyweight, locale: lang }))
  }

  const warmups = parsed.sets.map((s, i) => ({ s, i })).filter(({ s }) => s.isWarmup)
  const working = parsed.sets.map((s, i) => ({ s, i })).filter(({ s }) => !s.isWarmup)
  const volume = specVolume(parsed.sets)

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {label ? (
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
      ) : null}
      <Input
        id={id}
        value={text}
        onChange={(e) => update(e.target.value)}
        placeholder={bodyweight ? '12x4' : '20x10, 50x5, 80x8x3'}
        autoFocus={autoFocus}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        inputMode="text"
        aria-describedby={`${id}-hint`}
        className="tabular h-11 rounded-xl font-mono text-[15px]"
      />
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        {bodyweight ? t('setSpec.hintBodyweight') : t('setSpec.hint')}
      </p>

      {parsed.sets.length ? (
        <div className="flex flex-col gap-1.5 rounded-xl bg-secondary/50 p-2.5">
          {warmups.length ? (
            <SetRowPreview label={t('setSpec.warmup')} items={warmups} onToggle={toggle} lang={lang} bodyweight={bodyweight} warm />
          ) : null}
          {working.length ? (
            <SetRowPreview label={t('setSpec.working')} items={working} onToggle={toggle} lang={lang} bodyweight={bodyweight} />
          ) : null}
          <p className="text-[11px] text-muted-foreground">
            {t('setSpec.toggleHint')}
            {volume > 0 ? ` · ${t('setSpec.volume', { kg: formatVolume(volume, lang) })}` : null}
          </p>
        </div>
      ) : null}

      {parsed.warnings.length ? (
        <ul className="flex flex-col gap-1">
          {parsed.warnings.map((w, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs text-warning-text">
              <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
              <WarningText warning={w} onApply={(from, to) => update(text.replace(from, to))} />
            </li>
          ))}
        </ul>
      ) : null}

      {previous?.sets.length ? (
        <p className="text-xs text-muted-foreground">
          {previous.label}: <span className="tabular font-mono">{formatSetSpec(previous.sets, { bodyweight, locale: lang })}</span>
        </p>
      ) : null}
    </div>
  )
}

function SetRowPreview({
  label,
  items,
  onToggle,
  lang,
  bodyweight,
  warm = false,
}: {
  label: string
  items: { s: SpecSet; i: number }[]
  onToggle: (index: number) => void
  lang: string
  bodyweight: boolean
  warm?: boolean
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="w-16 shrink-0 pt-1 text-[11px] font-medium text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-1">
        {items.map(({ s, i }) => (
          <button
            key={i}
            type="button"
            onClick={() => onToggle(i)}
            title={s.note}
            className={cn(
              'tabular h-7 rounded-lg px-2 text-[13px] font-medium transition-colors',
              warm ? 'bg-warning-muted text-warning-text' : 'bg-card text-foreground shadow-xs',
            )}
          >
            {bodyweight && s.weightKg === 0 ? s.reps : `${formatKg(s.weightKg, lang)}×${s.reps}`}
            {s.note ? '*' : ''}
          </button>
        ))}
      </div>
    </div>
  )
}

function WarningText({ warning, onApply }: { warning: SpecWarning; onApply: (from: string, to: string) => void }) {
  const { t } = useTranslation()
  if (warning.kind === 'invalid') return <span>{t('setSpec.invalid', { token: warning.token })}</span>
  if (warning.kind === 'tooMany') return <span>{t('setSpec.tooMany')}</span>
  return (
    <span>
      {t('setSpec.swapped', { token: warning.token })}{' '}
      <button type="button" className="font-medium underline underline-offset-2" onClick={() => onApply(warning.token, warning.suggestion)}>
        {warning.suggestion}
      </button>
      ?
    </span>
  )
}
