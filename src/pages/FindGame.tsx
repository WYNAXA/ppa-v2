/**
 * §4 Path B — "I want to play."
 *
 * Three steps: WHEN → WHO → WHERE.
 * The output is a match with a time, players, and either a booked court
 * (tier 1) or a claim ready for Path A (tier 2/3).
 *
 * Rules:
 *   - The time filter filters on OPEN, never implies FREE.
 *   - tier 1 → real slots, real prices, book in app
 *   - tier 2/3 → "Open 07:00–22:00 Thursday · check times on <platform>"
 *   - No slot grids, no "probably free", no count of courts we do not have (§6.1, §6.2)
 *   - Reuses CourtsHome in match-context mode. No second list.
 */
import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { addDays, format, startOfDay } from 'date-fns'
import { ChevronLeft, ChevronRight, Calendar, Clock, Users, MapPin } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useDateLocale } from '@/lib/dateLocale'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useMyGroups } from '@/hooks/useSocial'
import { PlayerAvatar } from '@/components/shared/PlayerAvatar'
import { CourtsHome } from '@/components/play/CourtsHome'
import { cn } from '@/lib/utils'
import { goBack } from '@/lib/navigation'

// ── Time windows ────────────────────────────────────────────────────────────

const TIME_WINDOWS = [
  { key: 'morning',   label: 'Morning',   from: '06:00', to: '12:00' },
  { key: 'afternoon', label: 'Afternoon', from: '12:00', to: '17:00' },
  { key: 'evening',   label: 'Evening',   from: '17:00', to: '22:00' },
  { key: 'any',       label: 'Any time',  from: '00:00', to: '23:59' },
] as const

type WindowKey = typeof TIME_WINDOWS[number]['key']

// ── Component ───────────────────────────────────────────────────────────────

export default function FindGame() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const locale = useDateLocale()
  const { user, session, profile } = useAuth()
  const userId = user?.id ?? ''

  // ── Step ──────────────────────────────────────────────────────────────────
  const [step, setStep] = useState<'when' | 'who' | 'where'>('when')

  // ── WHEN state ────────────────────────────────────────────────────────────
  const today = startOfDay(new Date())
  const dayOptions = useMemo(() => {
    const days = []
    for (let i = 0; i < 14; i++) {
      const d = addDays(today, i)
      days.push(d)
    }
    return days
  }, [today.getTime()])

  const [selectedDate, setSelectedDate] = useState<Date>(today)
  const [selectedWindow, setSelectedWindow] = useState<WindowKey>('evening')

  // ── WHO state ─────────────────────────────────────────────────────────────
  const { data: myGroups = [] } = useMyGroups(userId)
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([])

  // ── WHERE state ───────────────────────────────────────────────────────────
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [locating, setLocating] = useState(false)
  const [venueQuery, setVenueQuery] = useState('')
  const [creatingMatch, setCreatingMatch] = useState(false)

  // Seed coords from session cache
  useEffect(() => {
    const cached = sessionStorage.getItem('ppa_user_coords')
    if (cached) { try { setCoords(JSON.parse(cached)) } catch { /* ignore */ } }
  }, [])

  function requestLocation() {
    if (!('geolocation' in navigator)) { toast.error('Location not available.'); return }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setCoords(c)
        sessionStorage.setItem('ppa_user_coords', JSON.stringify(c))
        setLocating(false)
      },
      () => { toast.error('Could not get location.'); setLocating(false) },
      { enableHighAccuracy: true, timeout: 10_000 },
    )
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const window = TIME_WINDOWS.find(w => w.key === selectedWindow)!
  const dateStr = format(selectedDate, 'yyyy-MM-dd')
  const dayLabel = format(selectedDate, 'EEEE', { locale })

  // Members of the selected group (for the WHO step)
  const selectedGroup = myGroups.find(g => g.id === selectedGroupId)

  // ── Create match and navigate to venue selection ──────────────────────────
  async function handleCreateMatch() {
    if (!userId) return
    setCreatingMatch(true)

    const playerIds = [userId, ...selectedPlayers]
    const matchTime = selectedWindow === 'any' ? null : window.from

    const { data: match, error } = await supabase
      .from('matches')
      .insert({
        match_date: dateStr,
        match_time: matchTime ? `${matchTime}:00` : null,
        match_type: 'casual',
        status: playerIds.length >= 4 ? 'scheduled' : 'pending',
        player_ids: playerIds,
        group_id: selectedGroupId,
        context_type: selectedGroupId ? 'group' : 'open',
        booking_status: 'not_booked',
        court_requirement: 'needed',
        created_by: userId,
        created_manually: true,
      })
      .select('id')
      .single()

    setCreatingMatch(false)

    if (error || !match) {
      toast.error('Could not create the game. Try again.')
      return
    }

    // Navigate to BookCourt with the match, so the player lands in the
    // CourtsHome tiered list (Path A: a game needs a court).
    navigate(`/play/book-court?match_id=${match.id}&date=${dateStr}`)
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-background/90 backdrop-blur-md border-b border-hairline">
        <div className="flex items-center gap-3 px-5 py-3">
          <button
            onClick={() => {
              if (step === 'where') setStep('who')
              else if (step === 'who') setStep('when')
              else goBack(navigate)
            }}
            className="h-9 w-9 rounded-full bg-surface flex items-center justify-center active:scale-90 transition-transform"
          >
            <ChevronLeft className="h-5 w-5 text-ink" />
          </button>
          <h1 className="text-[17px] font-bold text-ink">
            {step === 'when' ? t('find_game.when_title', { defaultValue: 'When do you want to play?' })
              : step === 'who' ? t('find_game.who_title', { defaultValue: 'Who\'s playing?' })
              : t('find_game.where_title', { defaultValue: 'Find a court' })}
          </h1>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {/* ── STEP 1: WHEN ─────────────────────────────────────────────── */}
        {step === 'when' && (
          <motion.div
            key="when"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.2 }}
            className="px-5 pt-6 pb-32 space-y-6"
          >
            {/* Day picker */}
            <div>
              <p className="text-[13px] font-semibold text-ink-2 mb-3 flex items-center gap-1.5">
                <Calendar className="h-4 w-4" /> Pick a day
              </p>
              <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
                {dayOptions.map((d, i) => {
                  const isSelected = format(d, 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd')
                  const isToday = i === 0
                  return (
                    <button
                      key={i}
                      onClick={() => setSelectedDate(d)}
                      className={cn(
                        'flex flex-col items-center gap-0.5 rounded-xl px-3 py-2 min-w-[52px] text-center transition-all active:scale-95',
                        isSelected
                          ? 'bg-court text-white shadow-sm'
                          : 'bg-surface border border-hairline text-ink-2 hover:border-court-100',
                      )}
                    >
                      <span className="text-[10px] font-semibold uppercase">
                        {isToday ? 'Today' : format(d, 'EEE', { locale })}
                      </span>
                      <span className="text-[15px] font-bold">{format(d, 'd')}</span>
                      <span className="text-[10px]">{format(d, 'MMM', { locale })}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Time window */}
            <div>
              <p className="text-[13px] font-semibold text-ink-2 mb-3 flex items-center gap-1.5">
                <Clock className="h-4 w-4" /> What time?
              </p>
              <div className="grid grid-cols-4 gap-2">
                {TIME_WINDOWS.map(w => (
                  <button
                    key={w.key}
                    onClick={() => setSelectedWindow(w.key)}
                    className={cn(
                      'rounded-xl py-3 text-[13px] font-semibold transition-all active:scale-95',
                      selectedWindow === w.key
                        ? 'bg-court text-white shadow-sm'
                        : 'bg-surface border border-hairline text-ink-2 hover:border-court-100',
                    )}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Continue */}
            <button
              onClick={() => setStep('who')}
              className="w-full rounded-2xl bg-court py-4 text-[15px] font-bold text-white flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
            >
              Next — who's playing? <ChevronRight className="h-4 w-4" />
            </button>
          </motion.div>
        )}

        {/* ── STEP 2: WHO ──────────────────────────────────────────────── */}
        {step === 'who' && (
          <motion.div
            key="who"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.2 }}
            className="px-5 pt-6 pb-32 space-y-6"
          >
            {/* Summary of WHEN */}
            <div className="rounded-xl bg-surface border border-hairline px-4 py-3 flex items-center gap-3">
              <Calendar className="h-4 w-4 text-court flex-shrink-0" />
              <span className="text-[13px] font-semibold text-ink">
                {dayLabel} {selectedWindow !== 'any' ? `${window.label.toLowerCase()} (${window.from}–${window.to})` : 'any time'}
              </span>
            </div>

            {/* Groups */}
            {myGroups.length > 0 && (
              <div>
                <p className="text-[13px] font-semibold text-ink-2 mb-3 flex items-center gap-1.5">
                  <Users className="h-4 w-4" /> Your groups
                </p>
                <div className="space-y-2">
                  {myGroups.map(g => (
                    <button
                      key={g.id}
                      onClick={() => {
                        if (selectedGroupId === g.id) {
                          setSelectedGroupId(null)
                          setSelectedPlayers([])
                        } else {
                          setSelectedGroupId(g.id)
                          // Pre-select all members
                          setSelectedPlayers(
                            g.members?.filter(m => m.id !== userId).map(m => m.id) ?? []
                          )
                        }
                      }}
                      className={cn(
                        'w-full flex items-center gap-3 rounded-xl px-4 py-3 transition-all active:scale-[0.98]',
                        selectedGroupId === g.id
                          ? 'bg-court-50 border-2 border-court'
                          : 'bg-surface border border-hairline hover:border-court-100',
                      )}
                    >
                      <div className="flex -space-x-2">
                        {(g.members ?? []).slice(0, 4).map(m => (
                          <PlayerAvatar key={m.id} name={m.name} url={m.avatar_url} size={28} />
                        ))}
                      </div>
                      <div className="text-left flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-ink truncate">{g.name}</p>
                        <p className="text-[11px] text-ink-2">{g.members?.length ?? 0} members</p>
                      </div>
                      {selectedGroupId === g.id && (
                        <span className="text-[11px] font-bold text-court bg-court-100 rounded-full px-2 py-0.5">
                          Selected
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* No groups */}
            {myGroups.length === 0 && (
              <div className="rounded-xl bg-surface border border-hairline p-6 text-center">
                <Users className="h-8 w-8 text-ink-3 mx-auto mb-2" />
                <p className="text-[13px] font-semibold text-ink-2">No groups yet</p>
                <p className="text-[12px] text-ink-3 mt-1">Create a group to play with your regulars.</p>
              </div>
            )}

            {/* Selected players from group */}
            {selectedGroup && selectedGroup.members && selectedGroup.members.length > 1 && (
              <div>
                <p className="text-[13px] font-semibold text-ink-2 mb-2">
                  {selectedPlayers.length + 1} playing (including you)
                </p>
                <div className="flex flex-wrap gap-2">
                  {selectedGroup.members
                    .filter(m => m.id !== userId)
                    .map(m => {
                      const selected = selectedPlayers.includes(m.id)
                      return (
                        <button
                          key={m.id}
                          onClick={() => {
                            setSelectedPlayers(prev =>
                              selected ? prev.filter(id => id !== m.id) : [...prev, m.id]
                            )
                          }}
                          className={cn(
                            'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-all active:scale-95',
                            selected
                              ? 'bg-court-100 text-court-700'
                              : 'bg-surface border border-hairline text-ink-3',
                          )}
                        >
                          <PlayerAvatar name={m.name} url={m.avatar_url} size={20} />
                          {m.name?.split(' ')[0] ?? 'Player'}
                        </button>
                      )
                    })}
                </div>
              </div>
            )}

            {/* Continue to WHERE */}
            <button
              onClick={() => setStep('where')}
              className="w-full rounded-2xl bg-court py-4 text-[15px] font-bold text-white flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
            >
              Next — find a court <MapPin className="h-4 w-4" />
            </button>

            {/* Skip */}
            <button
              onClick={() => setStep('where')}
              className="w-full text-center text-[13px] text-ink-2 font-semibold py-2"
            >
              Skip — just me for now
            </button>
          </motion.div>
        )}

        {/* ── STEP 3: WHERE ────────────────────────────────────────────── */}
        {step === 'where' && (
          <motion.div
            key="where"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.2 }}
            className="pt-2 pb-32"
          >
            {/* Summary */}
            <div className="px-5 mb-4">
              <div className="rounded-xl bg-surface border border-hairline px-4 py-3 flex items-center gap-3">
                <Calendar className="h-4 w-4 text-court flex-shrink-0" />
                <span className="text-[13px] text-ink">
                  {dayLabel} {selectedWindow !== 'any' ? window.label.toLowerCase() : 'any time'}
                  {selectedPlayers.length > 0 && ` · ${selectedPlayers.length + 1} players`}
                </span>
              </div>
            </div>

            {/* Create match and go to BookCourt */}
            <div className="px-5 mb-4">
              <button
                onClick={handleCreateMatch}
                disabled={creatingMatch}
                className="w-full rounded-2xl bg-court py-4 text-[15px] font-bold text-white flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-50"
              >
                {creatingMatch ? 'Creating…' : 'Create game & find a court'}
              </button>
            </div>

            {/* CourtsHome for browsing — reuse the same component */}
            <CourtsHome
              lat={coords?.lat ?? null}
              lng={coords?.lng ?? null}
              query={venueQuery}
              onQueryChange={setVenueQuery}
              onUseLocation={requestLocation}
              locating={locating}
              onPickVenue={(venueId) => {
                // Create the match, then navigate to BookCourt with this venue pre-selected
                if (!userId) return
                const playerIds = [userId, ...selectedPlayers]
                const matchTime = selectedWindow === 'any' ? null : window.from

                supabase
                  .from('matches')
                  .insert({
                    match_date: dateStr,
                    match_time: matchTime ? `${matchTime}:00` : null,
                    match_type: 'casual',
                    status: playerIds.length >= 4 ? 'scheduled' : 'pending',
                    player_ids: playerIds,
                    group_id: selectedGroupId,
                    context_type: selectedGroupId ? 'group' : 'open',
                    booking_status: 'not_booked',
                    court_requirement: 'needed',
                    created_by: userId,
                    created_manually: true,
                  })
                  .select('id')
                  .single()
                  .then(({ data: match }) => {
                    if (match) {
                      navigate(`/play/book-court?match_id=${match.id}&venue=${venueId}&date=${dateStr}`)
                    }
                  })
              }}
              matchGroupId={selectedGroupId}
              isMatchMode
              targetDayKey={format(selectedDate, 'EEEE').toLowerCase()}
              targetTime={selectedWindow === 'any' ? undefined : window.from}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
