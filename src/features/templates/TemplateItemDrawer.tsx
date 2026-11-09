import { Minus, Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SetSpecInput, type SetSpecValue } from '@/components/common/SetSpecInput'
import { currentLanguage } from '@/i18n'
import { parseWeight } from '@/lib/format'
import type { TemplateItem } from './api'

interface TemplateItemDrawerProps {
  item: TemplateItem | null
  title: string
  bodyweight?: boolean
  onClose: (updated: TemplateItem | null) => void
}

const toInt = (text: string, min: number, max: number): number | null => {
  if (!text.trim()) return null
  const n = Number.parseInt(text, 10)
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : null
}

export function TemplateItemDrawer({ item, title, bodyweight = false, onClose }: TemplateItemDrawerProps) {
  return (
    <Drawer open={item !== null} onOpenChange={(open) => !open && onClose(null)}>
      <DrawerContent className="mx-auto max-h-[92dvh] max-w-md">
        {item ? <ItemForm key={item.exerciseId} item={item} title={title} bodyweight={bodyweight} onClose={onClose} /> : null}
      </DrawerContent>
    </Drawer>
  )
}

function ItemForm({
  item,
  title,
  bodyweight,
  onClose,
}: {
  item: TemplateItem
  title: string
  bodyweight: boolean
  onClose: (u: TemplateItem | null) => void
}) {
  const { t } = useTranslation()
  const lang = currentLanguage()
  const [sets, setSets] = useState(item.targetSets)
  const [repsMin, setRepsMin] = useState(item.targetRepsMin?.toString() ?? '')
  const [repsMax, setRepsMax] = useState(item.targetRepsMax?.toString() ?? '')
  const [weight, setWeight] = useState(
    item.targetWeightKg === null ? '' : lang === 'uk' ? String(item.targetWeightKg).replace('.', ',') : String(item.targetWeightKg),
  )
  const [rest, setRest] = useState(item.restS?.toString() ?? '')
  const [notes, setNotes] = useState(item.notes ?? '')
  const [spec, setSpec] = useState<SetSpecValue>({ sets: item.sets ?? [], valid: true })
  const exact = spec.sets.length > 0

  const done = () => {
    if (!spec.valid) return
    if (exact) {
      onClose({
        ...item,
        targetSets: Math.min(Math.max(spec.sets.filter((s) => !s.isWarmup).length, 1), 20),
        sets: spec.sets,
        restS: toInt(rest, 0, 1800),
        notes: notes.trim() || null,
      })
      return
    }
    let min = toInt(repsMin, 1, 100)
    let max = toInt(repsMax, 1, 100)
    if (min !== null && max === null) [min, max] = [null, min]
    if (min !== null && max !== null && min > max) [min, max] = [max, min]
    onClose({
      ...item,
      targetSets: sets,
      targetRepsMin: min === max ? null : min,
      targetRepsMax: max,
      targetWeightKg: weight.trim() ? parseWeight(weight) : null,
      restS: toInt(rest, 0, 1800),
      notes: notes.trim() || null,
      sets: null,
    })
  }

  return (
    <>
      <DrawerHeader className="group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
        <DrawerTitle className="font-heading text-lg">{title}</DrawerTitle>
        <DrawerDescription className="sr-only">{t('templates.editItem')}</DrawerDescription>
      </DrawerHeader>
      <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <SetSpecInput label={t('setSpec.label')} initial={item.sets ?? null} bodyweight={bodyweight} onChange={setSpec} />

        {exact ? null : (
          <>
            <p className="-mb-2 text-xs font-medium text-muted-foreground">{t('setSpec.orSimple')}</p>
            <div className="flex flex-col gap-1.5">
              <Label>{t('templates.sets')}</Label>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="icon-touch" onClick={() => setSets((s) => Math.max(1, s - 1))} aria-label="−1">
                  <Minus />
                </Button>
                <output className="font-heading tabular flex h-11 flex-1 items-center justify-center rounded-xl bg-secondary text-xl">
                  {sets}
                </output>
                <Button variant="secondary" size="icon-touch" onClick={() => setSets((s) => Math.min(20, s + 1))} aria-label="+1">
                  <Plus />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="reps-min">{t('templates.repsFrom')}</Label>
                <Input id="reps-min" inputMode="numeric" value={repsMin} onChange={(e) => setRepsMin(e.target.value.replace(/\D/g, ''))} className="tabular h-11 rounded-xl" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="reps-max">{t('templates.repsTo')}</Label>
                <Input id="reps-max" inputMode="numeric" value={repsMax} onChange={(e) => setRepsMax(e.target.value.replace(/\D/g, ''))} className="tabular h-11 rounded-xl" />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="target-weight">{t('templates.targetWeight')}</Label>
              <Input id="target-weight" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} className="tabular h-11 rounded-xl" />
              <p className="text-xs text-muted-foreground">{t('templates.targetWeightHint')}</p>
            </div>
          </>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rest">{t('templates.rest')}</Label>
          <Input id="rest" inputMode="numeric" value={rest} onChange={(e) => setRest(e.target.value.replace(/\D/g, ''))} className="tabular h-11 rounded-xl" />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="item-notes">{t('templates.itemNotes')}</Label>
          <Input id="item-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} className="h-11 rounded-xl" />
        </div>

        <Button size="xl" onClick={done} disabled={!spec.valid}>
          {t('templates.done')}
        </Button>
      </div>
    </>
  )
}
