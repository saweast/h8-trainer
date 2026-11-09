import { Eraser, Play } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { SetSpecInput, type SetSpecValue } from '@/components/common/SetSpecInput'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { currentLanguage } from '@/i18n'
import { cellStatus, doneAsSpec } from '@/lib/planGrid'
import { formatSetSpec, type SpecSet } from '@/lib/setSpec'
import type { PlanFact } from './api'
import { StatusIcon } from './PlanCell'

export interface CellTarget {
  rowId: string
  week: number
  dayId: string
  dayName: string
  exerciseName: string
  bodyweight: boolean
  planned: SpecSet[] | undefined
  previous: SpecSet[] | undefined
  fact: PlanFact | undefined
}

interface CellDrawerProps {
  target: CellTarget | null
  readOnly: boolean
  canStart: boolean
  starting: boolean
  onClose: () => void
  onSave: (sets: SpecSet[]) => void
  onStart: (week: number, dayId: string) => void
  /** Feedback block (phase: client feedback), rendered under the fact. */
  children?: ReactNode
}

/** One cell up close: edit the plan (owner), see what was done, start that day's workout. */
export function CellDrawer({ target, readOnly, canStart, starting, onClose, onSave, onStart, children }: CellDrawerProps) {
  return (
    <Drawer open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="mx-auto max-h-[92dvh] max-w-md">
        {target ? (
          <Body
            key={`${target.rowId}:${target.week}`}
            target={target}
            readOnly={readOnly}
            canStart={canStart}
            starting={starting}
            onSave={onSave}
            onStart={onStart}
          >
            {children}
          </Body>
        ) : null}
      </DrawerContent>
    </Drawer>
  )
}

function Body({ target, readOnly, canStart, starting, onSave, onStart, children }: Omit<CellDrawerProps, 'target' | 'onClose'> & { target: CellTarget }) {
  const { t } = useTranslation()
  const lang = currentLanguage()
  const [spec, setSpec] = useState<SetSpecValue>({ sets: target.planned ?? [], valid: true })
  const fmt = (sets: SpecSet[]) => formatSetSpec(sets, { bodyweight: target.bodyweight, locale: lang })
  const done = target.fact ? doneAsSpec(target.fact.sets) : []

  return (
    <>
      <DrawerHeader className="group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
        <DrawerTitle className="font-heading text-lg">{target.exerciseName}</DrawerTitle>
        <DrawerDescription>
          {t('plan.weekN', { n: target.week })} · {target.dayName}
        </DrawerDescription>
      </DrawerHeader>
      <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        {readOnly ? (
          <div className="rounded-xl bg-secondary/60 p-3">
            <p className="text-xs text-muted-foreground">{t('plan.planned')}</p>
            <p className="tabular mt-0.5 font-mono text-[15px]">{target.planned?.length ? fmt(target.planned) : '—'}</p>
          </div>
        ) : (
          <SetSpecInput
            label={t('plan.planned')}
            initial={target.planned ?? null}
            bodyweight={target.bodyweight}
            onChange={setSpec}
            previous={target.previous?.length ? { label: t('plan.weekN', { n: target.week - 1 }), sets: target.previous } : null}
            autoFocus={!target.planned?.length}
          />
        )}

        {done.length ? (
          <div className="rounded-xl border p-3">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <StatusIcon status={cellStatus(target.planned, target.fact?.sets)} />
              {t('plan.done')}
            </p>
            <p className="tabular mt-0.5 font-mono text-[15px]">{fmt(done)}</p>
            <Link to={`/workout/${target.fact!.workoutId}`} className="mt-1 inline-block text-xs font-medium text-lime-text underline-offset-2 hover:underline dark:text-lime">
              {t('plan.openWorkout')}
            </Link>
          </div>
        ) : null}

        {children}

        {readOnly ? null : (
          <div className="flex gap-2">
            <Button size="xl" className="flex-1" disabled={!spec.valid} onClick={() => onSave(spec.sets)}>
              {t('templates.done')}
            </Button>
            {target.planned?.length ? (
              <Button variant="secondary" size="xl" onClick={() => onSave([])} aria-label={t('plan.clearCell')}>
                <Eraser />
              </Button>
            ) : null}
          </div>
        )}

        {canStart ? (
          <Button variant={readOnly ? 'default' : 'secondary'} size="xl" disabled={starting} onClick={() => onStart(target.week, target.dayId)}>
            <Play aria-hidden />
            {t('plan.startSlot', { n: target.week, day: target.dayName })}
          </Button>
        ) : null}
      </div>
    </>
  )
}
