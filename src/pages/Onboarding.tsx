import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronRight, MapPin, Users, Search, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

const ONBOARDING_KEY = 'ppa_onboarding_complete'

export function useOnboardingRequired(): boolean {
  const { profile } = useAuth()
  if (!profile) return false
  if (localStorage.getItem(ONBOARDING_KEY) === 'true') return false
  // Require onboarding if name looks auto-generated (= email prefix or "Player")
  const name = profile.name ?? ''
  if (!name || name === 'Player' || !name.includes(' ') === false) {
    // If name has no space it might be auto-set — but we don't want to block everyone
    // Only show onboarding once per session based on localStorage flag
  }
  return false // Controlled externally by the flow below
}

export function markOnboardingComplete() {
  localStorage.setItem(ONBOARDING_KEY, 'true')
}

export function isOnboardingComplete(): boolean {
  return localStorage.getItem(ONBOARDING_KEY) === 'true'
}

interface Group { id: string; name: string; city: string | null; member_count?: number }

function useDebounce<T>(value: T, delay: number) {
  const [dv, setDv] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDv(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return dv
}

export function OnboardingPage() {
  const navigate          = useNavigate()
  const { profile, user } = useAuth()
  const [step, setStep]   = useState(0)
  const [name, setName]   = useState(profile?.name ?? '')
  const [city, setCity]   = useState(profile?.city ?? '')
  const [postcode, setPostcode] = useState('')
  const [groupQuery, setGroupQuery] = useState('')
  const [groups, setGroups]         = useState<Group[]>([])
  const [joinedGroups, setJoinedGroups] = useState<Group[]>([])
  const [saving, setSaving]         = useState(false)
  const debouncedGroupQ = useDebounce(groupQuery, 300)

  // Fetch top groups on step 2
  useEffect(() => {
    if (step !== 2) return
    const fetchGroups = async () => {
      const query = debouncedGroupQ.length >= 2
        ? supabase.from('groups').select('id, name, city').ilike('name', `%${debouncedGroupQ}%`).limit(5)
        : supabase.from('groups').select('id, name, city').order('created_at', { ascending: false }).limit(5)
      const { data } = await query
      setGroups(data ?? [])
    }
    fetchGroups()
  }, [step, debouncedGroupQ])

  async function saveStep1() {
    if (!name.trim() || !user) return
    setSaving(true)
    await supabase.from('profiles').update({ name: name.trim() }).eq('id', user.id)
    setSaving(false)
    setStep(1)
  }

  async function saveStep2() {
    if (!user) return
    setSaving(true)
    await supabase.from('profiles').update({
      city: city.trim() || null,
    }).eq('id', user.id)
    setSaving(false)
    setStep(2)
  }

  async function finishOnboarding() {
    if (!user) return
    setSaving(true)
    // Join selected groups
    for (const g of joinedGroups) {
      await supabase.from('group_members').upsert(
        { group_id: g.id, user_id: user.id, status: 'approved' },
        { onConflict: 'group_id,user_id' }
      )
    }
    markOnboardingComplete()
    setSaving(false)
    navigate('/home', { replace: true })
  }

  function skipOnboarding() {
    markOnboardingComplete()
    navigate('/home', { replace: true })
  }

  function toggleGroup(g: Group) {
    setJoinedGroups((prev) =>
      prev.find((x) => x.id === g.id)
        ? prev.filter((x) => x.id !== g.id)
        : [...prev, g]
    )
  }

  const steps = [
    {
      title:    'Welcome to Padel Players',
      subtitle: "Let's set up your profile",
      icon:     '🎾',
    },
    {
      title:    'Where do you play?',
      subtitle: 'This helps find local groups and venues',
      icon:     <MapPin className="h-8 w-8 text-[#009688]" />,
    },
    {
      title:    'Find your group',
      subtitle: 'Join your padel group to get started',
      icon:     <Users className="h-8 w-8 text-[#009688]" />,
    },
  ]

  const current = steps[step]

  return (
    <div className="min-h-full bg-white flex flex-col">
      {/* Progress bar */}
      <div className="flex gap-1.5 px-5 pt-14 pb-4">
        {steps.map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? 'bg-[#009688]' : 'bg-gray-200'}`}
          />
        ))}
      </div>

      <div className="flex-1 px-6 flex flex-col">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.2 }}
            className="flex-1 flex flex-col"
          >
            {/* Icon */}
            <div className="flex justify-center mb-6 mt-6">
              <div className="h-20 w-20 rounded-3xl bg-teal-50 flex items-center justify-center text-4xl">
                {typeof current.icon === 'string' ? current.icon : current.icon}
              </div>
            </div>

            <h1 className="text-[24px] font-bold text-gray-900 text-center mb-2 leading-tight">
              {current.title}
            </h1>
            <p className="text-[14px] text-gray-500 text-center mb-8">{current.subtitle}</p>

            {/* Step 0 — Name */}
            {step === 0 && (
              <div className="space-y-4">
                <div>
                  <label className="block text-[13px] font-medium text-gray-700 mb-1.5">Your name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter your full name"
                    autoFocus
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-[15px] outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
                  />
                </div>
              </div>
            )}

            {/* Step 1 — Location */}
            {step === 1 && (
              <div className="space-y-4">
                <div>
                  <label className="block text-[13px] font-medium text-gray-700 mb-1.5">City</label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="e.g. London"
                    autoFocus
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-[15px] outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
                  />
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-gray-700 mb-1.5">Postcode</label>
                  <input
                    type="text"
                    value={postcode}
                    onChange={(e) => setPostcode(e.target.value.toUpperCase())}
                    placeholder="e.g. SW1A 1AA"
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-[15px] outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
                  />
                </div>
              </div>
            )}

            {/* Step 2 — Find group */}
            {step === 2 && (
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    value={groupQuery}
                    onChange={(e) => setGroupQuery(e.target.value)}
                    placeholder="Search groups by name or city…"
                    className="w-full rounded-xl border border-gray-200 pl-9 pr-4 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
                  />
                </div>

                {joinedGroups.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {joinedGroups.map((g) => (
                      <span key={g.id} className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 border border-teal-200 px-3 py-1 text-[12px] font-semibold text-teal-700">
                        {g.name}
                        <button onClick={() => toggleGroup(g)}><X className="h-3 w-3" /></button>
                      </span>
                    ))}
                  </div>
                )}

                <div className="space-y-1">
                  {groups.map((g) => {
                    const joined = !!joinedGroups.find((x) => x.id === g.id)
                    return (
                      <button
                        key={g.id}
                        onClick={() => toggleGroup(g)}
                        className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl border transition-colors text-left ${
                          joined
                            ? 'border-[#009688] bg-teal-50'
                            : 'border-gray-100 bg-white hover:border-teal-200'
                        }`}
                      >
                        <div className="h-9 w-9 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                          <Users className="h-4 w-4 text-blue-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold text-gray-800 truncate">{g.name}</p>
                          {g.city && <p className="text-[11px] text-gray-400">{g.city}</p>}
                        </div>
                        {joined && (
                          <span className="text-[10px] font-bold text-[#009688] bg-teal-100 px-2 py-0.5 rounded-full">Joined</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Footer actions */}
      <div
        className="px-6 pb-10 space-y-3"
        style={{ paddingBottom: 'calc(40px + env(safe-area-inset-bottom))' }}
      >
        {step === 0 && (
          <button
            onClick={saveStep1}
            disabled={!name.trim() || saving}
            className="w-full flex items-center justify-center gap-2 rounded-2xl bg-[#009688] py-4 text-[15px] font-bold text-white disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Continue'}
            <ChevronRight className="h-5 w-5" />
          </button>
        )}

        {step === 1 && (
          <>
            <button
              onClick={saveStep2}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 rounded-2xl bg-[#009688] py-4 text-[15px] font-bold text-white disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Continue'}
              <ChevronRight className="h-5 w-5" />
            </button>
            <button onClick={() => setStep(2)} className="w-full text-center text-[13px] text-gray-400">
              Skip for now
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <button
              onClick={finishOnboarding}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 rounded-2xl bg-[#009688] py-4 text-[15px] font-bold text-white disabled:opacity-40"
            >
              {saving ? 'Setting up…' : joinedGroups.length > 0 ? `Join ${joinedGroups.length} group${joinedGroups.length > 1 ? 's' : ''} & Continue` : 'Get Started'}
            </button>
            <button onClick={skipOnboarding} className="w-full text-center text-[13px] text-gray-400">
              Skip for now
            </button>
          </>
        )}
      </div>
    </div>
  )
}
