import { format, type Locale } from 'date-fns'
import { enUS, uk } from 'date-fns/locale'
import type { Language } from '@/i18n'

export function dateLocale(lang: Language): Locale {
  return lang === 'en' ? enUS : uk
}

/** "Вівторок, 4 листопада" / "Tuesday, November 4" */
export function formatLongDay(date: Date, lang: Language): string {
  const text = format(date, lang === 'en' ? 'EEEE, MMMM d' : 'EEEE, d MMMM', { locale: dateLocale(lang) })
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** "сьогодні" / "вчора" / "4 лист." for list rows. */
export function relativeDay(date: Date, today: Date, lang: Language, words: { today: string; yesterday: string }): string {
  const days = Math.round((startOfDayMs(today) - startOfDayMs(date)) / 86_400_000)
  if (days === 0) return words.today
  if (days === 1) return words.yesterday
  return format(date, 'd MMM', { locale: dateLocale(lang) })
}

function startOfDayMs(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}
