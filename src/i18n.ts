import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en'
import es from './locales/es'
import pt from './locales/pt'

const STORAGE_KEY = 'ppa_language'

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'pt', label: 'Português' },
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
