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

const savedLang = typeof localStorage !== 'undefined'
  ? (localStorage.getItem(STORAGE_KEY) ?? 'en')
  : 'en'

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
}

export default i18n
