import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en'
import es from './locales/es'
import pt from './locales/pt'
import fr from './locales/fr'
import it from './locales/it'
import sv from './locales/sv'
import ar from './locales/ar'
import hi from './locales/hi'

const STORAGE_KEY = 'ppa_language'

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'pt', label: 'Português' },
  { code: 'fr', label: 'Français' },
  { code: 'it', label: 'Italiano' },
  { code: 'sv', label: 'Svenska' },
  { code: 'ar', label: 'العربية' },
  { code: 'hi', label: 'हिन्दी' },
]

const SUPPORTED_CODES = SUPPORTED_LANGUAGES.map((l) => l.code)

// Languages that render right-to-left. Keep in sync with SUPPORTED_LANGUAGES.
const RTL_LANGUAGES = new Set(['ar'])

// Reflect the active language onto <html> so layout direction and lang are
// correct (fixes Arabic rendering LTR). Called on init and on every switch.
function applyDocumentLanguage(code: string) {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('lang', code)
  document.documentElement.setAttribute('dir', RTL_LANGUAGES.has(code) ? 'rtl' : 'ltr')
}

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
      hi: { translation: hi },
    },
    lng: savedLang,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  })

// Apply direction/lang for the initially-loaded language.
applyDocumentLanguage(savedLang)

export function setLanguage(code: string) {
  i18n.changeLanguage(code)
  applyDocumentLanguage(code)
  localStorage.setItem(STORAGE_KEY, code)
  // Clear stale keys from other naming conventions
  localStorage.removeItem('language')
  localStorage.removeItem('i18n_language')
}

export default i18n
