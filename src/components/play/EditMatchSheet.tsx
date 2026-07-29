import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, MapPin, Search, Users, UserPlus, UserRound } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { shareMatchInvite, pickContact, isContactPickerSupported } from '@/lib/invites'
import { PlayerAvatar } from '@/components/shared/PlayerAvatar'
import type { Match } from '@/lib/types'

interface Venue { venue_id: string; venue_name: string; city?: string | null }
interface Court { id: string; court_name: string | null }
interface PlayerProfile { id: string; name: string; avatar_url: string | null }

function useDebounce<T>(value: T, delay: number) {
  const [dv, setDv] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDv(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return dv
}

const MATCH_TYPES = [
  { value: 'competitive', label: 'Competitive' },
  { value: 'friendly',    label: 'Friendly'    },
  { value: 'casual',      label: 'Casual'      },
]

interface EditMatchSheetProps {
  open: boolean
  onClose: () => void
  match: Match
}

export function EditMatchSheet({ open, onClose, match }: EditMatchSheetProps) {
  const [date, setDate]               = useState(match.match_date)
  const [time, setTime]               = useState(match.match_time?.slice(0, 5) ?? '')
  const [matchType, setMatchType]     = useState(match.match_type ?? 'casual')
  const [venueQuery, setVenueQuery]   = useState(match.booked_venue_name ?? '')

  // Block match_type changes when a result exists (is_friendly is derived from it)
  const { data: hasResult } = useQuery({
    queryKey: ['match-has-result', match.id],
    queryFn: async () => {
      const { count } = await supabase
        .from('match_results')
        .select('id', { count: 'exact', head: true })
        .eq('match_id', match.id)
      return (count ?? 0) > 0
    },
    enabled: open,
  })
  const matchTypeLocked = !!hasResult
  const [venues, setVenues]           = useState<Venue[]>([])
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(
    match.booked_venue_name ? { venue_id: '', venue_name: match.booked_venue_name } : null
  )
  const [showVenues, setShowVenues]   = useState(false)
  const [selectedCourtId, setSelectedCourtId] = useState<string>('')
  const [courtNumber, setCourtNumber] = useState<string>(match.booked_court_number?.toString() ?? '')
  const [notes, setNotes]             = useState(
    match.notes?.split('\n').filter((line) => !line.startsWith('Guests:')).join('\n') ?? ''
  )
  const [playerIds, setPlayerIds]     = useState<string[]>(match.player_ids ?? [])
  // Legacy guests were stored as names in notes ("Guests: A, B"), not in player_ids.
  const [legacyGuests, setLegacyGuests] = useState<string[]>([])
  // replacingIdx: index of the slot being replaced; -1 = adding a new slot.
  const [replacingIdx, setReplacingIdx] = useState<number | null>(null)
  const [playerSearch, setPlayerSearch] = useState('')
  const [playerResults, setPlayerResults] = useState<PlayerProfile[]>([])
  const [invitingNew, setInvitingNew] = useState(false)
  const [guestName, setGuestName]     = useState('')
  const [guestContact, setGuestContact] = useState('')
  const debouncedPlayerSearch = useDebounce(playerSearch, 280)
  const debouncedQuery = useDebounce(venueQuery, 280)
  const queryClient    = useQueryClient()
  const { profile }    = useAuth()

  // Guest slots are placeholder UUIDs in player_ids; resolve their names from
  // match_guest_invites (a player_id is a guest iff it appears in this map).
  const { data: guestNameMap = {} } = useQuery<Record<string, string>>({
    queryKey: ['match-guest-names', match.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('match_guest_invites')
        .select('slot_player_id, guest_name, status')
        .eq('match_id', match.id)
        .neq('status', 'cancelled')
      const map: Record<string, string> = {}
      for (const r of data ?? []) map[r.slot_player_id as string] = r.guest_name as string
      return map
    },
    enabled: open,
  })

  useEffect(() => {
    if (open) {
      setDate(match.match_date)
      setTime(match.match_time?.slice(0, 5) ?? '')
      setMatchType(match.match_type ?? 'casual')
      setVenueQuery(match.booked_venue_name ?? '')
      setSelectedVenue(match.booked_venue_name ? { venue_id: '', venue_name: match.booked_venue_name } : null)
      setNotes(match.notes?.split('\n').filter((line) => !line.startsWith('Guests:')).join('\n') ?? '')
      setVenues([])
      setSelectedCourtId('')
      setCourtNumber(match.booked_court_number?.toString() ?? '')
      setPlayerIds(match.player_ids ?? [])
      setLegacyGuests(match.notes?.match(/Guests: (.+)/)?.[1]?.split(',').map((s) => s.trim()).filter(Boolean) ?? [])
      setReplacingIdx(null)
      setPlayerSearch('')
      setPlayerResults([])
      setInvitingNew(false)
      setGuestName('')
      setGuestContact('')
    }
  }, [open, match])

  // Player profiles for current match players
  const { data: matchPlayers = [] } = useQuery<PlayerProfile[]>({
    queryKey: ['match-players', playerIds.join(',')],
    queryFn: async () => {
      if (playerIds.length === 0) return []
      const { data } = await supabase
        .from('profiles')
        .select('id, name, avatar_url')
        .in('id', playerIds)
      return data ?? []
    },
    enabled: playerIds.length > 0,
  })

  // Player search for replace
  useEffect(() => {
    if (debouncedPlayerSearch.length < 2) { setPlayerResults([]); return }
    supabase
      .from('profiles')
      .select('id, name, avatar_url')
      .ilike('name', `%${debouncedPlayerSearch}%`)
      .limit(8)
      .then(({ data }) => setPlayerResults(data ?? []))
  }, [debouncedPlayerSearch])

  // Venue search
  useEffect(() => {
    if (debouncedQuery.length < 2) { setVenues([]); return }
    supabase
      .from('padel_venues')
      .select('venue_id, venue_name, city')
      .ilike('venue_name', `%${debouncedQuery}%`)
      .limit(6)
      .then(({ data }) => { if (data) setVenues(data) })
  }, [debouncedQuery])

  // Courts for selected venue
  const { data: courts = [] } = useQuery<Court[]>({
    queryKey: ['courts', selectedVenue?.venue_id],
    queryFn: async () => {
      if (!selectedVenue?.venue_id) return []
      const { data } = await supabase
        .from('courts')
        .select('id, court_name')
        .eq('venue_id', selectedVenue.venue_id)
        .order('court_name', { ascending: true })
      return data ?? []
    },
    enabled: !!selectedVenue?.venue_id,
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      const guestsLine = legacyGuests.length ? `Guests: ${legacyGuests.join(', ')}` : ''
      const savedNotes = [notes.trim(), guestsLine].filter(Boolean).join('\n') || null

      let resolvedCourtNumber: number | null = null
      if (courtNumber) {
        resolvedCourtNumber = parseInt(courtNumber) || null
      }

      const { error } = await supabase
        .from('matches')
        .update({
          match_date:          date,
          match_time:          time || null,
          match_type:          matchType,
          booked_venue_name:   selectedVenue?.venue_name ?? null,
          booked_court_number: resolvedCourtNumber,
          notes:               savedNotes,
          player_ids:          playerIds,
        })
        .eq('id', match.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['match', match.id] })
      onClose()
    },
  })

  // Add or replace a slot with a brand-new (non-PPA) player: creates a real guest
  // slot + invite link on the server, mirrors it into local state (so Save stays
  // consistent), and opens the native share sheet to send the link.
  // replacingIdx === -1 means "add"; >= 0 means "replace that slot".
  const inviteGuestMutation = useMutation({
    mutationFn: async () => {
      if (replacingIdx === null) return null
      const name = guestName.trim()
      if (!name) return null
      const isAdd = replacingIdx === -1
      const replacePid = isAdd ? null : playerIds[replacingIdx]
      const { data, error } = await supabase.rpc('create_match_guest_invite', {
        p_match_id: match.id,
        p_guest_name: name,
        p_contact: guestContact.trim() || null,
        p_replace_player_id: replacePid,
      })
      if (error) throw error
      return { ...(data as { token?: string; slot?: string }), idx: replacingIdx, name, isAdd }
    },
    onSuccess: async (res) => {
      if (res?.slot != null) {
        if (res.isAdd) setPlayerIds((prev) => [...prev, res.slot!])
        else if (res.idx != null && res.idx >= 0) setPlayerIds((prev) => prev.map((id, i) => (i === res.idx ? res.slot! : id)))
      }
      setReplacingIdx(null)
      setInvitingNew(false)
      setGuestName('')
      setGuestContact('')
      queryClient.invalidateQueries({ queryKey: ['match', match.id] })
      queryClient.invalidateQueries({ queryKey: ['match-guest-names', match.id] })
      if (res?.token) {
        const r = await shareMatchInvite({ token: res.token, guestName: res.name, inviterName: profile?.name })
        if (r === 'copied') toast.success('Invite link copied — paste it to them')
      }
    },
  })

  async function chooseGuestFromContacts() {
    const c = await pickContact()
    if (!c) return
    if (c.name) setGuestName(c.name)
    if (c.tel || c.email) setGuestContact(c.tel ?? c.email ?? '')
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[55] bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-[60] bg-white rounded-t-3xl"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1 w-10 rounded-full bg-gray-200" />
            </div>

            <div className="flex items-center justify-between px-5 py-3">
              <button onClick={onClose} className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center">
                <X className="h-4 w-4 text-gray-600" />
              </button>
              <h2 className="text-[15px] font-bold text-gray-900">Edit Match</h2>
              <div className="w-9" />
            </div>

            <div
              className="px-5 overflow-y-auto"
              style={{ paddingBottom: 'calc(80px + env(safe-area-inset-bottom))', maxHeight: '80vh' }}
            >
              <div className="space-y-4 pb-2">
                {/* Date */}
                <div>
                  <label className="block text-[13px] font-medium text-gray-700 mb-1.5">Date</label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
                  />
                </div>

                {/* Time */}
                <div>
                  <label className="block text-[13px] font-medium text-gray-700 mb-1.5">Time</label>
                  <input
                    type="time"
                    value={time}
                    step="1800"
                    onChange={(e) => setTime(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
                  />
                </div>

                {/* Match type */}
                <div>
                  <label className="block text-[13px] font-medium text-gray-700 mb-1.5">Match type</label>
                  {matchTypeLocked && (
                    <p className="text-[11px] text-amber-600 mb-1.5">Cannot change — a result has been recorded for this match.</p>
                  )}
                  <div className="grid grid-cols-3 gap-2">
                    {MATCH_TYPES.map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        disabled={matchTypeLocked}
                        onClick={() => setMatchType(value)}
                        className={`py-2 rounded-xl text-[12px] font-semibold border transition-colors ${
                          matchType === value
                            ? 'bg-[#009688] text-white border-[#009688]'
                            : 'bg-white text-gray-600 border-gray-200'
                        } ${matchTypeLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Venue */}
                <div className="relative">
                  <label className="block text-[13px] font-medium text-gray-700 mb-1.5">
                    Venue <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      value={venueQuery}
                      onChange={(e) => {
                        setVenueQuery(e.target.value)
                        setShowVenues(true)
                        if (!e.target.value) { setSelectedVenue(null); setSelectedCourtId('') }
                      }}
                      onFocus={() => setShowVenues(true)}
                      placeholder="Search venues…"
                      className="w-full rounded-xl border border-gray-200 pl-9 pr-4 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
                    />
                    {selectedVenue && (
                      <button
                        onClick={() => { setVenueQuery(''); setSelectedVenue(null); setSelectedCourtId('') }}
                        className="absolute right-3 top-1/2 -translate-y-1/2"
                      >
                        <X className="h-4 w-4 text-gray-400" />
                      </button>
                    )}
                  </div>
                  <AnimatePresence>
                    {showVenues && venues.length > 0 && !selectedVenue && (
                      <motion.ul
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="absolute z-50 mt-1 w-full rounded-xl border border-gray-100 bg-white shadow-lg max-h-48 overflow-y-auto"
                      >
                        {venues.map((v) => (
                          <li key={v.venue_id}>
                            <button
                              onClick={() => {
                                setSelectedVenue(v)
                                setVenueQuery(v.venue_name)
                                setShowVenues(false)
                                setSelectedCourtId('')
                              }}
                              className="w-full text-left px-4 py-2.5 text-sm hover:bg-teal-50 flex items-center gap-2"
                            >
                              <MapPin className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                              <span className="font-medium text-gray-800">{v.venue_name}</span>
                              {v.city && <span className="text-gray-400 text-[12px]">{v.city}</span>}
                            </button>
                          </li>
                        ))}
                      </motion.ul>
                    )}
                  </AnimatePresence>
                </div>

                {/* Court selector */}
                <div>
                  <label className="block text-[13px] font-medium text-gray-700 mb-1.5">
                    Court <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  {courts.length > 0 ? (
                    <select
                      value={selectedCourtId}
                      onChange={(e) => setSelectedCourtId(e.target.value)}
                      className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 bg-white"
                    >
                      <option value="">Select a court…</option>
                      {courts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.court_name ?? 'Court'}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="number"
                      value={courtNumber}
                      onChange={(e) => setCourtNumber(e.target.value)}
                      placeholder="Court number"
                      min="1"
                      className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
                    />
                  )}
                </div>

                {/* Players */}
                <div>
                  <label className="block text-[13px] font-medium text-gray-700 mb-1.5">
                    <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Players</span>
                  </label>
                  <div className="space-y-2 mb-2">
                    {playerIds.map((pid, idx) => {
                      const guest = !!guestNameMap[pid]
                      const p = matchPlayers.find((m) => m.id === pid)
                      const displayName = guest ? (guestNameMap[pid] ?? 'Guest') : (p?.name ?? pid)
                      return (
                        <div key={pid} className="flex items-center gap-2">
                          <PlayerAvatar name={displayName} avatarUrl={guest ? null : (p?.avatar_url ?? null)} size="sm" />
                          <span className="flex-1 text-[13px] text-gray-800 truncate">
                            {displayName}
                            {guest && <span className="ml-1.5 text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-100 rounded px-1 py-0.5">invite pending</span>}
                          </span>
                          <button
                            type="button"
                            onClick={() => { setReplacingIdx(idx); setPlayerSearch(''); setPlayerResults([]); setInvitingNew(false); setGuestName(''); setGuestContact('') }}
                            className="text-[11px] font-semibold text-teal-600 border border-teal-200 rounded-lg px-2 py-1"
                          >
                            Replace
                          </button>
                          <button
                            type="button"
                            onClick={() => setPlayerIds((prev) => prev.filter((_, i) => i !== idx))}
                            className="text-gray-300 hover:text-red-500 px-1"
                            aria-label="Remove player"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      )
                    })}
                    {legacyGuests.map((g, gi) => (
                      <div key={`lg-${gi}`} className="flex items-center gap-2">
                        <PlayerAvatar name={g} avatarUrl={null} size="sm" />
                        <span className="flex-1 text-[13px] text-gray-800 truncate">
                          {g}
                          <span className="ml-1.5 text-[10px] font-semibold text-gray-500 bg-gray-100 border border-gray-200 rounded px-1 py-0.5">guest</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setLegacyGuests((prev) => prev.filter((_, i) => i !== gi))}
                          className="text-gray-300 hover:text-red-500 px-1"
                          aria-label="Remove guest"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                  {replacingIdx === null && (playerIds.length + legacyGuests.length) < 4 && (
                    <button
                      type="button"
                      onClick={() => { setReplacingIdx(-1); setPlayerSearch(''); setPlayerResults([]); setInvitingNew(false); setGuestName(''); setGuestContact('') }}
                      className="mb-2 w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-teal-200 py-2.5 text-[12px] font-semibold text-teal-700 hover:bg-teal-50/40"
                    >
                      <UserPlus className="h-4 w-4" /> Add player
                    </button>
                  )}
                  {replacingIdx !== null && (
                    <div className="border border-gray-200 rounded-xl p-3">
                      <p className="text-[12px] text-gray-500 mb-2">
                        {replacingIdx === -1 ? 'Add a player — search by name:' : `Replacing player ${replacingIdx + 1} — search by name:`}
                      </p>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                        <input
                          type="text"
                          value={playerSearch}
                          onChange={(e) => setPlayerSearch(e.target.value)}
                          placeholder="Search by name…"
                          className="w-full rounded-lg border border-gray-200 pl-8 pr-3 py-2 text-sm outline-none focus:border-teal-400"
                          autoFocus
                        />
                      </div>
                      {playerResults.length > 0 && (
                        <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                          {playerResults.map((pr) => (
                            <button
                              key={pr.id}
                              type="button"
                              onClick={() => {
                                setPlayerIds((prev) => replacingIdx === -1
                                  ? (prev.includes(pr.id) ? prev : [...prev, pr.id])
                                  : prev.map((id, i) => i === replacingIdx ? pr.id : id))
                                setReplacingIdx(null)
                                setPlayerSearch('')
                                setPlayerResults([])
                              }}
                              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-teal-50 text-left"
                            >
                              <PlayerAvatar name={pr.name} avatarUrl={pr.avatar_url} size="sm" />
                              <span className="text-[13px] text-gray-800">{pr.name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {/* Invite a brand-new (non-PPA) player */}
                      {!invitingNew ? (
                        <button
                          type="button"
                          onClick={() => { setInvitingNew(true); setGuestName(playerSearch.trim()) }}
                          className="mt-2 w-full flex items-center gap-2 rounded-lg border border-dashed border-gray-200 px-2.5 py-2 text-left hover:border-teal-300 hover:bg-teal-50/30"
                        >
                          <UserPlus className="h-4 w-4 text-teal-600 flex-shrink-0" />
                          <span className="text-[12px] font-semibold text-gray-600">Not on PPA? Invite a new player</span>
                        </button>
                      ) : (
                        <div className="mt-2 rounded-lg bg-gray-50 border border-gray-200 p-3 space-y-2">
                          {isContactPickerSupported() && (
                            <button
                              type="button"
                              onClick={chooseGuestFromContacts}
                              className="w-full flex items-center justify-center gap-2 rounded-lg border border-teal-200 bg-white py-2 text-[12px] font-semibold text-teal-700"
                            >
                              <UserRound className="h-3.5 w-3.5" /> Choose from contacts
                            </button>
                          )}
                          <input
                            type="text"
                            value={guestName}
                            onChange={(e) => setGuestName(e.target.value)}
                            placeholder="New player's name"
                            autoFocus
                            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-teal-400"
                          />
                          <input
                            type="text"
                            value={guestContact}
                            onChange={(e) => setGuestContact(e.target.value)}
                            placeholder="Phone or email (optional)"
                            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-teal-400"
                          />
                          <p className="text-[11px] text-gray-400 leading-snug">We'll create an invite link and open the share sheet — send it via WhatsApp or Messages. They join the match when they sign up.</p>
                          {inviteGuestMutation.isError && (
                            <p className="text-[12px] text-red-500">Couldn't create the invite. Try again.</p>
                          )}
                          <button
                            type="button"
                            onClick={() => inviteGuestMutation.mutate()}
                            disabled={!guestName.trim() || inviteGuestMutation.isPending}
                            className="w-full rounded-lg bg-[#009688] py-2 text-[12px] font-bold text-white disabled:opacity-40"
                          >
                            {inviteGuestMutation.isPending ? 'Creating invite…' : 'Invite & share link'}
                          </button>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => { setReplacingIdx(null); setInvitingNew(false) }}
                        className="mt-2 text-[11px] text-gray-400 w-full text-center"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-[13px] font-medium text-gray-700 mb-1.5">
                    Notes <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Any details for the players…"
                    rows={2}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 resize-none"
                  />
                </div>

                {saveMutation.isError && (
                  <p className="text-[12px] text-red-500 text-center">Failed to save. Try again.</p>
                )}

                <button
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending || !date}
                  className="w-full rounded-2xl bg-[#009688] py-3.5 text-[14px] font-bold text-white disabled:opacity-40"
                >
                  {saveMutation.isPending ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
