import { format } from 'date-fns'
import { Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { currentLanguage } from '@/i18n'
import { BODY_METRICS, hasAnyValue, parseMetric, type BodyEntry, type BodyMetric, type BodyMetricKey, type BodyValues } from '@/lib/body'
import { useDeleteMeasurement, useSaveMeasurement } from './api'

interface MeasurementDrawerProps {
  athleteId: string | undefined
  /** null = new measurement; undefined = closed. */
  entry: BodyEntry | null | undefined
  onClose: () => void
}

export function MeasurementDrawer({ athleteId, entry, onClose }: MeasurementDrawerProps) {
  return (
    <Drawer open={entry !== undefined} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="mx-auto max-h-[92dvh] max-w-md">
        {entry !== undefined ? <MeasurementForm key={entry?.id ?? 'new'} athleteId={athleteId} entry={entry} onClose={onClose} /> : null}
      </DrawerContent>
    </Drawer>
  )
}

const text = (value: number | null, lang: string) =>
  value === null ? '' : lang === 'uk' ? String(value).replace('.', ',') : String(value)

function MeasurementForm({ athleteId, entry, onClose }: { athleteId: string | undefined; entry: BodyEntry | null; onClose: () => void }) {
  const { t } = useTranslation()
  const lang = currentLanguage()
  const save = useSaveMeasurement(athleteId)
  const remove = useDeleteMeasurement(athleteId)
  const [today] = useState(() => format(new Date(), 'yyyy-MM-dd'))

  const [date, setDate] = useState(entry?.measuredAt ?? today)
  const [values, setValues] = useState<Record<BodyMetricKey, string>>(
    () => Object.fromEntries(BODY_METRICS.map((m) => [m.key, text(entry?.[m.key] ?? null, lang)])) as Record<BodyMetricKey, string>,
  )
  const [notes, setNotes] = useState(entry?.notes ?? '')
  const [errors, setErrors] = useState<Partial<Record<BodyMetricKey, boolean>>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const unit = (m: BodyMetric) => t(`body.units.${m.unit}`)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const parsed = {} as BodyValues
    const nextErrors: Partial<Record<BodyMetricKey, boolean>> = {}
    for (const m of BODY_METRICS) {
      const v = parseMetric(values[m.key], m)
      if (v === 'invalid') nextErrors[m.key] = true
      else parsed[m.key] = v
    }
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return
    if (!hasAnyValue(parsed)) {
      setFormError(t('body.needOne'))
      return
    }
    save.mutate(
      { id: entry?.id ?? null, measuredAt: date || today, notes, ...parsed },
      {
        onSuccess: () => {
          toast.success(t('body.saved'))
          onClose()
        },
        onError: () => toast.error(t('body.saveError')),
      },
    )
  }

  const field = (m: BodyMetric) => (
    <div key={m.key} className="flex flex-col gap-1.5">
      <Label htmlFor={`m-${m.key}`}>
        {t(`body.metrics.${m.key}`)}, {unit(m)}
      </Label>
      <Input
        id={`m-${m.key}`}
        inputMode="decimal"
        value={values[m.key]}
        onChange={(e) => {
          setValues((v) => ({ ...v, [m.key]: e.target.value }))
          setErrors((er) => ({ ...er, [m.key]: false }))
          setFormError(null)
        }}
        aria-invalid={errors[m.key] || undefined}
        className="tabular h-11 rounded-xl"
      />
      {errors[m.key] ? (
        <p className="text-xs text-destructive">{t('body.invalid', { range: `${m.min}–${m.max} ${unit(m)}` })}</p>
      ) : null}
    </div>
  )

  const [weight, fat, ...girths] = BODY_METRICS

  return (
    <>
      <DrawerHeader className="group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
        <DrawerTitle className="font-heading text-lg">{entry ? t('body.editTitle') : t('body.newTitle')}</DrawerTitle>
        <DrawerDescription className="sr-only">{t('body.title')}</DrawerDescription>
      </DrawerHeader>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4 overflow-y-auto px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="m-date">{t('body.date')}</Label>
          <Input id="m-date" type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} className="h-11 rounded-xl" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {field(weight)}
          {field(fat)}
        </div>
        <fieldset className="grid grid-cols-2 gap-3">
          <legend className="mb-1 text-xs font-medium text-muted-foreground">{t('body.girths')}</legend>
          {girths.map(field)}
        </fieldset>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="m-notes">{t('body.notes')}</Label>
          <Input
            id="m-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t('body.notesPlaceholder')}
            maxLength={300}
            className="h-11 rounded-xl"
          />
        </div>
        {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

        <Button type="submit" size="xl" disabled={save.isPending}>
          {t('body.save')}
        </Button>

        {entry ? (
          confirmDelete ? (
            <div className="flex flex-col gap-2 rounded-xl bg-danger-muted p-3">
              <p className="text-sm text-danger-text">{t('body.deleteConfirm')}</p>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="secondary" size="touch" onClick={() => setConfirmDelete(false)}>
                  {t('common.cancel')}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="touch"
                  disabled={remove.isPending}
                  onClick={() =>
                    remove.mutate(entry.id, { onSuccess: onClose, onError: () => toast.error(t('body.saveError')) })
                  }
                >
                  {t('workout.discardYes')}
                </Button>
              </div>
            </div>
          ) : (
            <Button type="button" variant="ghost" size="touch" className="text-destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 aria-hidden />
              {t('body.delete')}
            </Button>
          )
        ) : null}
      </form>
    </>
  )
}
