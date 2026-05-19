import type { Locale } from 'date-fns'
import { enGB, es, pt, fr, it, sv, ar, hi } from 'date-fns/locale'
import { useTranslation } from 'react-i18next'
import i18n from '@/i18n'

const LOCALE_MAP: Record<string, Locale> = {
  en: enGB,
  es: es,
  pt: pt,
  fr: fr,
  it: it,
  sv: sv,
  ar: ar,
  hi: hi,
}

/** Get the date-fns Locale for the current i18n language. For non-React contexts. */
export function getDateLocale(): Locale {
  const lang = i18n.language?.split('-')[0] ?? 'en'
  return LOCALE_MAP[lang] ?? enGB
}

/** Hook — returns the date-fns Locale reactively inside React components. */
export function useDateLocale(): Locale {
  const { i18n: i18nHook } = useTranslation()
  const lang = i18nHook.language?.split('-')[0] ?? 'en'
  return LOCALE_MAP[lang] ?? enGB
}
