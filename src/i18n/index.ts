import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import uk from './locales/uk.json'

export const LANGUAGES = ['uk', 'en'] as const
export type Language = (typeof LANGUAGES)[number]

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { uk: { translation: uk }, en: { translation: en } },
    // Ukrainian unless the user picked English in the profile.
    fallbackLng: 'uk',
    supportedLngs: LANGUAGES,
    load: 'languageOnly',
    detection: { order: ['localStorage'], lookupLocalStorage: 'h8.lang', caches: ['localStorage'] },
    interpolation: { escapeValue: false },
  })

function syncHtmlLang(lng: string) {
  document.documentElement.lang = lng
}
syncHtmlLang(i18n.resolvedLanguage ?? 'uk')
i18n.on('languageChanged', syncHtmlLang)

export function currentLanguage(): Language {
  return i18n.resolvedLanguage === 'en' ? 'en' : 'uk'
}

export default i18n
