import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ChevronLeft, ChevronRight, Search, Check, Trophy, Handshake, Users, MapPin, UserPlus, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { sendNotification } from '@/lib/notifications'
import { useAuth } from '@/hooks/useAuth'
import { PlayerAvatar } from '@/components/shared/PlayerAvatar'
import { cn } from '@/lib/utils'
import { checkSelfConflict } from '@/lib/conflictCheck'

// ── Types ─────────────────────────────────────────────────────────────────────

type MatchType = 'competitive' | 'friendly' | 'casual'
type Duration  = 60 | 90 | 120

interface Venue { venue_id: string; venue_name: string; city?: string | null }
interface Court { id: string; court_name?: string | null }
export interface MatchPlayer { id: string; name: string; avatar_url?: string | null; playtomic_level?: number | null; isGuest?: boolean }
type Profile = MatchPlayer

interface GroupOption { id: string; name: string }

interface FormState {
  matchType: MatchType | null
  group: GroupOption | null
  date: string
  time: string
  duration: Duration
  venue: Venue | null
  court: Court | null
  notes: string
  players: Profile[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

function nextCleanTime() {
  const now = new Date()
  const mins = now.getMinutes()
  const nextMins = Math.ceil((mins + 1) / 30) * 30
  now.setMinutes(nextMins, 0, 0)
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

function useDebounce<T>(value: T, delay: number) {
  const [dv, setDv] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDv(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return dv
}

// ── Step indicator ────────────────────────────────────────────────────────────

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-1.5 mb-6">
      {Array.from({ length: total }).map((_, i) => (
        <motion.div
          key={i}
          animate={{ width: i === current - 1 ? 20 : 6, backgroundColor: i === current - 1 ? 'var(--color-court)' : 'var(--color-hairline)' }}
          transition={{ duration: 0.25 }}
          className="h-1.5 rounded-full"
        />
      ))}
    </div>
  )
}

// ── Step 1 — Match type ───────────────────────────────────────────────────────

/**
 * The three match types, separated by weight rather than by hue.
 *
 * Friendly was `#1565C0` on `#f0f4ff` — a hardcoded blue the colour codemod
 * could not see, because it lives in an inline style rather than a class. It
 * put the app's only blue on the first screen of the most-used flow.
 *
 * A competitive match has something at stake, so it keeps `warn`. Friendly is
 * the ordinary brand case: `court`. Casual is the one with no consequence at
 * all, so it recedes to a neutral. Three steps of emphasis on one palette read
 * more clearly than three unrelated hues, and they say something true about the
 * choice.
 */
const MATCH_TYPES: Array<{ type: MatchType; label: string; desc: string; Icon: typeof Trophy; accent: string; bg: string }> = [
  { type: 'competitive', label: 'Competitive', desc: 'Results count toward your ranking', Icon: Trophy,    accent: 'var(--color-warn)',  bg: 'var(--color-warn-50)' },
  { type: 'friendly',    label: 'Friendly',    desc: 'Play for fun, no ranking impact',   Icon: Handshake, accent: 'var(--color-court)', bg: 'var(--color-court-50)' },
  { type: 'casual',      label: 'Casual',      desc: 'Informal — anyone can join',        Icon: Users,     accent: 'var(--color-ink-2)', bg: 'var(--color-surface)' },
]

function Step1({ form, setForm, userGroups }: { form: FormState; setForm: (f: FormState) => void; userGroups: GroupOption[] }) {
  const { t } = useTranslation()
  return (
    <div>
      <h2 className="text-xl font-bold text-ink mb-1">{t('create_match.match_type')}</h2>
      <p className="text-sm text-ink-2 mb-6">{t('create_match.match_type_sub')}</p>
      <div className="space-y-3">
        {MATCH_TYPES.map(({ type, label, desc, Icon, accent, bg }) => {
          const selected = form.matchType === type
          return (
            <button
              key={type}
              onClick={() => setForm({ ...form, matchType: type })}
              className={cn(
                'w-full flex items-center gap-4 rounded-2xl border-2 p-4 text-left transition-all',
                selected ? 'border-court shadow-sm' : 'border-hairline hover:border-hairline'
              )}
              style={{ backgroundColor: selected ? bg : 'var(--color-card)' }}
            >
              <div className="h-11 w-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: bg }}>
                <Icon className="h-5 w-5" style={{ color: accent }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-ink">{label}</p>
                <p className="text-[13px] text-ink-2 mt-0.5">{desc}</p>
              </div>
              {selected && (
                <div className="h-5 w-5 rounded-full bg-court flex items-center justify-center flex-shrink-0">
                  <Check className="h-3 w-3 text-white" />
                </div>
              )}
            </button>
          )
        })}
      </div>

      {userGroups.length > 0 && (
        <div className="mt-6">
          <h3 className="text-[14px] font-bold text-ink mb-1">Which group?</h3>
          <p className="text-[12px] text-ink-2 mb-3">Match will be visible to this group's members</p>
          <div className="space-y-2">
            {userGroups.map((g) => (
              <button
                key={g.id}
                onClick={() => setForm({ ...form, group: form.group?.id === g.id ? null : g })}
                className={cn(
                  'w-full flex items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-left transition-colors',
                  form.group?.id === g.id ? 'border-court bg-court-50' : 'border-hairline'
                )}
              >
                <Users className="h-4 w-4 text-ink-2 flex-shrink-0" />
                <span className="text-[13px] font-medium text-ink truncate">{g.name}</span>
                {form.group?.id === g.id && (
                  <div className="ml-auto h-4 w-4 rounded-full bg-court flex items-center justify-center flex-shrink-0">
                    <Check className="h-2.5 w-2.5 text-white" />
                  </div>
                )}
              </button>
            ))}
            <button
              onClick={() => setForm({ ...form, group: null })}
              className={cn(
                'w-full flex items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-left transition-colors',
                !form.group ? 'border-hairline bg-surface' : 'border-hairline'
              )}
            >
              <span className="text-[13px] text-ink-2">No group (open match)</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Step 2 — Setup ────────────────────────────────────────────────────────────

function Step2({ form, setForm }: { form: FormState; setForm: (f: FormState) => void }) {
  const { t } = useTranslation()
  const [venueQuery, setVenueQuery] = useState(form.venue?.venue_name ?? '')
  const [venues, setVenues]         = useState<Venue[]>([])
  const [courts, setCourts]         = useState<Court[]>([])
  const [showVenues, setShowVenues] = useState(false)
  const debouncedQuery = useDebounce(venueQuery, 280)

  // Venue search
  useEffect(() => {
    if (debouncedQuery.length < 2) { setVenues([]); return }
    supabase
      .from('padel_venues')
      .select('venue_id, venue_name, city')
      .ilike('venue_name', `%${debouncedQuery}%`)
      .limit(6)
      .then(({ data, error }) => {
        console.log('[venue search]', debouncedQuery, { data, error })
        if (data) setVenues(data)
      })
  }, [debouncedQuery])

  // Courts for selected venue
  useEffect(() => {
    if (!form.venue) { setCourts([]); return }
    supabase
      .from('courts')
      .select('id, court_name')
      .eq('venue_id', form.venue.venue_id)
      .order('court_name')
      .then(({ data }) => { if (data) setCourts(data) })
  }, [form.venue])

  const DURATIONS: Duration[] = [60, 90, 120]

  return (
    <div>
      <h2 className="text-xl font-bold text-ink mb-1">{t('create_match.match_setup')}</h2>
      <p className="text-sm text-ink-2 mb-6">{t('create_match.match_setup_sub')}</p>
      <div className="space-y-4">

        {/* Date + Time — stacked, constrained to parent */}
        <div className="flex flex-col gap-3" style={{ overflow: 'hidden' }}>
          <div>
            <label className="block text-[13px] font-medium text-ink-2 mb-1.5">{t('match.date')}</label>
            <input
              type="date"
              value={form.date}
              min={todayStr()}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              style={{ fontSize: '16px', maxWidth: '100%', boxSizing: 'border-box' }}
              className="w-full rounded-xl border border-hairline px-3 py-2.5 outline-none focus:border-court focus:ring-2 focus:ring-court/20"
            />
          </div>

          <div>
            <label className="block text-[13px] font-medium text-ink-2 mb-1.5">{t('match.time')}</label>
            <input
              type="time"
              value={form.time}
              step="1800"
              onChange={(e) => setForm({ ...form, time: e.target.value })}
              style={{ fontSize: '16px', maxWidth: '100%', boxSizing: 'border-box' }}
              className="w-full rounded-xl border border-hairline px-3 py-2.5 outline-none focus:border-court focus:ring-2 focus:ring-court/20"
            />
          </div>
        </div>

        {/* Duration */}
        <div>
          <label className="block text-[13px] font-medium text-ink-2 mb-1.5">{t('create_match.duration')}</label>
          <div className="flex gap-2">
            {DURATIONS.map((d) => (
              <button
                key={d}
                onClick={() => setForm({ ...form, duration: d })}
                className={cn(
                  'flex-1 rounded-xl border py-2.5 text-sm font-medium transition-all',
                  form.duration === d
                    ? 'border-court bg-court-50 text-court-700'
                    : 'border-hairline text-ink-2 hover:border-hairline'
                )}
              >
                {d} min
              </button>
            ))}
          </div>
        </div>

        {/* Venue search */}
        <div className="relative">
          <label className="block text-[13px] font-medium text-ink-2 mb-1.5">
            {t('match.venue')} <span className="text-ink-2 font-normal">({t('common.optional')})</span>
          </label>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-2" />
            <input
              type="text"
              value={venueQuery}
              onChange={(e) => { setVenueQuery(e.target.value); setShowVenues(true); if (!e.target.value) setForm({ ...form, venue: null, court: null }) }}
              onFocus={() => setShowVenues(true)}
              placeholder={t('book_court.venue_placeholder')}
              style={{ fontSize: '16px', maxWidth: '100%', boxSizing: 'border-box' }}
              className="w-full rounded-xl border border-hairline pl-9 pr-4 py-2.5 outline-none focus:border-court focus:ring-2 focus:ring-court/20"
            />
            {form.venue && (
              <button
                onClick={() => { setVenueQuery(''); setForm({ ...form, venue: null, court: null }); setCourts([]) }}
                className="absolute right-3 top-1/2 -translate-y-1/2"
              >
                <X className="h-4 w-4 text-ink-2" />
              </button>
            )}
          </div>
          <AnimatePresence>
            {showVenues && venues.length > 0 && !form.venue && (
              <motion.ul
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="absolute z-50 mt-1 w-full rounded-xl border border-hairline bg-card shadow-lg overflow-hidden"
              >
                {venues.map((v) => (
                  <li key={v.venue_id}>
                    <button
                      onClick={() => { setForm({ ...form, venue: v, court: null }); setVenueQuery(v.venue_name); setShowVenues(false) }}
                      className="w-full text-left px-4 py-2.5 text-sm hover:bg-court-50 flex items-center gap-2"
                    >
                      <MapPin className="h-3.5 w-3.5 text-ink-2 flex-shrink-0" />
                      <span className="font-medium text-ink">{v.venue_name}</span>
                      {v.city && <span className="text-ink-2 text-[12px]">{v.city}</span>}
                    </button>
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </div>

        {/* Court dropdown */}
        {form.venue && courts.length > 0 && (
          <div>
            <label className="block text-[13px] font-medium text-ink-2 mb-1.5">{t('match.court')}</label>
            <select
              value={form.court?.id ?? ''}
              onChange={(e) => {
                const c = courts.find((c) => c.id === e.target.value) ?? null
                setForm({ ...form, court: c })
              }}
              style={{ fontSize: '16px' }}
              className="w-full rounded-xl border border-hairline px-3 py-2.5 outline-none focus:border-court focus:ring-2 focus:ring-court/20 bg-card"
            >
              <option value="">Any court</option>
              {courts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.court_name ?? 'Court'}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Notes */}
        <div>
          <label className="block text-[13px] font-medium text-ink-2 mb-1.5">
            {t('match.notes')} <span className="text-ink-2 font-normal">({t('common.optional')})</span>
          </label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder={t('create_match.notes_placeholder')}
            rows={2}
            style={{ fontSize: '16px' }}
            className="w-full rounded-xl border border-hairline px-3 py-2.5 outline-none focus:border-court focus:ring-2 focus:ring-court/20 resize-none"
          />
        </div>
      </div>
    </div>
  )
}

// ── Step 3 — Players ──────────────────────────────────────────────────────────

interface ConflictInfo { conflicting_match_id: string; conflicting_time: string | null }

function Step3({ form, setForm, creatorProfile, playerConflicts, conflictsLoading }: {
  form: FormState; setForm: (f: FormState) => void; creatorProfile: Profile | null
  playerConflicts: Record<string, ConflictInfo[]>; conflictsLoading: boolean
}) {
  const { t } = useTranslation()
  const [query, setQuery]               = useState('')
  const [results, setResults]           = useState<Profile[]>([])
  const [showGuestInput, setShowGuestInput] = useState(false)
  const [guestName, setGuestName]       = useState('')
  const debouncedQ = useDebounce(query, 280)

  useEffect(() => {
    if (debouncedQ.length < 2) { setResults([]); return }
    const selectedIds = new Set(form.players.map((p) => p.id))
    supabase
      .from('profiles')
      .select('id, name, avatar_url, playtomic_level')
      .ilike('name', `%${debouncedQ}%`)
      .limit(8)
      .then(({ data }) => {
        if (data) setResults(data.filter((p) => !selectedIds.has(p.id)))
      })
  }, [debouncedQ, form.players])

  const addPlayer = (p: Profile) => {
    if (form.players.length >= 4) return
    setForm({ ...form, players: [...form.players, p] })
    setQuery('')
    setResults([])
  }

  const addGuest = () => {
    const name = guestName.trim()
    if (!name || form.players.length >= 4) return
    const guest: Profile = { id: `guest_${Date.now()}`, name, isGuest: true }
    setForm({ ...form, players: [...form.players, guest] })
    setGuestName('')
    setShowGuestInput(false)
  }

  const removePlayer = (id: string) => {
    if (id === creatorProfile?.id) return
    setForm({ ...form, players: form.players.filter((p) => p.id !== id) })
  }

  return (
    // min-h keeps the sheet stable when search results appear/disappear
    <div className="min-h-[360px]">
      <h2 className="text-xl font-bold text-ink mb-1">{t('create_match.select_players')}</h2>
      <p className="text-sm text-ink-2 mb-4">
        {t('create_match.players_selected', { count: form.players.length })}
      </p>

      {/* Selected players — always 4 rows (selected + empty slots) */}
      <div className="space-y-2 mb-4">
        {form.players.map((p) => {
          const isCreator = p.id === creatorProfile?.id
          const conflicts = playerConflicts[p.id]
          const hasConflict = conflicts && conflicts.length > 0
          return (
            <div key={p.id} className={cn('flex items-center gap-3 rounded-xl border px-3 py-2.5', hasConflict ? 'border-warn bg-warn-50/60' : 'border-hairline bg-surface/60')}>
              <PlayerAvatar name={p.name} avatarUrl={p.isGuest ? null : p.avatar_url} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-ink truncate">{p.name}</p>
                {hasConflict ? (
                  <p className="text-[11px] text-warn font-medium">
                    {t('create_match.conflict_at_time', { time: conflicts[0].conflicting_time?.slice(0, 5) ?? form.time.slice(0, 5) })}
                  </p>
                ) : !p.isGuest && p.playtomic_level != null ? (
                  <p className="text-[11px] text-ink-2">Level {Number(p.playtomic_level).toFixed(1)}</p>
                ) : null}
              </div>
              {hasConflict && (
                <AlertTriangle className="h-4 w-4 text-warn flex-shrink-0" />
              )}
              {isCreator && !hasConflict && (
                <span className="text-[11px] font-bold text-court bg-court-50 border border-court-100 rounded-full px-2 py-0.5">{t('common.you')}</span>
              )}
              {p.isGuest && (
                <span className="text-[11px] font-bold text-ink-2 bg-hairline border border-hairline rounded-full px-2 py-0.5">{t('common.guest')}</span>
              )}
              {!isCreator && (
                <button
                  onClick={() => removePlayer(p.id)}
                  className="h-6 w-6 rounded-full bg-hairline hover:bg-alert-50 flex items-center justify-center transition-colors flex-shrink-0"
                >
                  <X className="h-3 w-3 text-ink-2 hover:text-alert" />
                </button>
              )}
            </div>
          )
        })}

        {/* Empty slots */}
        {Array.from({ length: Math.max(0, 4 - form.players.length) }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border border-dashed border-hairline px-3 py-2.5 text-ink-3">
            <div className="h-7 w-7 rounded-full border-2 border-dashed border-hairline flex items-center justify-center">
              <UserPlus className="h-3.5 w-3.5" />
            </div>
            <p className="text-[13px]">{t('create_match.open_spot')}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      {form.players.length < 4 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('create_match.search_players')}
            style={{ fontSize: '16px' }}
            className="w-full rounded-xl border border-hairline pl-9 pr-4 py-2.5 outline-none focus:border-court focus:ring-2 focus:ring-court/20"
          />
        </div>
      )}

      {/* Search results — max-height so sheet doesn't jump */}
      <AnimatePresence>
        {results.length > 0 && (
          <motion.ul
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-1 rounded-xl border border-hairline bg-card shadow-lg overflow-y-auto max-h-40"
          >
            {results.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => addPlayer(p)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-court-50 transition-colors text-left"
                >
                  <PlayerAvatar name={p.name} avatarUrl={p.avatar_url} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-ink truncate">{p.name}</p>
                    {p.playtomic_level != null && (
                      <p className="text-[11px] text-ink-2">Level {Number(p.playtomic_level).toFixed(1)}</p>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>

      {/* Add guest player */}
      {form.players.length < 4 && (
        <div className="mt-3">
          {showGuestInput ? (
            <div className="flex gap-2">
              <input
                type="text"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addGuest() }}
                placeholder={t('create_match.guest_name')}
                autoFocus
                style={{ fontSize: '16px' }}
                className="flex-1 rounded-xl border border-hairline px-3 py-2.5 outline-none focus:border-court focus:ring-2 focus:ring-court/20"
              />
              <button
                onClick={addGuest}
                disabled={!guestName.trim()}
                className="rounded-xl bg-ink px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-40"
              >
                {t('create_match.add')}
              </button>
              <button
                onClick={() => { setShowGuestInput(false); setGuestName('') }}
                className="rounded-xl border border-hairline px-3 py-2.5 text-[13px] text-ink-2"
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowGuestInput(true)}
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-hairline py-2.5 text-[13px] text-ink-2 hover:border-court-100 hover:text-court transition-colors"
            >
              <UserPlus className="h-4 w-4" />
              {t('create_match.add_guest')}
            </button>
          )}
        </div>
      )}

      {/* Conflict banner */}
      {(() => {
        const conflictCount = Object.values(playerConflicts).filter(c => c.length > 0).length
        if (conflictCount === 0) return null
        return (
          <div className="mt-4 rounded-xl border border-warn bg-warn-50 px-4 py-3 flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 text-warn flex-shrink-0 mt-0.5" />
            <p className="text-[12px] text-warn font-medium">
              {t('create_match.players_have_conflicts', { count: conflictCount })}
            </p>
          </div>
        )
      })()}
      {conflictsLoading && form.players.length > 0 && form.date && form.time && (
        <p className="text-[11px] text-ink-2 mt-2 text-center">{t('create_match.checking_conflicts')}</p>
      )}
    </div>
  )
}

// ── Step 4 — Review ───────────────────────────────────────────────────────────

function Step4({ form, safePlayers, playerConflicts }: { form: FormState; safePlayers: Profile[]; playerConflicts: Record<string, ConflictInfo[]> }) {
  const { t } = useTranslation()
  const rows = [
    { label: t('match.match_type'), value: form.matchType ?? '—' },
    { label: t('match.date'),       value: form.date },
    { label: t('match.time'),       value: form.time.slice(0, 5) },
    { label: t('create_match.duration'), value: `${form.duration} min` },
    { label: t('match.venue'),      value: form.venue?.venue_name ?? 'TBC' },
    { label: t('match.court'),      value: form.court?.court_name ?? t('book_court.court_any') },
  ]
  return (
    <div>
      <h2 className="text-xl font-bold text-ink mb-1">{t('create_match.review')}</h2>
      <p className="text-sm text-ink-2 mb-6">{t('create_match.review_sub')}</p>

      <div className="rounded-2xl border border-hairline bg-surface/60 divide-y divide-hairline mb-5 overflow-hidden">
        {rows.map(({ label, value }) => (
          <div key={label} className="flex items-center justify-between px-4 py-3">
            <span className="text-[13px] text-ink-2">{label}</span>
            <span className="text-[13px] font-semibold text-ink capitalize">{value}</span>
          </div>
        ))}
      </div>

      <p className="text-[13px] font-medium text-ink-2 mb-2.5">{t('match.players')}</p>
      <div className="grid grid-cols-2 gap-2">
        {safePlayers.map((p) => {
          const hasConflict = playerConflicts[p.id]?.length > 0
          return (
            <div key={p.id} className={cn('flex items-center gap-2 rounded-xl px-3 py-2.5', hasConflict ? 'bg-warn-50 border border-warn' : 'bg-card border border-hairline')}>
              <PlayerAvatar name={p.name} avatarUrl={p.isGuest ? null : undefined} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold text-ink truncate">{p.name.split(' ')[0]}</p>
                {p.isGuest && <p className="text-[11px] text-ink-2">{t('common.guest')}</p>}
              </div>
              {hasConflict && <AlertTriangle className="h-3.5 w-3.5 text-warn flex-shrink-0" />}
            </div>
          )
        })}
        {Array.from({ length: Math.max(0, 4 - safePlayers.length) }).map((_, i) => (
          <div key={i} className="flex items-center gap-2 border border-dashed border-hairline rounded-xl px-3 py-2.5">
            <div className="h-7 w-7 rounded-full border-2 border-dashed border-hairline flex-shrink-0" />
            <p className="text-[12px] text-ink-3">{t('create_match.open_spot')}</p>
          </div>
        ))}
      </div>

      {form.notes && (
        <div className="mt-4 rounded-xl bg-surface border border-hairline px-4 py-3">
          <p className="text-[12px] text-ink-2 mb-1">Notes</p>
          <p className="text-[13px] text-ink-2">{form.notes}</p>
        </div>
      )}
    </div>
  )
}

// ── Main sheet ────────────────────────────────────────────────────────────────

interface CreateMatchSheetProps {
  open: boolean
  onClose: () => void
  defaultGroupId?: string
  defaultDate?: string
  /**
   * Players to seat alongside the creator when the sheet opens — used when the
   * match starts from a person rather than from a date, e.g. "New match with
   * Priya" on a connection's profile. The creator is always first; duplicates
   * and anything past four are dropped, so a caller cannot seat an invalid
   * court.
   */
  defaultPlayers?: MatchPlayer[]
}

export function CreateMatchSheet({ open, onClose, defaultGroupId, defaultDate, defaultPlayers }: CreateMatchSheetProps) {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const creatorProfile: Profile | null = profile
    ? { id: user!.id, name: profile.name, avatar_url: profile.avatar_url ?? null, playtomic_level: profile.playtomic_level ?? null }
    : null

  /** Creator first, then the seeded players, de-duplicated and capped at four. */
  const seatPlayers = useCallback((): Profile[] => {
    const seats: Profile[] = creatorProfile ? [creatorProfile] : []
    const seen = new Set(seats.map((p) => p.id))
    for (const p of defaultPlayers ?? []) {
      if (seats.length >= 4 || seen.has(p.id)) continue
      seen.add(p.id)
      seats.push(p)
    }
    return seats
  // creatorProfile is rebuilt every render; its identity is the auth profile.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, profile?.name, profile?.avatar_url, profile?.playtomic_level, defaultPlayers])

  const [step, setStep]       = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [conflictWarning, setConflictWarning] = useState<{ match_time: string | null; venue: string | null } | null>(null)
  const [playerConflicts, setPlayerConflicts] = useState<Record<string, ConflictInfo[]>>({})
  const [conflictsLoading, setConflictsLoading] = useState(false)
  const [form, setForm]       = useState<FormState>({
    matchType: null,
    group: null,
    date: todayStr(),
    time: nextCleanTime(),
    duration: 90,
    venue: null,
    court: null,
    notes: '',
    players: seatPlayers(),
  })

  // Reset on open
  useEffect(() => {
    if (open) {
      setStep(1)
      setError(null)
      setSubmitting(false)
      setConflictWarning(null)
      setPlayerConflicts({})
      setConflictsLoading(false)
      setForm({
        matchType: null,
        group: null,
        date: defaultDate || todayStr(),
        time: nextCleanTime(),
        duration: 90,
        venue: null,
        court: null,
        notes: '',
        players: seatPlayers(),
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Check scheduling conflicts for all selected players
  const playerIds_str = form.players.filter(p => !p.isGuest).map(p => p.id).sort().join(',')
  useEffect(() => {
    if (!form.date || !form.time || !open) { setPlayerConflicts({}); return }
    const realPlayers = form.players.filter(p => !p.isGuest)
    if (realPlayers.length === 0) { setPlayerConflicts({}); return }

    let cancelled = false
    setConflictsLoading(true)

    Promise.all(
      realPlayers.map(async (p) => {
        const conflicts = await checkSelfConflict(p.id, form.date, form.time)
        return { id: p.id, conflicts }
      })
    ).then((results) => {
      if (cancelled) return
      const map: Record<string, ConflictInfo[]> = {}
      for (const r of results) {
        if (r.conflicts.length > 0) map[r.id] = r.conflicts
      }
      setPlayerConflicts(map)
      setConflictsLoading(false)
    })

    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, form.date, form.time, playerIds_str])

  // Fetch user's groups for group picker
  const { data: userGroups = [] } = useQuery<GroupOption[]>({
    queryKey: ['user-groups-for-create', user?.id],
    enabled: open && !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('group_members')
        .select('group_id, groups(id, name)')
        .eq('user_id', user!.id)
        .eq('status', 'approved')
      return (data ?? []).map((m: any) => {
        const g = Array.isArray(m.groups) ? m.groups[0] : m.groups
        return { id: g?.id, name: g?.name }
      }).filter((g: any) => g.id)
    },
  })

  // Pre-select group from prop
  useEffect(() => {
    if (open && defaultGroupId && userGroups.length > 0 && !form.group) {
      const match = userGroups.find(g => g.id === defaultGroupId)
      if (match) setForm(f => ({ ...f, group: match }))
    }
  }, [open, defaultGroupId, userGroups])

  // Defensive: creator is always in the player list even if removed
  const safePlayers = creatorProfile && !form.players.some((p) => p.id === creatorProfile.id)
    ? [creatorProfile, ...form.players]
    : form.players

  const canNext = useCallback(() => {
    if (step === 1) return !!form.matchType
    if (step === 2) return !!form.date && !!form.time
    if (step === 3) return form.players.length >= 1
    return true
  }, [step, form])

  const handleSubmit = async () => {
    if (!user || submitting) return
    setSubmitting(true)
    setError(null)

    // Real players go straight into player_ids. Guests become structured invite
    // slots created via create_match_guest_invite once the match row exists — that
    // gives each guest a real slot (so their name resolves everywhere) plus a
    // shareable join link. We no longer stuff guest names into notes.
    const realPlayers = safePlayers.filter((p) => !p.isGuest)
    const playerIds   = realPlayers.map((p) => p.id)
    const guestList   = safePlayers.filter((p) => p.isGuest)
    const finalNotes  = form.notes.trim() || null

    // match_time must be HH:MM:SS format for Postgres time column
    const matchTime = form.time ? `${form.time.slice(0, 5)}:00` : null

    const payload = {
      match_date:          form.date,
      match_time:          matchTime,
      context_type:        (form.group?.id ?? defaultGroupId) ? 'group' as const : 'open' as const,
      match_type:          form.matchType!,
      status:              playerIds.length >= 4 ? 'scheduled' : 'pending',
      player_ids:          playerIds,
      group_id:            form.group?.id ?? defaultGroupId ?? null,
      booked_venue_name:   form.venue?.venue_name ?? null,
      created_manually:    true,
      created_by:          user.id,
      notes:               finalNotes,
    }

    try {
      // Conflict check — warn if any player has another match in the same time window
      if (!conflictWarning) {
        const conflictingPlayers = Object.keys(playerConflicts).length
        if (conflictingPlayers > 0) {
          const firstConflict = Object.values(playerConflicts)[0][0]
          setConflictWarning({
            match_time: firstConflict?.conflicting_time ?? null,
            venue: null,
          })
          setSubmitting(false)
          return
        }
      }

      const { data, error: insertError } = await supabase
        .from('matches')
        .insert(payload)
        .select('id')
        .single()

      if (insertError) {
        console.error('[CreateMatch] insert error:', insertError)
        throw insertError
      }

      // Turn each guest into a real slot + shareable invite link. Best-effort:
      // the match already exists, so a failed guest invite shouldn't abort it.
      for (const g of guestList) {
        const { error: guestErr } = await supabase.rpc('create_match_guest_invite', {
          p_match_id: data.id,
          p_guest_name: g.name,
          p_contact: null,
        })
        if (guestErr) console.warn('[CreateMatch] guest invite failed:', g.name, guestErr)
      }

      // Insert notification for match creator
      sendNotification({
        user_id:    user.id,
        type:       'match_created',
        title:      'Match created',
        message:    `Your match on ${payload.match_date} has been created`,
        related_id: data.id,
      })

      onClose()
      navigate(`/matches/${data.id}`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : (err as { message?: string })?.message ?? 'Failed to create match'
      console.error('[CreateMatch] caught error:', msg, err)
      setError(msg)
      setSubmitting(false)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[55] bg-scrim"
          />

          {/* Sheet */}
          <motion.div
            key="sheet"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="fixed bottom-0 left-0 right-0 z-[60] flex flex-col bg-card rounded-t-3xl shadow-2xl"
            style={{ maxHeight: '92vh' }}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-2 flex-shrink-0">
              <div className="h-1 w-10 rounded-full bg-hairline" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 pb-2 flex-shrink-0">
              <button
                onClick={step > 1 ? () => setStep(step - 1) : onClose}
                className="h-9 w-9 rounded-full bg-hairline flex items-center justify-center"
              >
                {step > 1 ? <ChevronLeft className="h-5 w-5 text-ink-2" /> : <X className="h-4 w-4 text-ink-2" />}
              </button>
              <span className="text-[13px] text-ink-2 font-medium">{t('create_match.step_of', { step, total: 4 })}</span>
              <div className="w-9" />
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-5 pb-4">
              <StepDots current={step} total={4} />

              <AnimatePresence mode="wait">
                <motion.div
                  key={step}
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -24 }}
                  transition={{ duration: 0.2 }}
                >
                  {step === 1 && <Step1 form={form} setForm={setForm} userGroups={userGroups} />}
                  {step === 2 && <Step2 form={form} setForm={setForm} />}
                  {step === 3 && <Step3 form={form} setForm={setForm} creatorProfile={creatorProfile} playerConflicts={playerConflicts} conflictsLoading={conflictsLoading} />}
                  {step === 4 && <Step4 form={form} safePlayers={safePlayers} playerConflicts={playerConflicts} />}
                </motion.div>
              </AnimatePresence>

              {error && (
                <p className="mt-4 rounded-xl bg-alert-50 px-4 py-3 text-sm text-alert">{error}</p>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 pt-4 flex-shrink-0 border-t border-hairline"
                 style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}>
              {step < 4 ? (
                <button
                  onClick={() => setStep(step + 1)}
                  disabled={!canNext()}
                  className="w-full flex items-center justify-center gap-2 rounded-2xl py-4 text-base font-semibold text-white transition disabled:opacity-40"
                  style={{ background: 'var(--color-court)' }}
                >
                  {t('common.continue')} <ChevronRight className="h-5 w-5" />
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 rounded-2xl py-4 text-base font-semibold text-white transition disabled:opacity-60"
                  style={{ background: 'var(--color-court)' }}
                >
                  {submitting ? t('create_match.creating') : t('play.create_match')}
                </button>
              )}
            </div>
          </motion.div>

          {/* Conflict warning dialog */}
          <AnimatePresence>
            {conflictWarning && (
              <>
                <motion.div
                  className="fixed inset-0 z-[65] bg-scrim"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                />
                <motion.div
                  className="fixed bottom-0 left-0 right-0 z-[70] bg-card rounded-t-3xl px-5 pt-6"
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                  style={{ paddingBottom: 'calc(32px + env(safe-area-inset-bottom))' }}
                >
                  <div className="flex justify-center mb-5">
                    <div className="h-10 w-10 rounded-full bg-warn-50 flex items-center justify-center">
                      <span className="text-[20px]">⚠️</span>
                    </div>
                  </div>
                  <p className="text-[16px] font-bold text-ink text-center mb-2">{t('create_match.conflict_title')}</p>
                  <p className="text-[13px] text-ink-2 text-center mb-6">
                    {conflictWarning.match_time
                      ? `${t('create_match.conflict_at')} ${conflictWarning.match_time.slice(0, 5)}`
                      : t('create_match.conflict_date')}
                    {conflictWarning.venue ? ` at ${conflictWarning.venue}` : ''}.
                    {' '}{t('create_match.conflict_anyway')}
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setConflictWarning(null)}
                      className="flex-1 rounded-2xl border border-hairline py-3 text-[14px] font-semibold text-ink-2"
                    >
                      {t('common.cancel')}
                    </button>
                    <button
                      onClick={() => handleSubmit()}
                      disabled={submitting}
                      className="flex-1 rounded-2xl py-3 text-[14px] font-bold text-white disabled:opacity-60"
                      style={{ background: 'var(--color-court)' }}
                    >
                      {submitting ? t('create_match.creating') : t('create_match.create_anyway')}
                    </button>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </>
      )}
    </AnimatePresence>
  )
}
