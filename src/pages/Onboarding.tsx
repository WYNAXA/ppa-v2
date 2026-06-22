import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronRight, ChevronLeft, MapPin, Calendar, TrendingUp, Users, Trophy, Heart, Bell } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { setLanguage, SUPPORTED_LANGUAGES } from '@/i18n'
import { reverseGeocode } from '@/lib/geocode'
import { isPushSupported, subscribeToPush } from '@/lib/push'

// ── Preserved exports (DB-backed + localStorage fast-path) ──────────────────

const ONBOARDING_KEY = 'ppa_onboarding_complete'

export function useOnboardingRequired(): boolean {
  return false // Controlled by OnboardingGuard in App.tsx
}

export async function markOnboardingComplete(userId: string) {
  await supabase
    .from('profiles')
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq('id', userId)
  localStorage.setItem(ONBOARDING_KEY, 'true')
}

export function isOnboardingComplete(profile?: { onboarding_completed_at?: string | null } | null): boolean {
  if (profile !== undefined && profile !== null) {
    return !!profile.onboarding_completed_at
  }
  return localStorage.getItem(ONBOARDING_KEY) === 'true'
}

// ── Playtomic → ELO conversion ──────────────────────────────────────────────

function playtomicToElo(level: number): number {
  return Math.max(600, Math.min(2500, Math.round(1500 + (level - 2.5) * 270)))
}

const LANG_FLAGS: Record<string, string> = {
  en: '\uD83C\uDDEC\uD83C\uDDE7',
  es: '\uD83C\uDDEA\uD83C\uDDF8',
  pt: '\uD83C\uDDF5\uD83C\uDDF9',
  fr: '\uD83C\uDDEB\uD83C\uDDF7',
  it: '\uD83C\uDDEE\uD83C\uDDF9',
  sv: '\uD83C\uDDF8\uD83C\uDDEA',
  ar: '\uD83C\uDDF8\uD83C\uDDE6',
  hi: '\uD83C\uDDEE\uD83C\uDDF3',
}

const LANG_OPTIONS = SUPPORTED_LANGUAGES.map((lang) => ({
  code: lang.code,
  flag: LANG_FLAGS[lang.code] ?? '',
  label: lang.label,
}))

// ── Steps ───────────────────────────────────────────────────────────────────

const STEPS = ['welcome', 'language', 'location', 'level', 'tour', 'notifications'] as const
type Step = (typeof STEPS)[number]

// ── Component ───────────────────────────────────────────────────────────────

export function OnboardingPage() {
  const navigate = useNavigate()
  const { profile, user, refreshProfile } = useAuth()
  const { t, i18n } = useTranslation()

  const [step, setStep] = useState<Step>('welcome')
  const [saving, setSaving] = useState(false)

  // Language
  const [selectedLang, setSelectedLang] = useState(i18n.language?.slice(0, 2) ?? 'en')

  // Location
  const [locationLoading, setLocationLoading] = useState(false)
  const [locationCity, setLocationCity] = useState('')
  const [locationPostcode, setLocationPostcode] = useState('')
  const [locationLat, setLocationLat] = useState<number | null>(null)
  const [locationLng, setLocationLng] = useState<number | null>(null)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [locationDetected, setLocationDetected] = useState(false)

  // Level
  const [levelBranch, setLevelBranch] = useState<'new' | 'playtomic' | 'skip' | null>(null)
  const [playtomicLevel, setPlaytomicLevel] = useState('2.5')

  const stepIndex = STEPS.indexOf(step)

  function goNext() {
    const next = STEPS[stepIndex + 1]
    if (next) setStep(next)
  }
  function goBack() {
    const prev = STEPS[stepIndex - 1]
    if (prev) setStep(prev)
  }

  // ── Handlers ────────────────────────────────────────────────────────────────

  async function handleLanguageContinue() {
    if (!user) return
    setSaving(true)
    setLanguage(selectedLang)
    await supabase.from('profiles').update({ preferred_language: selectedLang }).eq('id', user.id)
    setSaving(false)
    goNext()
  }

  function handleDetectLocation() {
    if (!navigator.geolocation) {
      setLocationError(t('onboarding.location_unavailable'))
      return
    }
    setLocationLoading(true)
    setLocationError(null)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords
        setLocationLat(latitude)
        setLocationLng(longitude)
        const geo = await reverseGeocode(latitude, longitude)
        if (geo.city) setLocationCity(geo.city)
        if (geo.postcode) setLocationPostcode(geo.postcode)
        setLocationDetected(true)
        setLocationLoading(false)
      },
      (err) => {
        setLocationLoading(false)
        if (err.code === err.PERMISSION_DENIED) {
          setLocationError(t('onboarding.location_permission_denied'))
        } else {
          setLocationError(t('onboarding.location_unavailable'))
        }
      },
      { enableHighAccuracy: false, timeout: 10000 },
    )
  }

  async function handleLocationContinue() {
    if (!user) return
    setSaving(true)
    await supabase.from('profiles').update({
      city: locationCity.trim() || null,
      postal_code: locationPostcode.trim() || null,
      latitude: locationLat,
      longitude: locationLng,
    }).eq('id', user.id)
    setSaving(false)
    goNext()
  }

  async function handleLevelContinue() {
    if (!user) return
    setSaving(true)
    if (levelBranch === 'playtomic') {
      const parsed = parseFloat(playtomicLevel)
      const elo = isNaN(parsed) ? 1230 : playtomicToElo(parsed)
      await supabase.from('profiles').update({
        internal_ranking: elo,
        is_provisional: true,
        playtomic_level: isNaN(parsed) ? null : parsed,
      }).eq('id', user.id)
    } else {
      await supabase.from('profiles').update({
        internal_ranking: 1230,
        is_provisional: true,
        playtomic_level: null,
      }).eq('id', user.id)
    }
    setSaving(false)
    goNext()
  }

  async function handleFinish() {
    if (!user) { navigate('/home', { replace: true }); return }
    setSaving(true)
    await markOnboardingComplete(user.id)
    await refreshProfile()
    setSaving(false)
    navigate('/home', { replace: true })
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const currentLangName = LANG_OPTIONS.find(l => l.code === selectedLang)?.label ?? 'English'

  return (
    <div className="min-h-full bg-white flex flex-col">
      {/* Progress dots */}
      <div className="flex gap-1.5 px-5 pt-14 pb-4 justify-center">
        {STEPS.map((s, i) => (
          <div
            key={s}
            className={`h-2 w-2 rounded-full transition-colors ${i <= stepIndex ? 'bg-[#009688]' : 'bg-gray-200'}`}
          />
        ))}
      </div>

      <div className="flex-1 px-6 flex flex-col overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.2 }}
            className="flex-1 flex flex-col"
          >
            {/* ═══ WELCOME ═══ */}
            {step === 'welcome' && (
              <>
                <div className="flex justify-center mb-6 mt-8">
                  <div className="h-20 w-20 rounded-3xl bg-teal-50 flex items-center justify-center text-4xl">🎾</div>
                </div>
                <h1 className="text-[24px] font-bold text-gray-900 text-center mb-2">
                  {t('onboarding.welcome_title', { name: profile?.name?.split(' ')[0] ?? '' })}
                </h1>
                <p className="text-[14px] text-gray-500 text-center mb-8">{t('onboarding.welcome_subtitle')}</p>
              </>
            )}

            {/* ═══ LANGUAGE ═══ */}
            {step === 'language' && (
              <>
                <h1 className="text-[24px] font-bold text-gray-900 text-center mb-2 mt-8">{t('onboarding.language_title')}</h1>
                <p className="text-[14px] text-gray-500 text-center mb-6">
                  {t('onboarding.language_subtitle', { language: currentLangName })}
                </p>
                <div className="space-y-2">
                  {LANG_OPTIONS.map(({ code, flag, label }) => (
                    <button
                      key={code}
                      onClick={() => { setSelectedLang(code); setLanguage(code) }}
                      className={`w-full flex items-center gap-3 rounded-2xl border-2 px-4 py-3.5 text-left transition-colors ${
                        selectedLang === code
                          ? 'border-[#009688] bg-teal-50'
                          : 'border-gray-100 bg-white'
                      }`}
                    >
                      <span className="text-2xl">{flag}</span>
                      <span className="text-[15px] font-semibold text-gray-800">{label}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* ═══ LOCATION ═══ */}
            {step === 'location' && (
              <>
                <div className="flex justify-center mb-6 mt-6">
                  <div className="h-16 w-16 rounded-2xl bg-teal-50 flex items-center justify-center">
                    <MapPin className="h-7 w-7 text-[#009688]" />
                  </div>
                </div>
                <h1 className="text-[24px] font-bold text-gray-900 text-center mb-2">{t('onboarding.location_title')}</h1>
                <p className="text-[14px] text-gray-500 text-center mb-6">{t('onboarding.location_subtitle')}</p>

                {!locationDetected && (
                  <button
                    onClick={handleDetectLocation}
                    disabled={locationLoading}
                    className="w-full rounded-2xl border-2 border-[#009688] bg-teal-50 py-3.5 text-[14px] font-semibold text-[#009688] mb-4 disabled:opacity-50"
                  >
                    {locationLoading ? t('onboarding.saving') : t('onboarding.location_use_my_location')}
                  </button>
                )}

                {locationDetected && locationCity && (
                  <div className="rounded-2xl bg-teal-50 border border-teal-200 px-4 py-3 mb-4">
                    <p className="text-[13px] text-teal-800 font-medium">{t('onboarding.location_detected', { city: locationCity })}</p>
                    <p className="text-[12px] text-teal-600 mt-0.5">{t('onboarding.location_detected_change')}</p>
                  </div>
                )}

                {locationError && (
                  <p className="text-[12px] text-amber-700 bg-amber-50 rounded-xl px-3 py-2 mb-4">{locationError}</p>
                )}

                <div className="space-y-3">
                  <div>
                    <label className="block text-[12px] font-medium text-gray-700 mb-1">{t('onboarding.location_manual_city_label')}</label>
                    <input
                      type="text"
                      value={locationCity}
                      onChange={(e) => setLocationCity(e.target.value)}
                      placeholder={t('onboarding.location_manual_city_placeholder')}
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 text-[15px] outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-gray-700 mb-1">{t('onboarding.location_manual_postcode_label')}</label>
                    <input
                      type="text"
                      value={locationPostcode}
                      onChange={(e) => setLocationPostcode(e.target.value.toUpperCase())}
                      placeholder={t('onboarding.location_manual_postcode_placeholder')}
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 text-[15px] outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
                    />
                  </div>
                </div>
              </>
            )}

            {/* ═══ LEVEL ═══ */}
            {step === 'level' && (
              <>
                <h1 className="text-[24px] font-bold text-gray-900 text-center mb-2 mt-6">{t('onboarding.level_title')}</h1>
                <p className="text-[14px] text-gray-500 text-center mb-6">{t('onboarding.level_subtitle')}</p>

                <div className="space-y-2">
                  {([
                    { key: 'new' as const, title: t('onboarding.level_branch_new'), desc: t('onboarding.level_branch_new_desc') },
                    { key: 'playtomic' as const, title: t('onboarding.level_branch_playtomic'), desc: t('onboarding.level_branch_playtomic_desc') },
                    { key: 'skip' as const, title: t('onboarding.level_branch_skip'), desc: t('onboarding.level_branch_skip_desc') },
                  ]).map(opt => (
                    <button
                      key={opt.key}
                      onClick={() => setLevelBranch(opt.key)}
                      className={`w-full rounded-2xl border-2 px-4 py-3.5 text-left transition-colors ${
                        levelBranch === opt.key ? 'border-[#009688] bg-teal-50' : 'border-gray-100 bg-white'
                      }`}
                    >
                      <p className="text-[14px] font-semibold text-gray-800">{opt.title}</p>
                      <p className="text-[12px] text-gray-500 mt-0.5">{opt.desc}</p>
                    </button>
                  ))}
                </div>

                {levelBranch === 'playtomic' && (
                  <div className="mt-4 rounded-2xl border border-gray-100 bg-gray-50 p-4">
                    <label className="block text-[12px] font-medium text-gray-700 mb-2">{t('onboarding.level_playtomic_label')}</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      max="7"
                      value={playtomicLevel}
                      onChange={(e) => setPlaytomicLevel(e.target.value)}
                      placeholder={t('onboarding.level_playtomic_placeholder')}
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 text-[15px] bg-white outline-none focus:border-teal-500"
                    />
                    <p className="text-[11px] text-gray-400 mt-1">{t('onboarding.level_playtomic_help')}</p>
                    {playtomicLevel && !isNaN(parseFloat(playtomicLevel)) && (
                      <p className="text-[12px] text-teal-700 mt-2">
                        {t('onboarding.level_playtomic_estimate', {
                          rating: playtomicToElo(parseFloat(playtomicLevel)),
                          level: playtomicLevel,
                        })}
                      </p>
                    )}
                  </div>
                )}
              </>
            )}

            {/* ═══ TOUR ═══ */}
            {step === 'tour' && (
              <>
                <h1 className="text-[24px] font-bold text-gray-900 text-center mb-2 mt-6">{t('onboarding.tour_title')}</h1>
                <p className="text-[14px] text-gray-500 text-center mb-5">{t('onboarding.tour_subtitle')}</p>

                <div className="space-y-3 flex-1 overflow-y-auto">
                  {([
                    { icon: <Calendar className="h-5 w-5 text-[#009688]" />, titleKey: 'onboarding.tour_card1_title', descKey: 'onboarding.tour_card1_desc' },
                    { icon: <TrendingUp className="h-5 w-5 text-[#009688]" />, titleKey: 'onboarding.tour_card2_title', descKey: 'onboarding.tour_card2_desc' },
                    { icon: <Users className="h-5 w-5 text-[#009688]" />, titleKey: 'onboarding.tour_card3_title', descKey: 'onboarding.tour_card3_desc' },
                    { icon: <Trophy className="h-5 w-5 text-[#009688]" />, titleKey: 'onboarding.tour_card4_title', descKey: 'onboarding.tour_card4_desc' },
                    { icon: <Heart className="h-5 w-5 text-[#009688]" />, titleKey: 'onboarding.tour_card5_title', descKey: 'onboarding.tour_card5_desc' },
                  ]).map(card => (
                    <div key={card.titleKey} className="flex items-start gap-3 rounded-2xl border border-gray-100 bg-white px-4 py-3">
                      <div className="h-10 w-10 rounded-xl bg-teal-50 flex items-center justify-center flex-shrink-0">
                        {card.icon}
                      </div>
                      <div>
                        <p className="text-[13px] font-bold text-gray-800">{t(card.titleKey)}</p>
                        <p className="text-[12px] text-gray-500 mt-0.5">{t(card.descKey)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* ═══ NOTIFICATIONS ═══ */}
            {step === 'notifications' && (
              <>
                <div className="flex justify-center mb-6 mt-8">
                  <div className="h-20 w-20 rounded-3xl bg-teal-50 flex items-center justify-center">
                    <Bell className="h-10 w-10 text-[#009688]" />
                  </div>
                </div>
                <h1 className="text-[24px] font-bold text-gray-900 text-center mb-2">
                  {t('onboarding.notifications_title')}
                </h1>
                <p className="text-[14px] text-gray-500 text-center mb-6">
                  {t('onboarding.notifications_subtitle')}
                </p>
                <div className="space-y-2">
                  {[
                    t('onboarding.notifications_benefit1'),
                    t('onboarding.notifications_benefit2'),
                    t('onboarding.notifications_benefit3'),
                  ].map((text) => (
                    <div key={text} className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white px-4 py-3">
                      <span className="text-[#009688] text-lg">✓</span>
                      <span className="text-[13px] text-gray-700">{text}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Footer actions */}
      <div className="px-6 pb-10 space-y-3" style={{ paddingBottom: 'calc(40px + env(safe-area-inset-bottom))' }}>
        {step === 'welcome' && (
          <>
            <button onClick={goNext} className="w-full flex items-center justify-center gap-2 rounded-2xl bg-[#009688] py-4 text-[15px] font-bold text-white">
              {t('onboarding.welcome_continue')}
              <ChevronRight className="h-5 w-5" />
            </button>
            <p className="text-[11px] text-gray-400 text-center mt-2">
              {t('onboarding.welcome_legal_prefix')}{' '}
              <Link to="/terms" className="underline hover:no-underline">
                {t('auth.terms_link')}
              </Link>
              {' '}{t('auth.and')}{' '}
              <Link to="/privacy" className="underline hover:no-underline">
                {t('auth.privacy_link')}
              </Link>
            </p>
          </>
        )}

        {step === 'language' && (
          <>
            <button onClick={handleLanguageContinue} disabled={saving} className="w-full flex items-center justify-center gap-2 rounded-2xl bg-[#009688] py-4 text-[15px] font-bold text-white disabled:opacity-40">
              {saving ? t('onboarding.saving') : t('onboarding.language_continue')}
              <ChevronRight className="h-5 w-5" />
            </button>
            <button onClick={goBack} className="w-full text-center text-[13px] text-gray-400 flex items-center justify-center gap-1">
              <ChevronLeft className="h-4 w-4" /> {t('onboarding.back')}
            </button>
          </>
        )}

        {step === 'location' && (
          <>
            <button onClick={handleLocationContinue} disabled={saving} className="w-full flex items-center justify-center gap-2 rounded-2xl bg-[#009688] py-4 text-[15px] font-bold text-white disabled:opacity-40">
              {saving ? t('onboarding.saving') : t('onboarding.location_continue')}
              <ChevronRight className="h-5 w-5" />
            </button>
            <button onClick={goNext} className="w-full text-center text-[13px] text-gray-400">
              {t('onboarding.location_skip')}
            </button>
            <button onClick={goBack} className="w-full text-center text-[13px] text-gray-400 flex items-center justify-center gap-1">
              <ChevronLeft className="h-4 w-4" /> {t('onboarding.back')}
            </button>
          </>
        )}

        {step === 'level' && (
          <>
            <button
              onClick={handleLevelContinue}
              disabled={saving || !levelBranch}
              className="w-full flex items-center justify-center gap-2 rounded-2xl bg-[#009688] py-4 text-[15px] font-bold text-white disabled:opacity-40"
            >
              {saving ? t('onboarding.saving') : t('onboarding.level_continue')}
              <ChevronRight className="h-5 w-5" />
            </button>
            <button onClick={goBack} className="w-full text-center text-[13px] text-gray-400 flex items-center justify-center gap-1">
              <ChevronLeft className="h-4 w-4" /> {t('onboarding.back')}
            </button>
          </>
        )}

        {step === 'tour' && (
          <button
            onClick={() => {
              // Skip notifications step if push not supported or already decided
              const shouldShowPushPrompt = isPushSupported()
                && typeof Notification !== 'undefined'
                && Notification.permission === 'default'
              if (shouldShowPushPrompt) {
                goNext()
              } else {
                handleFinish()
              }
            }}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 rounded-2xl bg-[#009688] py-4 text-[15px] font-bold text-white disabled:opacity-40"
          >
            {saving ? t('onboarding.saving') : t('onboarding.tour_finish')}
          </button>
        )}

        {step === 'notifications' && (
          <>
            <button
              onClick={async () => {
                if (user) {
                  // Opt in: clear the DB flag (default is false, but be explicit)
                  await supabase.from('profiles').update({ push_opted_out: false }).eq('id', user.id)
                  await subscribeToPush(user.id)
                }
                await handleFinish()
              }}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 rounded-2xl bg-[#009688] py-4 text-[15px] font-bold text-white disabled:opacity-40"
            >
              {saving ? t('onboarding.saving') : t('onboarding.notifications_enable')}
            </button>
            <button
              onClick={async () => {
                // User declined — set push_opted_out so OneSignal is also suppressed
                if (user) {
                  await supabase.from('profiles').update({ push_opted_out: true }).eq('id', user.id)
                }
                await handleFinish()
              }}
              disabled={saving}
              className="w-full text-center text-[13px] text-gray-400"
            >
              {t('onboarding.notifications_skip')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
