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
