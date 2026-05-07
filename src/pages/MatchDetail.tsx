import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, MapPin, Clock, Calendar, Share2, Edit2, LogOut, BookOpen, Trophy, CheckCircle, XCircle, BarChart2, CalendarPlus, Car, Navigation } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PlayerAvatar } from '@/components/shared/PlayerAvatar'
import { RecordResultSheet } from '@/components/play/RecordResultSheet'
import { EditMatchSheet } from '@/components/play/EditMatchSheet'
import { InvitePlayerSheet } from '@/components/play/InvitePlayerSheet'
import { AddToCalendarSheet } from '@/components/shared/AddToCalendarSheet'
import { cn } from '@/lib/utils'
import type { Match, MatchResult, Profile } from '@/lib/types'
import {
  getMatchTravelInfo,
  calculateDistance,
  driveMinutes,
  walkMinutes,
  formatDistance,
  type MatchTravelInfo,
} from '@/lib/travelUtils'

const TYPE_STYLES: Record<string, { label: string; className: string }> = {
  competitive: { label: 'Competitive', className: 'bg-orange-50 text-orange-600 border-orange-100' },
  friendly:    { label: 'Friendly',    className: 'bg-blue-50 text-blue-600 border-blue-100'     },
  casual:      { label: 'Casual',      className: 'bg-gray-50 text-gray-500 border-gray-100'     },
  group:       { label: 'Group',       className: 'bg-teal-50 text-teal-600 border-teal-100'     },
}

const STATUS_STYLES: Record<string, { label: string; className: string; dot: string }> = {
  confirmed:  { label: 'Confirmed',  className: 'bg-green-50 text-green-700 border-green-100',   dot: 'bg-green-400'  },
  scheduled:  { label: 'Confirmed',  className: 'bg-green-50 text-green-700 border-green-100',   dot: 'bg-green-400'  },
  open:       { label: 'Open',       className: 'bg-orange-50 text-orange-600 border-orange-100', dot: 'bg-orange-400' },
  pending:    { label: 'Pending',    className: 'bg-yellow-50 text-yellow-700 border-yellow-100', dot: 'bg-yellow-400' },
  completed:  { label: 'Completed',  className: 'bg-gray-50 text-gray-500 border-gray-100',      dot: 'bg-gray-400'   },
  cancelled:  { label: 'Cancelled',  className: 'bg-red-50 text-red-500 border-red-100',         dot: 'bg-red-400'    },
}

async function fetchMatchDetail(id: string): Promise<{
  match: Match
  players: Profile[]
  result: MatchResult | null
  confirmVoteCount: number
  myVote: string | null
}> {
  const { data: match, error } = await supabase
    .from('matches')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !match) throw error ?? new Error('Match not found')

  const playerIds: string[] = match.player_ids ?? []
  let players: Profile[] = []

  if (playerIds.length > 0) {
    const { data } = await supabase
      .from('profiles')
      .select('id, name, email, avatar_url, playtomic_level, ranking_points, internal_ranking')
      .in('id', playerIds)
    players = data ?? []
  }

  const { data: result } = await supabase
    .from('match_results')
    .select('*')
    .eq('match_id', id)
    .maybeSingle()

  let confirmVoteCount = 0
  let myVote: string | null = null

  if (result) {
    const { count } = await supabase
      .from('match_result_votes')
      .select('id', { count: 'exact', head: true })
      .eq('match_result_id', result.id)
      .eq('vote', 'confirm')
    confirmVoteCount = count ?? 0

    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: myVoteRow } = await supabase
        .from('match_result_votes')
        .select('vote')
        .eq('match_result_id', result.id)
        .eq('voter_id', user.id)
        .maybeSingle()
      myVote = myVoteRow?.vote ?? null
    }
  }

  return { match, players, result: result ?? null, confirmVoteCount, myVote }
}

// ── ELO helpers ───────────────────────────────────────────────────────────────

function calcWinProb(avgA: number, avgB: number): number {
  return 1 / (1 + Math.pow(10, (avgB - avgA) / 400))
}

interface EloPrediction {
  probA: number
  probB: number
  pointsIfAWins: number
  pointsIfBWins: number
}

function getEloPrediction(players: Profile[], team1Ids: string[], team2Ids: string[]): EloPrediction | null {
  const getElo = (id: string) => (players.find((p) => p.id === id) as Profile & { internal_ranking?: number })?.internal_ranking ?? 1500
  if (team1Ids.length < 2 || team2Ids.length < 2) return null
  const avgA = (getElo(team1Ids[0]) + getElo(team1Ids[1])) / 2
  const avgB = (getElo(team2Ids[0]) + getElo(team2Ids[1])) / 2
  const probA = calcWinProb(avgA, avgB)
  const probB = 1 - probA
  const K = 32
  return {
    probA,
    probB,
    pointsIfAWins: Math.round(K * probB),
    pointsIfBWins: Math.round(K * probA),
  }
}

function ResultBanner({ result, players }: { result: MatchResult; players: Profile[] }) {
  const getPlayer = (id: string) => players.find((p) => p.id === id)
  // sets_data may be stored as a JSON string in the DB — handle both key conventions
  const rawSets: Array<Record<string, unknown>> = (() => {
    const parsed = typeof result.sets_data === 'string'
      ? (() => { try { return JSON.parse(result.sets_data as unknown as string) } catch { return [] } })()
      : result.sets_data
    return Array.isArray(parsed) ? parsed : []
  })()
  const completedSets = rawSets
    .map((s) => ({
      team1: Number(s.team1 ?? s.team1_score ?? ''),
      team2: Number(s.team2 ?? s.team2_score ?? ''),
      tiebreak: s.tiebreak as { team1: number; team2: number } | undefined,
    }))
    .filter((s) => !isNaN(s.team1) && !isNaN(s.team2))

  return (
    <div className="mx-5 mb-4 rounded-2xl bg-gray-50 border border-gray-100 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Trophy className="h-4 w-4 text-[#009688]" />
        <p className="text-[12px] font-bold text-gray-700 uppercase tracking-wide">Result</p>
        <span className={cn(
          'ml-auto text-[10px] font-semibold rounded-full px-2 py-0.5 border',
          result.verification_status === 'verified'
            ? 'bg-green-50 text-green-700 border-green-100'
            : 'bg-yellow-50 text-yellow-700 border-yellow-100'
        )}>
          {result.verification_status === 'verified' ? 'Verified' : 'Pending'}
        </span>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 text-center">
          <div className="flex justify-center gap-1 mb-1">
            {result.team1_players.map((pid) => {
              const p = getPlayer(pid)
              return <PlayerAvatar key={pid} name={p?.name ?? null} avatarUrl={p?.avatar_url} size="sm" />
            })}
          </div>
          <p className="text-[11px] text-gray-500">
            {result.team1_players.map((pid) => getPlayer(pid)?.name?.split(' ')[0] ?? '?').join(' & ')}
          </p>
        </div>

        <div className="text-center">
          <div className="flex items-center gap-1.5">
            <span className={cn('text-[22px] font-black', result.result_type === 'team1_win' ? 'text-teal-700' : 'text-gray-400')}>
              {result.team1_score}
            </span>
            <span className="text-gray-300 text-sm">–</span>
            <span className={cn('text-[22px] font-black', result.result_type === 'team2_win' ? 'text-orange-600' : 'text-gray-400')}>
              {result.team2_score}
            </span>
          </div>
          {completedSets.length > 0 && (
            <p className="text-[10px] text-gray-400">
              {completedSets.map((s) => {
                const base = `${s.team1}-${s.team2}`
                return s.tiebreak ? `${base} (${s.tiebreak.team1}-${s.tiebreak.team2})` : base
              }).join('  ')}
            </p>
          )}
        </div>

        <div className="flex-1 text-center">
          <div className="flex justify-center gap-1 mb-1">
            {result.team2_players.map((pid) => {
              const p = getPlayer(pid)
              return <PlayerAvatar key={pid} name={p?.name ?? null} avatarUrl={p?.avatar_url} size="sm" />
            })}
          </div>
          <p className="text-[11px] text-gray-500">
            {result.team2_players.map((pid) => getPlayer(pid)?.name?.split(' ')[0] ?? '?').join(' & ')}
          </p>
        </div>
      </div>
    </div>
  )
}

export function MatchDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [showRecordResult, setShowRecordResult] = useState(false)
  const [showEdit, setShowEdit]               = useState(false)
  const [showInvite, setShowInvite]           = useState(false)
  const [showCalendar, setShowCalendar]       = useState(false)
  const [copied, setCopied]                   = useState(false)
  const [confirmLeave, setConfirmLeave]       = useState(false)
  const [leaving, setLeaving]                 = useState(false)
  const [voteSubmitted, setVoteSubmitted]     = useState(false)
  const [showDisputeInput, setShowDisputeInput] = useState(false)
  const [disputeReason, setDisputeReason]     = useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['match', id],
    queryFn: () => fetchMatchDetail(id!),
    enabled: !!id,
  })

  // Travel coordination
  const { data: travelInfo } = useQuery<MatchTravelInfo | null>({
    queryKey: ['match-travel', id, data?.match?.poll_id],
    enabled: !!data?.match && (data.match.player_ids?.length ?? 0) > 0,
    queryFn: () => getMatchTravelInfo(
      data!.match.id,
      data!.match.player_ids ?? [],
      data!.match.poll_id,
    ),
  })

  // Venue location (fetch lat/lng from padel_venues)
  const { data: venueLatLng } = useQuery<{ latitude: number; longitude: number } | null>({
    queryKey: ['venue-latlng', data?.match?.booked_venue_name],
    enabled: !!data?.match?.booked_venue_name,
    queryFn: async () => {
      const { data: venue } = await supabase
        .from('padel_venues')
        .select('latitude, longitude')
        .ilike('venue_name', `%${data!.match.booked_venue_name!}%`)
        .limit(1)
        .maybeSingle()
      if (!venue?.latitude || !venue?.longitude) return null
      return { latitude: venue.latitude, longitude: venue.longitude }
    },
  })

  // User's own profile location for distance calculations
  const { data: myLocation } = useQuery<{ latitude: number | null; longitude: number | null } | null>({
    queryKey: ['my-location', profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data: p } = await supabase
        .from('profiles')
        .select('latitude, longitude')
        .eq('id', profile!.id)
        .single()
      return p ?? null
    },
  })

  // Travel request mutation
  const requestLiftMutation = useMutation({
    mutationFn: async ({ driverId }: { driverId: string }) => {
      const { error } = await supabase.from('travel_requests').insert({
        match_id:     id,
        requester_id: profile?.id,
        driver_id:    driverId,
        status:       'pending',
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['match-travel', id] })
      queryClient.invalidateQueries({ queryKey: ['travel-requests', id] })
    },
  })

  // Existing travel requests for this match
  const { data: myTravelRequests = [] } = useQuery<Array<{ driver_id: string; status: string }>>({
    queryKey: ['travel-requests', id, profile?.id],
    enabled: !!id && !!profile?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('travel_requests')
        .select('driver_id, status')
        .eq('match_id', id)
        .eq('requester_id', profile!.id)
      return data ?? []
    },
  })

  const updateTravelRequestMutation = useMutation({
    mutationFn: async ({ requesterId, status }: { requesterId: string; status: 'accepted' | 'declined' }) => {
      const { error } = await supabase
        .from('travel_requests')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('match_id', id)
        .eq('requester_id', requesterId)
        .eq('driver_id', profile?.id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['match-travel', id] }),
  })

  // Incoming lift requests (driver's view)
  const { data: incomingRequests = [] } = useQuery<Array<{ id: string; requester_id: string; status: string; requesterName?: string }>>({
    queryKey: ['incoming-travel-requests', id, profile?.id],
    enabled: !!id && !!profile?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('travel_requests')
        .select('id, requester_id, status')
        .eq('match_id', id)
        .eq('driver_id', profile!.id)
        .eq('status', 'pending')
      if (!data || data.length === 0) return []
      const requesterIds = data.map((r) => r.requester_id)
      const { data: names } = await supabase
        .from('profiles')
        .select('id, name')
        .in('id', requesterIds)
      const nameMap: Record<string, string> = {}
      for (const p of names ?? []) nameMap[p.id] = p.name
      return data.map((r) => ({ ...r, requesterName: nameMap[r.requester_id] ?? 'Player' }))
    },
  })

  // Auto-open result sheet from navigation state (must be before early returns)
  useEffect(() => {
    if (!data || !profile?.id) return
    const match = data.match
    const playerIds = match.player_ids ?? []
    const isParticipant = playerIds.includes(profile.id)
    const guestNames = match.notes?.match(/Guests?: (.+)/)?.[1]?.split(',').map((n: string) => n.trim()) ?? []
    const effectiveCount = playerIds.length + guestNames.length
    const canRecord = isParticipant && match.status !== 'completed' && match.status !== 'cancelled' && effectiveCount >= 4 && !data.result
    if ((location.state as any)?.openResult && canRecord) {
      setShowRecordResult(true)
      window.history.replaceState({}, document.title)
    }
  }, [data, location.state, profile?.id])

  const voteMutation = useMutation({
    mutationFn: async ({ vote, reason }: { vote: 'confirm' | 'dispute'; reason?: string }) => {
      const result = data?.result
      if (!result || !profile?.id) return
      await supabase.from('match_result_votes').insert({
        match_result_id: result.id,
        voter_id: profile.id,
        vote,
        ...(reason ? { dispute_reason: reason } : {}),
      })
      if (vote === 'confirm') {
        // Check if opposing team has now fully confirmed
        const submittedBy = result.submitted_by ?? ''
        const opposingTeam = result.team1_players?.includes(submittedBy)
          ? result.team2_players : result.team1_players
        const { count } = await supabase
          .from('match_result_votes')
          .select('id', { count: 'exact', head: true })
          .eq('match_result_id', result.id)
          .in('voter_id', opposingTeam ?? [])
          .eq('vote', 'confirm')
        if ((count ?? 0) >= (opposingTeam ?? []).length) {
          await supabase
            .from('match_results')
            .update({ verification_status: 'verified' })
            .eq('id', result.id)
          // Trigger ELO processing
          try {
            await supabase.functions.invoke('process-elo', {
              body: { match_result_id: result.id },
            })
          } catch { /* non-blocking */ }
        }
      } else {
        await supabase
          .from('match_results')
          .update({ verification_status: 'disputed' })
          .eq('id', result.id)
      }
    },
    onSuccess: () => {
      if (navigator.vibrate) navigator.vibrate(10)
      setVoteSubmitted(true)
      setShowDisputeInput(false)
      queryClient.invalidateQueries({ queryKey: ['match', id] })
    },
  })

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#009688] border-t-transparent" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
        <p className="text-[14px] text-gray-500">Match not found.</p>
        <button onClick={() => navigate(-1)} className="text-[13px] text-[#009688] font-semibold">Go back</button>
      </div>
    )
  }

  const { match, players, result, confirmVoteCount, myVote } = data

  // Venue distance from user's location
  const venueDistance = (() => {
    if (!myLocation?.latitude || !myLocation?.longitude) return null
    if (!venueLatLng?.latitude || !venueLatLng?.longitude) return null
    return calculateDistance(
      myLocation.latitude, myLocation.longitude,
      venueLatLng.latitude, venueLatLng.longitude,
    )
  })()

  const googleMapsUrl = match.booked_venue_name
    ? `https://maps.google.com/?q=${encodeURIComponent(match.booked_venue_name)}`
    : null
  const currentUserId = profile?.id ?? ''
  const playerIds     = match.player_ids ?? []
  const isParticipant = playerIds.includes(currentUserId)
  // Creator: created_by field, or fallback to first player when created_by is null
  const isCreator     = match.created_by
    ? match.created_by === currentUserId
    : playerIds[0] === currentUserId
  // Any participant can edit, regardless of how they navigated here
  const canEdit       = (isParticipant || playerIds.length === 0) &&
                        match.status !== 'completed' && match.status !== 'cancelled'
  const guestNamesForCount = match.notes?.match(/Guests?: (.+)/)?.[1]?.split(',').map(n => n.trim()) ?? []
  const effectivePlayerCount = playerIds.length + guestNamesForCount.length
  const canRecordResult = isParticipant && match.status !== 'completed' && match.status !== 'cancelled' && effectivePlayerCount >= 4 && !result

  const typeStyle   = TYPE_STYLES[match.match_type ?? 'group'] ?? TYPE_STYLES.group
  const statusStyle = STATUS_STYLES[match.status] ?? { label: match.status, className: 'bg-gray-50 text-gray-500 border-gray-100', dot: 'bg-gray-300' }

  const formattedDate = (() => {
    try { return format(parseISO(match.match_date), 'EEEE, d MMMM yyyy') } catch { return match.match_date }
  })()

  // Calendar event
  const calendarEvent = match.match_date && match.match_time ? (() => {
    const opponentNames = players
      .filter((p) => p.id !== currentUserId)
      .map((p) => p.name.split(' ')[0])
      .join(' & ')
    const start = new Date(`${match.match_date}T${match.match_time}`)
    return {
      title:    `Padel Match${opponentNames ? ` vs ${opponentNames}` : ''}`,
      start,
      end:      new Date(start.getTime() + 90 * 60 * 1000),
      location: match.booked_venue_name ?? '',
    }
  })() : null

  const handleShare = async () => {
    const url   = `${window.location.origin}/matches/${id}`
    const venue = match.booked_venue_name ?? 'TBC'
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Padel Match', text: `Join my padel match on ${formattedDate} at ${venue}`, url })
      } catch { /* user cancelled */ }
    } else {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleLeave = async () => {
    if (!data) return
    setLeaving(true)
    const newPlayerIds = data.match.player_ids.filter((pid) => pid !== currentUserId)
    const { error } = await supabase
      .from('matches')
      .update({
        player_ids: newPlayerIds,
        ...(newPlayerIds.length < 4 ? { status: 'pending' } : {}),
      })
      .eq('id', data.match.id)
    setLeaving(false)
    setConfirmLeave(false)
    if (!error) {
      if (navigator.vibrate) navigator.vibrate(10)
      queryClient.invalidateQueries({ queryKey: ['match', id] })
      queryClient.invalidateQueries({ queryKey: ['home-next-match'] })
      queryClient.invalidateQueries({ queryKey: ['matches'] })
      queryClient.invalidateQueries({ queryKey: ['play-matches'] })
      navigate('/home')
    }
  }

  // Parse guest names stored in notes as "Guests: Name1, Name2"
  const guestNames = match.notes
    ?.match(/Guests: (.+)/)?.[1]
    ?.split(', ') ?? []

  const SLOT_COUNT = 4
  const slots = Array.from({ length: SLOT_COUNT }, (_, i) => {
    const pid = match.player_ids[i]
    if (pid) return players.find((p) => p.id === pid) ?? { id: pid, name: 'Unknown', email: '' }
    const guestIndex = i - match.player_ids.length
    if (guestIndex >= 0 && guestIndex < guestNames.length) {
      return { id: `guest_${i}`, name: guestNames[guestIndex], email: '', isGuest: true as const }
    }
    return null
  })

  // Notes excluding Guests line
  const displayNotes = match.notes
    ?.split('\n')
    .filter((line) => !line.startsWith('Guests:'))
    .join('\n')
    .trim()

  return (
    <div className="min-h-full bg-white pb-6">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-14 pb-4">
        <button
          onClick={() => navigate(-1)}
          className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0"
        >
          <ChevronLeft className="h-5 w-5 text-gray-600" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-[18px] font-bold text-gray-900 leading-tight">Match</h1>
          <p className="text-[12px] text-gray-400 truncate">{formattedDate}</p>
        </div>
      </div>

      {/* Meta card */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-5 mb-4 rounded-2xl border border-gray-100 bg-gray-50 p-4"
      >
        <div className="flex flex-wrap gap-1.5 mb-3">
          <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold', typeStyle.className)}>
            {typeStyle.label}
          </span>
          <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold', statusStyle.className)}>
            <span className={cn('h-1.5 w-1.5 rounded-full', statusStyle.dot)} />
            {statusStyle.label}
          </span>
        </div>

        <div className="flex items-center gap-2 mb-2">
          <Calendar className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <p className="text-[13px] text-gray-700 font-medium">{formattedDate}</p>
        </div>
        {match.match_time && (
          <div className="flex items-center gap-2 mb-2">
            <Clock className="h-4 w-4 text-gray-400 flex-shrink-0" />
            <p className="text-[13px] text-gray-700">{match.match_time.slice(0, 5)}</p>
          </div>
        )}
        {match.booked_venue_name && (
          <div className="flex items-start gap-2 mb-2">
            <MapPin className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] text-gray-700 truncate">
                {match.booked_venue_name}
                {match.booked_court_number != null && ` · Court ${match.booked_court_number}`}
              </p>
              {venueDistance != null && (
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {formatDistance(venueDistance)} away · ~{driveMinutes(venueDistance)} min drive · ~{walkMinutes(venueDistance)} min walk
                </p>
              )}
            </div>
            {googleMapsUrl && (
              <a
                href={googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0 flex items-center gap-1 rounded-lg bg-blue-50 border border-blue-100 px-2 py-1 text-[11px] font-semibold text-blue-600"
              >
                <Navigation className="h-3 w-3" />
                Directions
              </a>
            )}
          </div>
        )}
        {displayNotes && (
          <p className="mt-2 text-[12px] text-gray-500 italic">{displayNotes}</p>
        )}
      </motion.div>

      {/* Result banner */}
      {result && <ResultBanner result={result} players={players} />}

      {/* 4-players-ready banner (creator, not yet booked, no result) */}
      {isCreator && match.player_ids.length === 4 && !result && match.status !== 'completed' && match.status !== 'cancelled' && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-5 mb-4 rounded-2xl bg-green-50 border border-green-200 px-4 py-3"
        >
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
            <p className="text-[13px] font-bold text-green-800">All 4 players confirmed!</p>
          </div>
          <div className="flex gap-2">
            {!match.booked_venue_name && (
              <button
                onClick={() => navigate(`/play/book-court?match_id=${match.id}&date=${match.match_date}&time=${match.match_time ?? ''}`)}
                className="flex-1 rounded-xl bg-green-600 py-2 text-[12px] font-bold text-white"
              >
                Book a Court
              </button>
            )}
            <button
              onClick={() => setShowRecordResult(true)}
              className="flex-1 rounded-xl border border-green-200 py-2 text-[12px] font-semibold text-green-700"
            >
              Record result
            </button>
          </div>
        </motion.div>
      )}

      {/* Open match progress bar */}
      {match.player_ids.length < 4 && match.status !== 'completed' && match.status !== 'cancelled' && (
        <div className="mx-5 mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[11px] font-semibold text-gray-500">{match.player_ids.length} of 4 players joined</p>
            {isCreator && (
              <button
                onClick={() => setShowInvite(true)}
                className="text-[11px] font-semibold text-[#009688]"
              >
                + Invite players
              </button>
            )}
          </div>
          <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-[#009688] transition-all"
              style={{ width: `${(match.player_ids.length / 4) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Players */}
      <div className="px-5 mb-4">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2">Players</p>
        <div className="grid grid-cols-2 gap-2">
          {slots.map((player, i) => {
            const isClickable = player && player.id !== currentUserId && !('isGuest' in player && player.isGuest) && !player.id.startsWith('guest_')
            return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              onClick={isClickable ? () => navigate(`/players/${player.id}`) : undefined}
              className={cn(
                'flex items-center gap-2.5 rounded-xl border px-3 py-2.5',
                player ? 'border-gray-100 bg-white' : 'border-dashed border-gray-200 bg-gray-50',
                isClickable ? 'cursor-pointer hover:border-teal-200 hover:bg-teal-50/20 active:scale-[0.98] transition-all' : ''
              )}
            >
              {player ? (
                <>
                  <PlayerAvatar
                    name={player.name}
                    avatarUrl={'isGuest' in player && player.isGuest ? null : ('avatar_url' in player ? player.avatar_url : undefined)}
                    size="sm"
                    badge={player.id === currentUserId ? '★' : undefined}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-semibold text-gray-800 truncate">{player.name}</p>
                    {'internal_ranking' in player && player.internal_ranking != null ? (
                      <p className="text-[10px] text-gray-400">{(player.internal_ranking as number).toLocaleString()} ELO</p>
                    ) : 'ranking_points' in player && player.ranking_points != null ? (
                      <p className="text-[10px] text-gray-400">{player.ranking_points} pts</p>
                    ) : null}
                  </div>
                  {player.id === currentUserId && (
                    <span className="text-[9px] font-bold text-[#009688] bg-teal-50 px-1.5 py-0.5 rounded-full flex-shrink-0">You</span>
                  )}
                  {'isGuest' in player && player.isGuest && (
                    <span className="text-[9px] font-bold text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded-full flex-shrink-0">Guest</span>
                  )}
                </>
              ) : (
                <>
                  <div className="h-7 w-7 rounded-full border-2 border-dashed border-gray-200 bg-white flex items-center justify-center flex-shrink-0">
                    <span className="text-[10px] text-gray-300">+</span>
                  </div>
                  {isCreator && match.status !== 'completed' && match.status !== 'cancelled' ? (
                    <button
                      onClick={() => setShowInvite(true)}
                      className="text-[11px] text-teal-600 font-semibold"
                    >
                      Invite player
                    </button>
                  ) : (
                    <p className="text-[11px] text-gray-400 italic">Waiting…</p>
                  )}
                </>
              )}
            </motion.div>
          )
          })}
        </div>
      </div>

      {/* ELO Prediction */}
      {!result && playerIds.length === 4 && (() => {
        const team1Ids = playerIds.slice(0, 2)
        const team2Ids = playerIds.slice(2, 4)
        const pred = getEloPrediction(players, team1Ids, team2Ids)
        if (!pred) return null
        const getEloFor = (id: string) => (players.find((p) => p.id === id) as any)?.internal_ranking ?? 1500
        const avgA = Math.round((getEloFor(team1Ids[0]) + getEloFor(team1Ids[1])) / 2)
        const avgB = Math.round((getEloFor(team2Ids[0]) + getEloFor(team2Ids[1])) / 2)
        const meOnTeam1 = team1Ids.includes(currentUserId)
        const pointsIfWin  = meOnTeam1 ? pred.pointsIfAWins  : pred.pointsIfBWins
        const pointsIfLose = meOnTeam1 ? pred.pointsIfBWins  : pred.pointsIfAWins
        const isEven = Math.abs(pred.probA - 0.5) < 0.03
        const t1Names = team1Ids.map(id => players.find(p => p.id === id)?.name?.split(' ')[0] ?? '?').join(' + ')
        const t2Names = team2Ids.map(id => players.find(p => p.id === id)?.name?.split(' ')[0] ?? '?').join(' + ')
        return (
          <div className="px-5 mb-4">
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
              <div className="flex items-center gap-2 mb-3">
                <BarChart2 className="h-4 w-4 text-[#009688]" />
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Match Prediction</p>
              </div>
              {isEven ? (
                <div className="text-center py-1">
                  <p className="text-[22px] font-black text-gray-600">50% — 50%</p>
                  <p className="text-[12px] font-semibold text-gray-500 mt-1">Equal teams</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">Both teams have similar ELO ratings. This will be a closely contested match!</p>
                  <div className="flex justify-center gap-3 mt-2 text-[11px] text-gray-500">
                    <span>{t1Names}: <strong>{avgA.toLocaleString()} ELO</strong></span>
                    <span>·</span>
                    <span>{t2Names}: <strong>{avgB.toLocaleString()} ELO</strong></span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="flex-1 text-center">
                    <p className="text-[24px] font-black text-teal-600">{Math.round(pred.probA * 100)}%</p>
                    <p className="text-[10px] text-gray-500 font-semibold mb-0.5">{t1Names}</p>
                    <p className="text-[11px] text-teal-700 font-semibold">avg {avgA.toLocaleString()} ELO</p>
                    <p className="text-[10px] text-teal-500">+{pred.pointsIfAWins} if win</p>
                  </div>
                  <div className="text-center px-1">
                    <p className="text-[12px] text-gray-300 font-bold">vs</p>
                  </div>
                  <div className="flex-1 text-center">
                    <p className="text-[24px] font-black text-orange-500">{Math.round(pred.probB * 100)}%</p>
                    <p className="text-[10px] text-gray-500 font-semibold mb-0.5">{t2Names}</p>
                    <p className="text-[11px] text-orange-600 font-semibold">avg {avgB.toLocaleString()} ELO</p>
                    <p className="text-[10px] text-orange-400">+{pred.pointsIfBWins} if win</p>
                  </div>
                </div>
              )}
              {!isEven && (
                <div className="mt-3 h-2 rounded-full bg-gray-200 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-teal-500 to-orange-400 transition-all"
                    style={{ width: `${Math.round(pred.probA * 100)}%` }}
                  />
                </div>
              )}
              {(meOnTeam1 || team2Ids.includes(currentUserId)) && (
                <div className="mt-2 flex gap-2 justify-center">
                  <span className="text-[10px] font-semibold text-green-600 bg-green-50 rounded-full px-2 py-0.5">
                    Win: +{pointsIfWin} ELO
                  </span>
                  <span className="text-[10px] font-semibold text-red-500 bg-red-50 rounded-full px-2 py-0.5">
                    Lose: −{pointsIfLose} ELO
                  </span>
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {/* Verification card */}
      {result && (result.verification_status === 'pending' || result.verification_status === 'disputed') && isParticipant && (() => {
        const submittedBy = result.submitted_by ?? ''
        const submittingTeam = result.team1_players?.includes(submittedBy) ? result.team1_players : result.team2_players
        const opposingTeam = result.team1_players?.includes(submittedBy) ? result.team2_players : result.team1_players
        const isOnSubmittingTeam = submittingTeam?.includes(currentUserId)
        const opposingNeeded = (opposingTeam ?? []).length
        // confirmVoteCount already fetched from server
        const opposingConfirmed = Math.max(0, confirmVoteCount - (submittingTeam ?? []).length)
        return (
        <div className="px-5 mb-4">
          {isOnSubmittingTeam ? (
            <div className="rounded-2xl border border-green-100 bg-green-50 p-3 text-center">
              <p className="text-[13px] font-semibold text-green-700">You submitted this result</p>
              <p className="text-[11px] text-gray-400 mt-1">
                Waiting for opponents to verify ({opposingConfirmed}/{opposingNeeded})
              </p>
            </div>
          ) : voteSubmitted || myVote ? (
            <div className={cn(
              'rounded-2xl border p-3 text-center',
              myVote === 'dispute' ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'
            )}>
              <p className={cn('text-[13px] font-semibold', myVote === 'dispute' ? 'text-red-700' : 'text-green-700')}>
                {myVote === 'dispute' ? 'You disputed this result' : 'Vote submitted · thank you'}
              </p>
              <p className="text-[11px] text-gray-400 mt-1">{opposingConfirmed}/{opposingNeeded} opponents verified</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-yellow-100 bg-yellow-50 p-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[13px] font-bold text-gray-800">Verify this result?</p>
                <span className="text-[11px] text-gray-500">{opposingConfirmed}/{opposingNeeded} opponents</span>
              </div>
              <div className="h-1.5 rounded-full bg-yellow-200 mb-3 overflow-hidden">
                <div className="h-full rounded-full bg-[#009688] transition-all" style={{ width: `${(opposingConfirmed / Math.max(opposingNeeded, 1)) * 100}%` }} />
              </div>
              <p className="text-[12px] text-gray-500 mb-3">
                {result.team1_score}–{result.team2_score} ·{' '}
                {result.result_type === 'team1_win'
                  ? `${result.team1_players?.map((pid: string) => players.find(p => p.id === pid)?.name?.split(' ')[0] ?? '?').join(' + ')} win`
                  : `${result.team2_players?.map((pid: string) => players.find(p => p.id === pid)?.name?.split(' ')[0] ?? '?').join(' + ')} win`}
              </p>
              {showDisputeInput ? (
                <div>
                  <textarea
                    value={disputeReason}
                    onChange={(e) => setDisputeReason(e.target.value)}
                    placeholder="Describe the issue (optional)"
                    className="w-full rounded-xl border border-red-200 bg-white px-3 py-2 text-[13px] text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-red-300 mb-2 resize-none"
                    rows={3}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowDisputeInput(false)}
                      className="flex-1 rounded-xl border border-gray-200 py-2 text-[13px] font-semibold text-gray-600"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => voteMutation.mutate({ vote: 'dispute', reason: disputeReason })}
                      disabled={voteMutation.isPending}
                      className="flex-1 rounded-xl bg-red-500 py-2 text-[13px] font-bold text-white disabled:opacity-50"
                    >
                      Submit Dispute
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => voteMutation.mutate({ vote: 'confirm' })}
                    disabled={voteMutation.isPending}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-white border border-green-200 py-2.5 text-[13px] font-semibold text-green-700 disabled:opacity-50"
                  >
                    <CheckCircle className="h-4 w-4" />
                    Confirm
                  </button>
                  <button
                    onClick={() => setShowDisputeInput(true)}
                    disabled={voteMutation.isPending}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-white border border-red-200 py-2.5 text-[13px] font-semibold text-red-600 disabled:opacity-50"
                  >
                    <XCircle className="h-4 w-4" />
                    Dispute
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        )
      })()}

      {/* Getting there */}
      {match.status !== 'completed' && match.status !== 'cancelled' && (playerIds.length > 0 || match.booked_venue_name) && (
        <div className="px-5 mb-4">
          <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Car className="h-4 w-4 text-[#009688]" />
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Getting there</p>
            </div>

            {/* Incoming lift requests (driver sees) — always shown */}
            {incomingRequests.length > 0 && (
              <div className="mb-3">
                <p className="text-[11px] font-semibold text-gray-500 mb-2">Lift requests</p>
                <div className="space-y-2">
                  {incomingRequests.map((req) => (
                    <div key={req.id} className="flex items-center justify-between rounded-xl border border-orange-100 bg-orange-50 px-3 py-2">
                      <p className="text-[12px] font-semibold text-orange-800">{req.requesterName} wants a lift</p>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => updateTravelRequestMutation.mutate({ requesterId: req.requester_id, status: 'accepted' })}
                          className="rounded-lg bg-[#009688] px-2.5 py-1 text-[11px] font-bold text-white"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => updateTravelRequestMutation.mutate({ requesterId: req.requester_id, status: 'declined' })}
                          className="rounded-lg bg-white border border-gray-200 px-2.5 py-1 text-[11px] font-semibold text-gray-600"
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Drivers — shown whenever poll travel data is available */}
            {(travelInfo?.drivers.length ?? 0) > 0 && (
              <div className="mb-3">
                <p className="text-[11px] font-semibold text-gray-500 mb-2">Drivers</p>
                <div className="space-y-1.5">
                  {travelInfo!.drivers.map((driver) => (
                    <div key={driver.id} className="flex items-center gap-2.5">
                      <PlayerAvatar name={driver.name} avatarUrl={driver.avatar_url} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-semibold text-gray-800 truncate">{driver.name} is driving</p>
                        <p className="text-[11px] text-gray-400">Can take {driver.max_passengers} passengers</p>
                      </div>
                      <span className="flex-shrink-0 rounded-full bg-teal-50 border border-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-600">Driver</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Needs a lift */}
            {(travelInfo?.needsLift.length ?? 0) > 0 && (
              <div className={(travelInfo?.drivers.length ?? 0) > 0 ? '' : 'mb-2'}>
                <p className="text-[11px] font-semibold text-gray-500 mb-2">Need a lift</p>
                <div className="space-y-1.5">
                  {travelInfo!.needsLift.map((passenger) => {
                    const suggestion = travelInfo!.suggestions.find((s) => s.passenger.id === passenger.id)
                    const existingRequest = myTravelRequests.find((r) => r.driver_id === suggestion?.driver.id)
                    const isMe = passenger.id === profile?.id

                    return (
                      <div key={passenger.id} className="flex items-center gap-2.5">
                        <PlayerAvatar name={passenger.name} avatarUrl={passenger.avatar_url} size="sm" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-semibold text-gray-800 truncate">{passenger.name}</p>
                          {suggestion && travelInfo?.hasLocationData && (
                            <p className="text-[11px] text-gray-400">
                              {formatDistance(suggestion.distanceMiles)} from {suggestion.driver.name.split(' ')[0]}
                            </p>
                          )}
                        </div>
                        {isMe && suggestion && (
                          <button
                            onClick={() => { if (!existingRequest) requestLiftMutation.mutate({ driverId: suggestion.driver.id }) }}
                            disabled={!!existingRequest || requestLiftMutation.isPending}
                            className={cn(
                              'flex-shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors',
                              existingRequest?.status === 'accepted'
                                ? 'bg-green-50 border border-green-100 text-green-600'
                                : existingRequest?.status === 'pending'
                                ? 'bg-gray-100 text-gray-400'
                                : 'bg-[#009688] text-white hover:bg-teal-700',
                            )}
                          >
                            {existingRequest?.status === 'accepted' ? 'Lift confirmed' :
                             existingRequest?.status === 'pending' ? 'Requested' :
                             `Ask ${suggestion.driver.name.split(' ')[0]}`}
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* No location data — prompt to enable */}
            {!travelInfo?.hasLocationData && (travelInfo?.drivers.length ?? 0) === 0 && (
              <div className="text-center py-1">
                <p className="text-[12px] text-gray-500 mb-2">Enable location to coordinate lifts</p>
                <button
                  onClick={() => {
                    if (!navigator.geolocation || !profile?.id) return
                    navigator.geolocation.getCurrentPosition(async (pos) => {
                      await supabase.from('profiles').update({
                        latitude:  pos.coords.latitude,
                        longitude: pos.coords.longitude,
                      }).eq('id', profile.id)
                      queryClient.invalidateQueries({ queryKey: ['match-travel', id] })
                      queryClient.invalidateQueries({ queryKey: ['my-location', profile.id] })
                    })
                  }}
                  className="rounded-xl bg-[#009688] px-4 py-2 text-[12px] font-bold text-white"
                >
                  Enable location
                </button>
              </div>
            )}

            {/* Nothing to show at all */}
            {(travelInfo?.drivers.length ?? 0) === 0 &&
             (travelInfo?.needsLift.length ?? 0) === 0 &&
             travelInfo?.hasLocationData && (
              <p className="text-[12px] text-gray-400 text-center py-1">No travel info yet</p>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="px-5 flex flex-col gap-2">
        {canRecordResult && (
          <button
            onClick={() => setShowRecordResult(true)}
            className="w-full flex items-center justify-center gap-2 rounded-2xl bg-[#009688] py-3.5 text-[14px] font-bold text-white"
          >
            <Trophy className="h-4 w-4" />
            Record Result
          </button>
        )}

        <div className="grid grid-cols-2 gap-2">
          {!match.booked_venue_name && match.status !== 'completed' && match.status !== 'cancelled' && isParticipant && (
            <button
              onClick={() => navigate(`/play/book-court?match_id=${match.id}&date=${match.match_date}&time=${match.match_time ?? ''}`)}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 py-3 text-[13px] font-semibold text-teal-700"
            >
              <BookOpen className="h-4 w-4" />
              Book Court
            </button>
          )}
          {canEdit && (
            <button
              onClick={() => setShowEdit(true)}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 py-3 text-[13px] font-semibold text-gray-700"
            >
              <Edit2 className="h-4 w-4" />
              Edit Match
            </button>
          )}
          {isParticipant && !isCreator && match.status !== 'completed' && match.status !== 'cancelled' && (
            <button
              onClick={() => setConfirmLeave(true)}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-red-100 py-3 text-[13px] font-semibold text-red-500"
            >
              <LogOut className="h-4 w-4" />
              Leave
            </button>
          )}
          {calendarEvent && (
            <button
              onClick={() => setShowCalendar(true)}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 py-3 text-[13px] font-semibold text-gray-700"
            >
              <CalendarPlus className="h-4 w-4" />
              Add to Calendar
            </button>
          )}
          <button
            onClick={handleShare}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 py-3 text-[13px] font-semibold text-gray-700"
          >
            <Share2 className="h-4 w-4" />
            Share
          </button>
        </div>
      </div>

      {/* Sheets */}
      <RecordResultSheet
        open={showRecordResult}
        onClose={() => setShowRecordResult(false)}
        match={match}
        players={players}
        currentUserId={currentUserId}
      />

      <EditMatchSheet
        open={showEdit}
        onClose={() => setShowEdit(false)}
        match={match}
      />

      <InvitePlayerSheet
        open={showInvite}
        onClose={() => setShowInvite(false)}
        matchId={match.id}
        currentPlayerIds={match.player_ids}
      />

      {calendarEvent && (
        <AddToCalendarSheet
          open={showCalendar}
          onClose={() => setShowCalendar(false)}
          event={calendarEvent}
        />
      )}

      {/* Leave confirm dialog */}
      <AnimatePresence>
        {confirmLeave && (
          <>
            <motion.div
              className="fixed inset-0 z-[55] bg-black/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfirmLeave(false)}
            />
            <motion.div
              className="fixed bottom-0 left-0 right-0 z-[60] bg-white rounded-t-3xl px-5 pt-6"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              style={{ paddingBottom: 'calc(32px + env(safe-area-inset-bottom))' }}
            >
              <div className="flex justify-center mb-5">
                <div className="h-10 w-10 rounded-full bg-red-50 flex items-center justify-center">
                  <LogOut className="h-5 w-5 text-red-500" />
                </div>
              </div>
              <p className="text-[16px] font-bold text-gray-900 text-center mb-2">Leave this match?</p>
              <p className="text-[13px] text-gray-500 text-center mb-6">
                Your spot will become available to other players.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmLeave(false)}
                  className="flex-1 rounded-2xl border border-gray-200 py-3 text-[14px] font-semibold text-gray-700"
                >
                  Cancel
                </button>
                <button
                  onClick={handleLeave}
                  disabled={leaving}
                  className="flex-1 rounded-2xl bg-red-500 py-3 text-[14px] font-bold text-white disabled:opacity-60"
                >
                  {leaving ? 'Leaving…' : 'Leave Match'}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* "Link copied" toast */}
      <AnimatePresence>
        {copied && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="fixed bottom-28 left-1/2 -translate-x-1/2 z-[70] bg-gray-900 text-white text-[13px] font-medium px-4 py-2 rounded-full shadow-lg pointer-events-none"
          >
            Link copied!
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
