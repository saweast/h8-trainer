import { ChevronLeft, ChevronRight } from 'lucide-react'
import { addMonths, format, isToday } from 'date-fns'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { currentLanguage } from '@/i18n'
import { monthGrid } from '@/lib/calendar'
import { dateLocale } from '@/lib/dates'
import { cn } from '@/lib/utils'

interface MonthCalendarProps {
  month: Date
  onMonthChange: (month: Date) => void
  /** Local day keys ("yyyy-MM-dd") that have at least one workout. */
  workoutDays: Set<string>
  selected: string | null
  onSelect: (key: string | null) => void
  canGoForward: boolean
}

export function MonthCalendar({ month, onMonthChange, workoutDays, selected, onSelect, canGoForward }: MonthCalendarProps) {
  const { t } = useTranslation()
  const lang = currentLanguage()
  const locale = dateLocale(lang)
  const weeks = useMemo(() => monthGrid(month), [month])
  const weekdays = weeks[0].map((d) => format(d.date, 'EEEEEE', { locale }))
  const title = format(month, 'LLLL yyyy', { locale })

  return (
    <div className="rounded-2xl border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <Button variant="ghost" size="icon-touch" onClick={() => onMonthChange(addMonths(month, -1))} aria-label={t('history.prevMonth')}>
          <ChevronLeft />
        </Button>
        <p className="text-sm font-medium first-letter:uppercase">{title}</p>
        <Button
          variant="ghost"
          size="icon-touch"
          onClick={() => onMonthChange(addMonths(month, 1))}
          disabled={!canGoForward}
          aria-label={t('history.nextMonth')}
        >
          <ChevronRight />
        </Button>
      </div>

      <div className="grid grid-cols-7 text-center text-[11px] text-muted-foreground" aria-hidden>
        {weekdays.map((w, i) => (
          <span key={i} className="py-1 first-letter:uppercase">
            {w}
          </span>
        ))}
      </div>

      <div role="grid" aria-label={title} className="grid grid-cols-7 gap-y-1">
        {weeks.flat().map((d) => {
          const trained = workoutDays.has(d.key)
          const isSelected = selected === d.key
          return (
            <button
              key={d.key}
              type="button"
              role="gridcell"
              aria-selected={isSelected}
              aria-label={`${format(d.date, 'd MMMM', { locale })}${trained ? `, ${t('history.trainedOn')}` : ''}`}
              disabled={!d.inMonth}
              onClick={() => onSelect(isSelected ? null : d.key)}
              className={cn(
                'relative mx-auto flex size-10 flex-col items-center justify-center rounded-xl text-sm tabular transition-colors',
                !d.inMonth && 'text-muted-foreground/40',
                d.inMonth && 'hover:bg-secondary',
                isToday(d.date) && 'font-semibold text-foreground',
                isSelected && 'bg-primary text-primary-foreground hover:bg-primary',
              )}
            >
              {format(d.date, 'd')}
              {trained ? (
                <span
                  className={cn(
                    'absolute bottom-1.5 size-1.5 rounded-full',
                    isSelected ? 'bg-primary-foreground' : 'bg-lime-text dark:bg-lime',
                  )}
                  aria-hidden
                />
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
