import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en'
import es from './locales/es'
import pt from './locales/pt'
import fr from './locales/fr'
import it from './locales/it'
import sv from './locales/sv'
import ar from './locales/ar'

const STORAGE_KEY = 'ppa_language'

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'pt', label: 'Português' },
  { code: 'fr', label: 'Français' },
  { code: 'it', label: 'Italiano' },
  { code: 'sv', label: 'Svenska' },
  { code: 'ar', label: 'العربية' },
]

const SUPPORTED_CODES = SUPPORTED_LANGUAGES.map((l) => l.code)

const savedLang = (() => {
  if (typeof localStorage === 'undefined') return 'en'
  const stored = localStorage.getItem(STORAGE_KEY)
    ?? localStorage.getItem('language')
    ?? localStorage.getItem('i18n_language')
  return stored && SUPPORTED_CODES.includes(stored) ? stored : 'en'
})()

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      es: { translation: es },
      pt: { translation: pt },
      fr: { translation: fr },
      it: { translation: it },
      sv: { translation: sv },
      ar: { translation: ar },
    },
    lng: savedLang,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  })

export function setLanguage(code: string) {
  i18n.changeLanguage(code)
  localStorage.setItem(STORAGE_KEY, code)
  // Clear stale keys from other naming conventions
  localStorage.removeItem('language')
  localStorage.removeItem('i18n_language')
}

export default i18n
