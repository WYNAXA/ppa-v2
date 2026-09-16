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
import { useMyGroups, useGroupMembers, useMyConnections } from '@/hooks/useSocial'
import { PlayerAvatar } from '@/components/shared/PlayerAvatar'
import { CourtsHome } from '@/components/play/CourtsHome'
import { cn } from '@/lib/utils'
import { goBack } from '@/lib/navigation'

// ── Time windows ────────────────────────────────────────────────────────────

const TIME_WINDOWS = [
  { key: 'morning',   label: 'Morning',   from: '06:00', to: '12:00', defaultTime: '09:00' },
  { key: 'afternoon', label: 'Afternoon', from: '12:00', to: '17:00', defaultTime: '14:00' },
  { key: 'evening',   label: 'Evening',   from: '17:00', to: '22:00', defaultTime: '19:00' },
  { key: 'any',       label: 'Any time',  from: '06:00', to: '23:59', defaultTime: '19:00' },
] as const

type WindowKey = typeof TIME_WINDOWS[number]['key']

// ── Component ───────────────────────────────────────────────────────────────

export default function FindGame() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const locale = useDateLocale()
  const { user } = useAuth()
  const userId = user?.id ?? ''

  // ── Step ──────────────────────────────────────────────────────────────────
  const [step, setStep] = useState<'when' | 'who' | 'where'>(() =>
    (sessionStorage.getItem('fg_step') as 'when' | 'who' | 'where') || 'when'
  )
  useEffect(() => { sessionStorage.setItem('fg_step', step) }, [step])

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

  // M2: persist WHEN/WHO across navigation (venue profile and back, app kill).
  // sessionStorage: survives same-tab navigation, cleared on tab close.
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const saved = sessionStorage.getItem('fg_date')
    if (saved) { try { const d = new Date(saved); if (!isNaN(d.getTime())) return startOfDay(d) } catch { /* ignore */ } }
    return today
  })
  const [selectedWindow, setSelectedWindow] = useState<WindowKey>(() =>
    (sessionStorage.getItem('fg_window') as WindowKey) || 'evening'
  )

  // Persist on change
  useEffect(() => { sessionStorage.setItem('fg_date', selectedDate.toISOString()) }, [selectedDate])
  useEffect(() => { sessionStorage.setItem('fg_window', selectedWindow) }, [selectedWindow])

  // ── WHO state ─────────────────────────────────────────────────────────────
  const { data: myGroups = [] } = useMyGroups(userId)
  const { data: connections } = useMyConnections(userId)
  const connectionProfiles = connections?.acceptedProfiles ?? []
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(() =>
    sessionStorage.getItem('fg_group') || null
  )
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>(() => {
    try { return JSON.parse(sessionStorage.getItem('fg_players') ?? '[]') } catch { return [] }
  })
  useEffect(() => {
    if (selectedGroupId) sessionStorage.setItem('fg_group', selectedGroupId)
    else sessionStorage.removeItem('fg_group')
  }, [selectedGroupId])
  useEffect(() => { sessionStorage.setItem('fg_players', JSON.stringify(selectedPlayers)) }, [selectedPlayers])
  // Full member list for the selected group — fetched on demand, not upfront.
  // recentMembers is .slice(0,5) — a preview for avatars, not a member list.
  const { data: fullMembers = [] } = useGroupMembers(selectedGroupId)

  // L6: default is nobody selected. Asking is opt-in.
  // Reset selection when group changes.
  useEffect(() => {
    setSelectedPlayers([])
  }, [selectedGroupId])

  // "The usual four" — top 3 most frequent co-players from recent group matches.
  // Same window as whose_turn_to_book (last N matches in this group).
  const { data: usualPlayers } = useQuery<string[]>({
    queryKey: ['usual-four', selectedGroupId],
    enabled: !!selectedGroupId,
    staleTime: 60_000,
    queryFn: async () => {
      // Last 20 non-cancelled matches in this group
      const { data: matches } = await supabase
        .from('matches')
        .select('player_ids')
        .eq('group_id', selectedGroupId!)
        .not('status', 'in', '("cancelled")')
        .order('match_date', { ascending: false })
        .limit(20)
      if (!matches || matches.length < 5) return [] // not enough history
      // Count appearances per player, excluding the current user
      const counts = new Map<string, number>()
      for (const m of matches) {
        for (const pid of (m.player_ids ?? []) as string[]) {
          if (pid === userId) continue
          counts.set(pid, (counts.get(pid) ?? 0) + 1)
        }
      }
      // Top 3 by frequency
      return [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([id]) => id)
    },
  })

  // ── WHERE state ───────────────────────────────────────────────────────────
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [locating, setLocating] = useState(false)
  const [venueQuery, setVenueQuery] = useState('')
  const [creatingMatch, setCreatingMatch] = useState(false)

  // M1: Fetch the user's stored profile location — same source as BookCourt.
  // Without this, FindGame had no coordinates and CourtsHome fell back to an
  // unordered global query (200 arbitrary venues, no distance filter).
  const { data: userLocation, isLoading: locationLoading } = useQuery<{ latitude: number | null; longitude: number | null } | null>({
    queryKey: ['my-location-findgame', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('latitude, longitude')
        .eq('id', userId)
        .single()
      return data ?? null
    },
  })

  // Seed coords: session cache first, then profile location
  useEffect(() => {
    const cached = sessionStorage.getItem('ppa_user_coords')
    if (cached) { try { setCoords(JSON.parse(cached)); return } catch { /* ignore */ } }
    if (userLocation?.latitude != null && userLocation?.longitude != null) {
      setCoords({ lat: userLocation.latitude, lng: userLocation.longitude })
    }
  }, [userLocation?.latitude, userLocation?.longitude])

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

  // N8: Server-side open-match filtering via open_matches_for RPC.
  // SECURITY INVOKER — RLS on matches still applies. The RPC handles:
  //   - viewer exclusion (not in player_ids)
  //   - proximity (venue within radius) OR shared group
  //   - reason per row (venue + distance, or group name)
  interface OpenMatch {
    match_id: string; match_time: string | null; venue_name: string | null
    spots_left: number; distance_miles: number | null; reason: string | null
  }
  const { data: openMatches = [] } = useQuery<OpenMatch[]>({
    queryKey: ['open-matches-at-time', dateStr, selectedWindow, coords?.lat, coords?.lng, userId],
    enabled: !!dateStr && !!userId,
    staleTime: 30_000,
    queryFn: async () => {
      const args: Record<string, unknown> = {
        p_user_id: userId,
        p_date: dateStr,
        p_from: selectedWindow !== 'any' ? `${window.from}:00` : null,
        p_to: selectedWindow !== 'any' ? `${window.to}:00` : null,
      }
      if (coords) {
        args.p_lat = coords.lat
        args.p_lng = coords.lng
        args.p_radius_miles = 25
      }
      const { data, error } = await (supabase.rpc as any)('open_matches_for', args) // Workaround: RPC not yet in generated types
      if (error) { console.warn('[FindGame] open_matches_for error:', error); return [] }
      return (data ?? []) as OpenMatch[]
    },
  })

  // ── Create match and navigate to venue selection ──────────────────────────
  // §4: the WHO step picks who to ASK, not who is in the match.
  // player_ids = [userId] only. Everyone else gets a match_invitation.
  // matches_player_ids_check enforces max 4 in player_ids.
  async function handleCreateMatch() {
    if (!userId) return
    setCreatingMatch(true)

    const matchTime = window.defaultTime
    const hasGroup = !!selectedGroupId

    const { data: match, error } = await supabase
      .from('matches')
      .insert({
        match_date: dateStr,
        match_time: `${matchTime}:00`,
        match_type: 'casual',
        status: 'open',
        player_ids: [userId],
        group_id: selectedGroupId,
        context_type: hasGroup ? 'group' : 'open',
        booking_status: 'not_booked',
        court_requirement: 'needed',
        created_by: userId,
        created_manually: true,
        is_open: true,
        opened_by: userId,
        opened_at: new Date().toISOString(),
        open_audience: hasGroup ? 'groups' : 'connections',
      })
      .select('id')
      .single()

    if (error || !match) {
      console.error('[FindGame] match insert failed:', error)
      toast.error(error?.message ?? 'Could not create the game. Try again.')
      setCreatingMatch(false)
      return
    }

    // Send invitations to everyone the user selected in WHO
    if (selectedPlayers.length > 0) {
      const { error: invErr } = await supabase.rpc('send_match_invitations', {
        p_match_id: match.id,
        p_invitee_ids: selectedPlayers,
      })
      if (invErr) console.warn('[FindGame] invitations failed:', invErr)
    }

    setCreatingMatch(false)

    // "I'll sort the court later" — go to Home where the match appears
    // in Needs a Court. The user chose to skip the venue step.
    navigate('/')
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

            {/* N6b: Open matches needing players at this date/time */}
            {openMatches.length > 0 && (
              <div>
                <p className="text-[13px] font-semibold text-ink-2 mb-3">
                  {openMatches.length} {openMatches.length === 1 ? 'game needs' : 'games need'} players on {dayLabel.toLowerCase()} {selectedWindow !== 'any' ? window.label.toLowerCase() : ''}
                </p>
                <div className="space-y-2">
                  {openMatches.map(m => (
                    <button
                      key={m.match_id}
                      onClick={() => navigate(`/matches/${m.match_id}`)}
                      className="w-full flex items-center gap-3 rounded-xl bg-surface border border-hairline px-4 py-3 text-left active:scale-[0.98] transition-transform"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-ink truncate">
                          {m.match_time?.slice(0, 5) ?? ''}{m.venue_name ? ` · ${m.venue_name}` : ''}
                        </p>
                        <p className="text-[11px] text-ink-2">
                          {m.spots_left} {m.spots_left === 1 ? 'spot' : 'spots'} left{m.reason ? ` · ${m.reason}` : ''}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-ink-3 flex-shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Continue */}
            <button
              onClick={() => setStep('who')}
              className="w-full rounded-2xl bg-court py-4 text-[15px] font-bold text-white flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
            >
              {openMatches.length > 0 ? 'Create a new game instead' : 'Next — who\'s playing?'} <ChevronRight className="h-4 w-4" />
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
                          // Pre-selection happens via useEffect when fullMembers loads
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
                        {(g.recentMembers ?? []).slice(0, 4).map(m => (
                          <PlayerAvatar key={m.id} name={m.name} avatarUrl={m.avatar_url} size="sm" />
                        ))}
                      </div>
                      <div className="text-left flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-ink truncate">{g.name}</p>
                        <p className="text-[11px] text-ink-2">{g.memberCount} members</p>
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

            {/* N6a: Connections — separate from groups, always shown if any */}
            {connectionProfiles.length > 0 && !selectedGroupId && (
              <div>
                <p className="text-[13px] font-semibold text-ink-2 mb-3 flex items-center gap-1.5">
                  <Users className="h-4 w-4" /> Your connections
                </p>
                <div className="flex flex-wrap gap-2">
                  {connectionProfiles.map(c => {
                    const selected = selectedPlayers.includes(c.user_id)
                    return (
                      <button
                        key={c.user_id}
                        onClick={() => {
                          setSelectedPlayers(prev =>
                            selected ? prev.filter(id => id !== c.user_id) : [...prev, c.user_id]
                          )
                        }}
                        className={cn(
                          'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-all active:scale-95',
                          selected
                            ? 'bg-court-100 text-court-700'
                            : 'bg-surface border border-hairline text-ink-3',
                        )}
                      >
                        <PlayerAvatar name={c.name} avatarUrl={c.avatar_url} size="sm" />
                        {c.name?.split(' ')[0] ?? 'Player'}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Selected players from group — L6: asking is opt-in */}
            {selectedGroupId && fullMembers.length > 1 && (
              <div>
                <p className="text-[13px] font-semibold text-ink-2 mb-2">
                  {selectedPlayers.length > 0 ? `You + ${selectedPlayers.length} to invite` : 'Who do you want to ask?'}
                </p>
                {/* Quick-select actions */}
                <div className="flex gap-2 mb-3">
                  <button
                    onClick={() => setSelectedPlayers(fullMembers.filter(m => m.id !== userId).map(m => m.id))}
                    className="rounded-full border border-court-100 bg-court-50 px-3 py-1.5 text-[12px] font-semibold text-court-700 active:scale-95"
                  >
                    Ask everyone
                  </button>
                  {usualPlayers && usualPlayers.length === 3 && (
                    <button
                      onClick={() => setSelectedPlayers(usualPlayers)}
                      className="rounded-full border border-court-100 bg-court-50 px-3 py-1.5 text-[12px] font-semibold text-court-700 active:scale-95"
                    >
                      Ask the usual four
                    </button>
                  )}
                  {selectedPlayers.length > 0 && (
                    <button
                      onClick={() => setSelectedPlayers([])}
                      className="rounded-full border border-hairline px-3 py-1.5 text-[12px] font-semibold text-ink-3 active:scale-95"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {fullMembers
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
                          <PlayerAvatar name={m.name} avatarUrl={m.avatar_url} size="sm" />
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
                  {selectedPlayers.length > 0 && ` · ${selectedPlayers.length} invited`}
                </span>
              </div>
            </div>

            {/* N4: escape hatch at the top, not below 13 venues */}
            <div className="px-5 mb-3">
              <button
                onClick={handleCreateMatch}
                disabled={creatingMatch}
                className="w-full text-center text-[13px] font-semibold text-ink-2 py-2 active:text-court transition-colors"
              >
                {creatingMatch ? 'Creating…' : "I'll sort the court later →"}
              </button>
            </div>

            {/* CourtsHome — tapping a venue creates the match */}
            <div className="px-5">
            <CourtsHome
              lat={coords?.lat ?? null}
              lng={coords?.lng ?? null}
              query={venueQuery}
              onQueryChange={setVenueQuery}
              onUseLocation={requestLocation}
              locating={locating}
              locationLoading={locationLoading && !coords}
              onPickVenue={async (venueId) => {
                if (!userId) return
                const matchTime = window.defaultTime
                const hasGroup = !!selectedGroupId

                const { data: match, error } = await supabase
                  .from('matches')
                  .insert({
                    match_date: dateStr,
                    match_time: `${matchTime}:00`,
                    match_type: 'casual',
                    status: 'open',
                    player_ids: [userId],
                    group_id: selectedGroupId,
                    context_type: hasGroup ? 'group' : 'open',
                    booking_status: 'not_booked',
                    court_requirement: 'needed',
                    created_by: userId,
                    created_manually: true,
                    is_open: true,
                    opened_by: userId,
                    opened_at: new Date().toISOString(),
                    open_audience: hasGroup ? 'groups' : 'connections',
                  })
                  .select('id')
                  .single()

                if (error || !match) return

                if (selectedPlayers.length > 0) {
                  await supabase.rpc('send_match_invitations', {
                    p_match_id: match.id,
                    p_invitee_ids: selectedPlayers,
                  })
                }

                navigate(`/play/book-court?match_id=${match.id}&venue=${venueId}&date=${dateStr}`)
              }}
              matchGroupId={selectedGroupId}
              isMatchMode
              targetDayKey={format(selectedDate, 'EEEE').toLowerCase()}
              targetTime={selectedWindow === 'any' ? undefined : window.from}
            />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
