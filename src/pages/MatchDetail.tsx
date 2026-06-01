import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, MapPin, Clock, Calendar, Share2, Edit2, LogOut, BookOpen, Trophy, CheckCircle, XCircle, BarChart2, CalendarPlus, Car, Navigation, Shuffle, Ban, Trash2, Play, Users } from 'lucide-react'
import { toast } from 'sonner'
import { format, parseISO, addHours, isBefore } from 'date-fns'
import { useDateLocale } from '@/lib/dateLocale'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useIsGroupAdmin } from '@/hooks/useIsGroupAdmin'
import { useMatchSubscription } from '@/hooks/useRealtimeSubscription'
import { PlayerAvatar } from '@/components/shared/PlayerAvatar'
import { ReportButton } from '@/components/shared/ReportButton'
import { RecordResultSheet } from '@/components/play/RecordResultSheet'
import { EditMatchSheet } from '@/components/play/EditMatchSheet'
import { SelfReportBookingSheet } from '@/components/play/SelfReportBookingSheet'
import { AskRingersSheet } from '@/components/match/AskRingersSheet'
import { AskNetworkSheet } from '@/components/match/AskNetworkSheet'
import { PeerVotingSheet } from '@/components/match/PeerVotingSheet'
import { PEER_VOTE_CATEGORIES } from '@/lib/achievements'
import { PushToOpenSheet } from '@/components/match/PushToOpenSheet'
import { InvitePlayerSheet } from '@/components/play/InvitePlayerSheet'
import { AddToCalendarSheet } from '@/components/shared/AddToCalendarSheet'
import { cn } from '@/lib/utils'
import type { Match, MatchResult, Profile } from '@/lib/types'
import { calculateMatchPrediction, PAIRINGS, pairingToTeams, findPairingIndex } from '@/lib/predictions'
import { previewMatchOutcomes } from '@/lib/eloPreview'
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
  myVote: string | null
  disputeInfo: { voterName: string; reason: string | null } | null
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
      .select('id, name, email, avatar_url, playtomic_level, ranking_points, internal_ranking, matches_played')
      .in('id', playerIds)
    players = data ?? []
  }

  const { data: result } = await supabase
    .from('match_results')
    .select('*')
    .eq('match_id', id)
    .maybeSingle()

  let myVote: string | null = null
  let disputeInfo: { voterName: string; reason: string | null } | null = null

  if (result) {
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

    // Fetch dispute details if disputed
    if (result.verification_status === 'disputed') {
      const { data: disputeVote } = await supabase
        .from('match_result_votes')
        .select('voter_id, dispute_reason')
        .eq('match_result_id', result.id)
        .eq('vote', 'dispute')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (disputeVote) {
        const voter = players.find(p => p.id === disputeVote.voter_id)
        disputeInfo = {
          voterName: voter?.name ?? 'A player',
          reason: disputeVote.dispute_reason ?? null,
        }
      }
    }
  }

  return { match, players, result: result ?? null, myVote, disputeInfo }
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
      note: (s.note as string) || undefined,
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
            : result.verification_status === 'disputed'
            ? 'bg-red-50 text-red-700 border-red-100'
            : 'bg-yellow-50 text-yellow-700 border-yellow-100'
        )}>
          {result.verification_status === 'verified' ? 'Verified'
            : result.verification_status === 'disputed' ? 'Disputed'
            : 'Pending'}
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
            <div>
              <p className="text-[10px] text-gray-400">
                {completedSets.map((s) => {
                  const base = `${s.team1}-${s.team2}`
                  return s.tiebreak ? `${base} (${s.tiebreak.team1}-${s.tiebreak.team2})` : base
                }).join('  ')}
              </p>
              {completedSets.some(s => s.note) && (
                <p className="text-[10px] text-gray-400 italic mt-0.5">
                  {completedSets.filter(s => s.note).map(s => s.note).join(' · ')}
                </p>
              )}
            </div>
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
  const { t } = useTranslation()
  const locale = useDateLocale()

  // Realtime: auto-refresh when match/results/votes change
  useMatchSubscription(id ?? null)
  const queryClient = useQueryClient()
  const [showRecordResult, setShowRecordResult] = useState(false)
  const [showEdit, setShowEdit]               = useState(false)
  const [showInvite, setShowInvite]           = useState(false)
  const [showCalendar, setShowCalendar]       = useState(false)
  const [copied, setCopied]                   = useState(false)
  const [confirmLeave, setConfirmLeave]       = useState(false)
  const [leaving, setLeaving]                 = useState(false)
  const [confirmCancel, setConfirmCancel]     = useState(false)
  const [cancelling, setCancelling]           = useState(false)
  const [confirmDelete, setConfirmDelete]     = useState(false)
  const [deleting, setDeleting]               = useState(false)
  const [deleteError, setDeleteError]         = useState<string | null>(null)
  const [cancelError, setCancelError]         = useState<string | null>(null)
  const [showSelfReportSheet, setShowSelfReportSheet] = useState(false)
  const [confirmCancelBooking, setConfirmCancelBooking] = useState(false)
  const [showAskRingers, setShowAskRingers] = useState(false)
  const [showAskNetwork, setShowAskNetwork] = useState(false)
  const [confirmingInviteeId, setConfirmingInviteeId] = useState<string | null>(null)
  const [showPushToOpen, setShowPushToOpen] = useState(false)
  const [cancellingBooking, setCancellingBooking] = useState(false)
  const [creatingNext, setCreatingNext] = useState(false)
  const [voteSubmitted, setVoteSubmitted]     = useState(false)
  const [showDisputeInput, setShowDisputeInput] = useState(false)
  const [showLiftChooser, setShowLiftChooser] = useState(false)
  const [showPeerVoting, setShowPeerVoting] = useState(false)
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

  // Creator profile location (fallback when no venue booked)
  const { data: creatorLatLng } = useQuery<{ latitude: number; longitude: number } | null>({
    queryKey: ['creator-latlng', data?.match?.created_by],
    enabled: !!data?.match?.created_by && !venueLatLng,
    queryFn: async () => {
      const { data: p } = await supabase
        .from('profiles')
        .select('latitude, longitude')
        .eq('id', data!.match.created_by!)
        .maybeSingle()
      if (!p?.latitude || !p?.longitude) return null
      return { latitude: p.latitude, longitude: p.longitude }
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

  // Ringer request for current user (if they've been asked to fill in)
  const { data: myRingerRequest } = useQuery({
    queryKey: ['my-ringer-request', id, profile?.id],
    enabled: !!id && !!profile?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('ringer_requests')
        .select('id, status, expires_at, requested_by')
        .eq('match_id', id!)
        .eq('ringer_id', profile!.id)
        .maybeSingle()
      return data
    },
  })

  // Peer votes — has current user voted? (Step 4/5)
  const matchIsCompleted = data?.match?.status === 'completed'
  const { data: myPeerVotes } = useQuery({
    queryKey: ['my-peer-votes', id, profile?.id],
    enabled: !!id && !!profile?.id && matchIsCompleted,
    queryFn: async () => {
      const { data: votes } = await supabase
        .from('match_peer_votes')
        .select('category, voted_for_id')
        .eq('match_id', id!)
        .eq('voter_id', profile!.id)
      return votes ?? []
    },
  })
  const hasVotedPeer = (myPeerVotes?.length ?? 0) > 0

  // Peer votes — all votes for this match (Step 6: tally)
  const { data: allPeerVotes } = useQuery({
    queryKey: ['peer-votes', id],
    enabled: !!id && matchIsCompleted,
    queryFn: async () => {
      const { data: votes } = await supabase
        .from('match_peer_votes')
        .select('category, voted_for_id')
        .eq('match_id', id!)
      return votes ?? []
    },
  })

  const respondRingerMutation = useMutation({
    mutationFn: async (accept: boolean) => {
      const { error } = await supabase.rpc('respond_ringer_request', {
        p_match_id: id!,
        p_accept: accept,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-ringer-request', id] })
      queryClient.invalidateQueries({ queryKey: ['ringer-requests', id] })
      queryClient.invalidateQueries({ queryKey: ['match', id] })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      toast.success('Response sent')
    },
  })

  const claimOpenMutation = useMutation({
    mutationFn: async () => {
      const { data: res, error } = await supabase.rpc('claim_open_match', { p_match_id: id })
      if (error) throw error
      if (!(res as any)?.success) throw new Error('Claim failed')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['match', id] })
      queryClient.invalidateQueries({ queryKey: ['join-open-matches'] })
      queryClient.invalidateQueries({ queryKey: ['week-open-matches'] })
      queryClient.invalidateQueries({ queryKey: ['open-matches'] })
      queryClient.invalidateQueries({ queryKey: ['play-upcoming'] })
      queryClient.invalidateQueries({ queryKey: ['home-next-match'] })
      toast.success('You\'ve claimed the open spot')
    },
    onError: (err: any) => {
      console.error('Claim failed:', err)
      toast.error(err?.message ?? 'Failed to claim match. Try again.')
    },
  })

  // Match invitation for current user
  const { data: myInvitation } = useQuery({
    queryKey: ['my-invitation', id, profile?.id],
    enabled: !!id && !!profile?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('match_invitations')
        .select('id, status, expires_at, is_broadcast')
        .eq('match_id', id!)
        .eq('invitee_id', profile!.id)
        .maybeSingle()
      return data
    },
  })

  const respondInvitationMutation = useMutation({
    mutationFn: async (accept: boolean) => {
      const { error } = await supabase.rpc('respond_match_invitation', { p_match_id: id, p_accept: accept })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-invitation', id] })
      queryClient.invalidateQueries({ queryKey: ['match', id] })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      toast.success('Response sent')
    },
    onError: (err: any) => {
      console.error('Invitation response failed:', err)
      toast.error(err?.message ?? 'Failed to respond. Try again.')
    },
  })

  // Pending broadcast invitees awaiting host confirmation
  const { data: pendingInvitees = [] } = useQuery({
    queryKey: ['pending-invitees', id],
    enabled: !!id,
    queryFn: async () => {
      // Fetch current player_ids to filter out already-confirmed invitees
      const { data: matchData } = await supabase
        .from('matches').select('player_ids').eq('id', id!).single()
      const currentPids = ((matchData?.player_ids ?? []) as string[])

      const { data: invitations } = await supabase
        .from('match_invitations')
        .select('id, invitee_id, status, responded_at, is_broadcast')
        .eq('match_id', id!)
        .eq('status', 'accepted')
        .eq('is_broadcast', true)
        .order('responded_at', { ascending: true })
      if (!invitations?.length) return []

      const pending = invitations.filter((inv: any) => !currentPids.includes(inv.invitee_id))
      if (!pending.length) return []

      const inviteeIds = pending.map((i: any) => i.invitee_id)
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name, avatar_url, internal_ranking')
        .in('id', inviteeIds)
      const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]))
      return pending.map((inv: any) => ({
        id: inv.id,
        invitee_id: inv.invitee_id,
        inviteeName: profileMap.get(inv.invitee_id)?.name ?? null,
        inviteeAvatar: (profileMap.get(inv.invitee_id) as any)?.avatar_url ?? null,
        inviteeElo: profileMap.get(inv.invitee_id)?.internal_ranking ?? null,
      }))
    },
  })

  const confirmInviteeMutation = useMutation({
    mutationFn: async (inviteeId: string) => {
      const { data, error } = await supabase.rpc('confirm_invitee_for_match', {
        p_match_id: id,
        p_invitee_id: inviteeId,
      })
      if (error) throw error
      if (!(data as any)?.success) throw new Error('Confirm failed')
    },
    onMutate: (inviteeId) => { setConfirmingInviteeId(inviteeId) },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['match', id] })
      queryClient.invalidateQueries({ queryKey: ['pending-invitees', id] })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      toast.success('Player confirmed')
    },
    onError: (err: any) => {
      console.error('Confirm invitee failed:', err)
      toast.error(err?.message ?? 'Failed to confirm player. Try again.')
    },
    onSettled: () => { setConfirmingInviteeId(null) },
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
      // Notify the driver
      await supabase.from('notifications').insert({
        user_id: driverId,
        type: 'lift_requested',
        title: 'Lift request',
        message: `${profile?.name ?? 'A player'} asked for a lift to the match.`,
        related_id: id,
        read: false,
      }).then(() => {}, () => {}) // non-blocking
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['travel-requests', id, profile?.id] })
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
      if (!profile?.id || !id) throw new Error('Not signed in')
      const { error } = await supabase
        .from('travel_requests')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('match_id', id)
        .eq('requester_id', requesterId)
        .eq('driver_id', profile.id)
      if (error) throw error
      // Notify the requester
      const notifType = status === 'accepted' ? 'lift_accepted' : 'lift_declined'
      const notifTitle = status === 'accepted' ? 'Lift confirmed' : 'Lift declined'
      const notifMsg = status === 'accepted'
        ? `${profile.name ?? 'A driver'} accepted your lift request.`
        : `${profile.name ?? 'A driver'} can't give you a lift this time.`
      await supabase.from('notifications').insert({
        user_id: requesterId,
        type: notifType,
        title: notifTitle,
        message: notifMsg,
        related_id: id,
        read: false,
      }).then(() => {}, () => {}) // non-blocking
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incoming-travel-requests', id, profile?.id] })
      queryClient.invalidateQueries({ queryKey: ['travel-requests', id, profile?.id] })
    },
  })

  // Group admin status (for team-switching permission)
  const { isAdmin: isGroupAdmin } = useIsGroupAdmin(data?.match?.group_id)

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
        // Single opposing-team confirmation is sufficient to verify
        await supabase
          .from('match_results')
          .update({ verification_status: 'verified' })
          .eq('id', result.id)
        // ELO processing is handled by the Database Webhook automatically
        // Peer-vote badges are awarded server-side by the
        // trg_peer_vote_badges_on_verify trigger (covers manual + auto-verify)

        // Refetch badges so the UI updates immediately
        queryClient.invalidateQueries({ queryKey: ['achievements'] })
        queryClient.invalidateQueries({ queryKey: ['peer-vote-totals'] })

        // Notify all players that the result is verified
        const allPlayerIds = [
          ...(result.team1_players ?? []),
          ...(result.team2_players ?? []),
        ].filter((pid: string) => pid !== profile.id)
        if (allPlayerIds.length > 0) {
          const score = `${result.team1_score}–${result.team2_score}`
          await supabase.from('notifications').insert(
            allPlayerIds.map((pid: string) => ({
              user_id: pid,
              type: 'result_verified',
              title: 'Match result verified',
              message: `Final: ${score}. ELO updated.`,
              related_id: result.match_id,
              read: false,
            }))
          )
        }
      } else {
        await supabase
          .from('match_results')
          .update({ verification_status: 'disputed' })
          .eq('id', result.id)

        // Notify submitter that the result was disputed
        const submittedBy = result.submitted_by
        if (submittedBy && submittedBy !== profile.id) {
          const voterName = profile.name ?? 'A player'
          await supabase.from('notifications').insert({
            user_id: submittedBy,
            type: 'result_disputed',
            title: 'Match result disputed',
            message: `${voterName} disputed the result.${reason ? ` Reason: ${reason}` : ''}`,
            related_id: result.match_id,
            read: false,
          })
        }
      }
    },
    onSuccess: () => {
      if (navigator.vibrate) navigator.vibrate(10)
      setVoteSubmitted(true)
      setShowDisputeInput(false)
      queryClient.invalidateQueries({ queryKey: ['match', id] })
      queryClient.invalidateQueries({ queryKey: ['home-next-match'] })
      queryClient.invalidateQueries({ queryKey: ['home-quick-stats'] })
      queryClient.invalidateQueries({ queryKey: ['home-activity'] })
      queryClient.invalidateQueries({ queryKey: ['matches'] })
      queryClient.invalidateQueries({ queryKey: ['play-matches'] })
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

  const { match, players, result, myVote, disputeInfo } = data

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
  // Any participant or group admin can edit
  const canEdit       = (isParticipant || isGroupAdmin || playerIds.length === 0) &&
                        match.status !== 'completed' && match.status !== 'cancelled'
  const canCancel     = (isParticipant || isGroupAdmin) &&
                        ['scheduled', 'pending', 'confirmed', 'open'].includes(match.status)
  const canDelete     = isGroupAdmin
  // 24h result-entry window
  const matchStartTime = match.match_time
    ? new Date(`${match.match_date}T${match.match_time}`)
    : new Date(`${match.match_date}T00:00:00`)
  const resultDeadline = addHours(matchStartTime, 24)
  const isWithinResultWindow = isBefore(new Date(), resultDeadline)
  const isPastMatchTime = new Date() > matchStartTime

  const canPlayAnother = isParticipant && playerIds.length === 4 && !!result && isPastMatchTime && isWithinResultWindow
  const guestNamesForCount = match.notes?.match(/Guests?: (.+)/)?.[1]?.split(',').map(n => n.trim()) ?? []
  const effectivePlayerCount = playerIds.length + guestNamesForCount.length
  const canRecordResult = isParticipant && match.status !== 'completed' && match.status !== 'cancelled' && effectivePlayerCount >= 4 && !result && isPastMatchTime && isWithinResultWindow
  const resultEntryClosed = isPastMatchTime && !isWithinResultWindow && !result
  const canSwitchTeams = isParticipant || isGroupAdmin
  const userElo = (profile as any)?.internal_ranking ?? null
  const canClaim = !!(match && profile && (match as any).is_open && !isParticipant && playerIds.length < 4
    && match.status !== 'completed' && match.status !== 'cancelled'
    && userElo != null
    && ((match as any).open_elo_min == null || userElo >= (match as any).open_elo_min)
    && ((match as any).open_elo_max == null || userElo <= (match as any).open_elo_max)
    && myInvitation?.status !== 'pending')

  const typeStyle   = TYPE_STYLES[match.match_type ?? 'group'] ?? TYPE_STYLES.group
  const statusStyle = STATUS_STYLES[match.status] ?? { label: match.status, className: 'bg-gray-50 text-gray-500 border-gray-100', dot: 'bg-gray-300' }

  const formattedDate = (() => {
    try { return format(parseISO(match.match_date), 'EEEE, d MMMM yyyy', { locale }) } catch { return match.match_date }
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
    const { error } = await supabase.rpc('leave_match', {
      p_match_id: data.match.id,
    })
    setLeaving(false)
    setConfirmLeave(false)
    if (error) {
      console.error('Leave match failed:', error)
      toast.error(error.message ?? 'Failed to leave match')
      return
    }
    if (navigator.vibrate) navigator.vibrate(10)
    // Don't invalidate ['match', id] — user is no longer in player_ids,
    // RLS blocks the refetch (.single() → 406). We navigate away immediately.
    queryClient.invalidateQueries({ queryKey: ['home-next-match'] })
    queryClient.invalidateQueries({ queryKey: ['matches'] })
    queryClient.invalidateQueries({ queryKey: ['play-matches'] })
    queryClient.invalidateQueries({ queryKey: ['join-open-matches'] })
    queryClient.invalidateQueries({ queryKey: ['week-open-matches'] })
    queryClient.invalidateQueries({ queryKey: ['open-matches'] })
    queryClient.invalidateQueries({ queryKey: ['travel-requests'] })
    queryClient.invalidateQueries({ queryKey: ['notifications'] })
    toast.success('Left the match')
    navigate('/home')
  }



  const handleCancelBooking = async () => {
    if (!data) return
    setCancellingBooking(true)
    const { error } = await supabase.rpc('cancel_booking', { p_match_id: data.match.id })
    setCancellingBooking(false)
    setConfirmCancelBooking(false)
    if (error) {
      console.error('Cancel booking failed:', error)
      return
    }
    if (navigator.vibrate) navigator.vibrate(10)
    queryClient.invalidateQueries({ queryKey: ['match', id] })
    queryClient.invalidateQueries({ queryKey: ['matches'] })
    queryClient.invalidateQueries({ queryKey: ['notifications'] })
  }

  const handleCancelMatch = async () => {
    if (!data) return
    setCancelling(true)
    setCancelError(null)
    try {
      const { error: cancelErr } = await supabase
        .from('matches')
        .update({ status: 'cancelled', is_open: false, open_elo_min: null, open_elo_max: null })
        .eq('id', data.match.id)
      if (cancelErr) throw cancelErr

      // Notify real participants (skip guest UUIDs)
      const realPlayerIds = (data.match.player_ids ?? []).filter((pid: string) => pid !== currentUserId)
      if (realPlayerIds.length > 0) {
        const { data: realProfiles } = await supabase.from('profiles').select('id').in('id', realPlayerIds)
        const validIds = (realProfiles ?? []).map((p: any) => p.id)
        const dateStr = (() => { try { return format(parseISO(data.match.match_date), 'EEE d MMM', { locale }) } catch { return data.match.match_date } })()
        if (validIds.length > 0) {
          await supabase.from('notifications').insert(
            validIds.map((pid: string) => ({
              user_id: pid,
              type: 'match_cancelled',
              title: 'Match cancelled',
              message: `${profile?.name ?? 'A player'} cancelled the match on ${dateStr}`,
              related_id: data.match.id,
              read: false,
            }))
          )
        }
      }
      if (navigator.vibrate) navigator.vibrate(10)
      queryClient.invalidateQueries({ queryKey: ['match', id] })
      queryClient.invalidateQueries({ queryKey: ['matches'] })
      queryClient.invalidateQueries({ queryKey: ['play-matches'] })
    } catch (err: any) {
      setCancelError(err?.message ?? 'Failed to cancel match. Please try again.')
    } finally {
      setCancelling(false)
      setConfirmCancel(false)
    }
  }

  const handleDeleteMatch = async () => {
    if (!data) return
    setDeleting(true)
    setDeleteError(null)
    const matchId = data.match.id

    try {
      // 1. Fetch match_result IDs for child-row cleanup
      const { data: results } = await supabase
        .from('match_results').select('id').eq('match_id', matchId)
      const resultIds = (results ?? []).map((r: any) => r.id)

      // 2. Cascade delete child rows in dependency order
      if (resultIds.length > 0) {
        await supabase.from('rating_history').delete().in('match_result_id', resultIds)
        await supabase.from('match_result_votes').delete().in('match_result_id', resultIds)
      }
      await supabase.from('match_peer_votes').delete().eq('match_id', matchId)
      await supabase.from('match_results').delete().eq('match_id', matchId)
      await supabase.from('travel_requests').delete().eq('match_id', matchId)
      // Clean up old notifications referencing this match
      await supabase.from('notifications').delete().eq('related_id', matchId)
      // Delete the match itself
      const { error: matchDelErr } = await supabase.from('matches').delete().eq('id', matchId)
      if (matchDelErr) throw matchDelErr

      // 3. Notify real participants AFTER cascade (so notifications don't get nuked)
      const allPlayerIds = (data.match.player_ids ?? []).filter((pid: string) => pid !== currentUserId)
      if (allPlayerIds.length > 0) {
        const { data: realProfiles } = await supabase.from('profiles').select('id').in('id', allPlayerIds)
        const validIds = (realProfiles ?? []).map((p: any) => p.id)
        const dateStr = (() => { try { return format(parseISO(data.match.match_date), 'EEE d MMM', { locale }) } catch { return data.match.match_date } })()
        if (validIds.length > 0) {
          await supabase.from('notifications').insert(
            validIds.map((pid: string) => ({
              user_id: pid, type: 'match_deleted', title: 'Match deleted',
              message: `${profile?.name ?? 'A player'} deleted the match on ${dateStr}`,
              related_id: data.match.id,
              read: false,
            }))
          )
        }
      }

      if (navigator.vibrate) navigator.vibrate(10)
      queryClient.invalidateQueries({ queryKey: ['matches'] })
      queryClient.invalidateQueries({ queryKey: ['play-matches'] })
      // Return to where the user came from; fall back to /play for deep links
      if (window.history.length > 1) {
        navigate(-1)
      } else {
        navigate('/play')
      }
    } catch (err: any) {
      setDeleteError(err?.message ?? 'Delete failed. Please try again or contact support.')
    } finally {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  const handlePlayAnother = async () => {
    if (!data) return
    setCreatingNext(true)
    const m = data.match
    const { data: newMatch, error } = await supabase
      .from('matches')
      .insert({
        match_date: m.match_date,
        match_time: m.match_time,
        match_type: m.match_type,
        status: 'scheduled',
        player_ids: m.player_ids,
        team1_player_ids: m.team1_player_ids ?? null,
        team2_player_ids: m.team2_player_ids ?? null,
        group_id: m.group_id ?? null,
        booked_venue_name: m.booked_venue_name ?? null,
        created_by: currentUserId,
        created_manually: true,
        context_type: 'open' as const,
      })
      .select('id')
      .single()
    setCreatingNext(false)
    if (!error && newMatch) {
      navigate(`/matches/${newMatch.id}`, { state: { openResult: true } })
    }
  }

  // Parse guest names stored in notes as "Guests: Name1, Name2"
  const guestNames = match.notes
    ?.match(/Guests: (.+)/)?.[1]
    ?.split(', ') ?? []

  const SLOT_COUNT = 4
  const slots = Array.from({ length: SLOT_COUNT }, (_, i) => {
    const pid = playerIds[i]
    if (pid) return players.find((p) => p.id === pid) ?? { id: pid, name: 'Unknown', email: '' }
    const guestIndex = i - playerIds.length
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
      {isCreator && playerIds.length === 4 && !result && match.status !== 'completed' && match.status !== 'cancelled' && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-5 mb-4 rounded-2xl bg-green-50 border border-green-200 px-4 py-3"
        >
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
            <p className="text-[13px] font-bold text-green-800">All 4 players confirmed!</p>
          </div>
          {(match as any).booking_status !== 'booked' && (
            <div className="mt-2 space-y-1.5">
              <button
                onClick={() => navigate(`/play/book-court?match_id=${match.id}&date=${match.match_date}&time=${match.match_time ?? ''}`)}
                className="w-full rounded-xl bg-green-600 py-2 text-[12px] font-bold text-white"
              >
                Book a Court
              </button>
              <button
                onClick={() => setShowSelfReportSheet(true)}
                className="w-full rounded-xl border border-gray-200 py-2 text-[12px] font-medium text-gray-600"
              >
                I've booked a court
              </button>
            </div>
          )}
        </motion.div>
      )}

      {/* Open match progress bar */}
      {match.player_ids.length < 4 && match.status !== 'completed' && match.status !== 'cancelled' && (
        <div className="mx-5 mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[11px] font-semibold text-gray-500">{match.player_ids.length} of 4 players joined</p>
            {(isParticipant || isGroupAdmin) && (
              <button
                onClick={() => setShowInvite(true)}
                className="text-[11px] font-semibold text-[#009688]"
              >
                + Add player
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
                  {(isParticipant || isGroupAdmin) && match.status !== 'completed' && match.status !== 'cancelled' ? (
                    <button
                      onClick={() => setShowInvite(true)}
                      className="text-[11px] text-teal-600 font-semibold"
                    >
                      Add player
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

      {/* Teams & Prediction (scheduled/pending only) */}
      {!result &&
        playerIds.length === 4 &&
        match.status !== 'completed' &&
        match.status !== 'cancelled' && (
          <TeamsAndPrediction
            matchId={match.id}
            playerIds={playerIds}
            players={players}
            savedTeam1={match.team1_player_ids ?? null}
            savedTeam2={match.team2_player_ids ?? null}
            canSwitch={canSwitchTeams}
            isFriendly={match.match_type === 'friendly'}
            isLeagueMatch={!!(match as any).league_id && match.match_type !== 'friendly'}
            currentUserId={currentUserId}
          />
        )}

      {/* Verification card */}
      {result && (result.verification_status === 'pending' || result.verification_status === 'disputed') && isParticipant && (() => {
        const submittedBy = result.submitted_by ?? ''
        const submittingTeam = result.team1_players?.includes(submittedBy) ? result.team1_players : result.team2_players
        const isOnSubmittingTeam = submittingTeam?.includes(currentUserId)
        // Auto-verify countdown
        const createdAt = result.created_at ? new Date(result.created_at).getTime() : 0
        const msUntilAutoVerify = createdAt + 24 * 60 * 60 * 1000 - Date.now()
        const hoursUntilAutoVerify = Math.max(0, Math.ceil(msUntilAutoVerify / (60 * 60 * 1000)))
        return (
        <div className="px-5 mb-4">
          {result.verification_status === 'disputed' ? (
            <div className="rounded-2xl border border-red-100 bg-red-50 p-3">
              <p className="text-[13px] font-semibold text-red-700 text-center">Disputed — awaiting admin review</p>
              {disputeInfo && (isParticipant || isGroupAdmin) && (
                <div className="mt-2 pt-2 border-t border-red-100">
                  <p className="text-[12px] text-red-600">
                    <span className="font-semibold">{disputeInfo.voterName}</span>
                    {disputeInfo.reason
                      ? `: "${disputeInfo.reason}"`
                      : ' disputed this result'}
                  </p>
                </div>
              )}
            </div>
          ) : isOnSubmittingTeam ? (
            <div className="rounded-2xl border border-green-100 bg-green-50 p-3 text-center">
              <p className="text-[13px] font-semibold text-green-700">You submitted this result</p>
              <p className="text-[11px] text-gray-400 mt-1">
                Awaiting verification from opposing team
              </p>
              {hoursUntilAutoVerify > 0 && (
                <p className="text-[11px] text-gray-400 mt-0.5">Auto-verifies in {hoursUntilAutoVerify}h</p>
              )}
            </div>
          ) : voteSubmitted || myVote ? (
            <div className={cn(
              'rounded-2xl border p-3 text-center',
              myVote === 'dispute' ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'
            )}>
              <p className={cn('text-[13px] font-semibold', myVote === 'dispute' ? 'text-red-700' : 'text-green-700')}>
                {myVote === 'dispute' ? 'Result disputed' : 'Result confirmed'}
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-yellow-100 bg-yellow-50 p-4">
              <p className="text-[13px] font-bold text-gray-800 mb-1">Verify this result?</p>
              {hoursUntilAutoVerify > 0 && (
                <p className="text-[11px] text-gray-400 mb-2">Auto-verifies in {hoursUntilAutoVerify}h if no response</p>
              )}
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

      {/* Step 4: Cast your votes entry — any participant of a completed match who hasn't voted */}
      {matchIsCompleted && isParticipant && !hasVotedPeer && (
        <div className="px-5 mb-4">
          <button
            onClick={() => setShowPeerVoting(true)}
            className="w-full rounded-2xl bg-purple-50 border border-purple-100 p-4 text-left"
          >
            <p className="text-[14px] font-bold text-purple-800 mb-0.5">{t('peer_voting.cast_votes')} 🎾</p>
            <p className="text-[12px] text-purple-600">{t('peer_voting.cast_votes_desc')}</p>
          </button>
        </div>
      )}

      {/* Step 4: Already voted indicator */}
      {matchIsCompleted && isParticipant && hasVotedPeer && (
        <div className="px-5 mb-4">
          <button
            onClick={() => setShowPeerVoting(true)}
            className="w-full rounded-2xl bg-teal-50 border border-teal-100 p-3 flex items-center justify-between"
          >
            <p className="text-[13px] font-semibold text-teal-700">{t('peer_voting.votes_cast')} ✓</p>
            <span className="text-[12px] text-teal-500">{t('peer_voting.your_votes')}</span>
          </button>
        </div>
      )}

      {/* Step 6: Match votes tally */}
      {matchIsCompleted && allPeerVotes && allPeerVotes.length > 0 && (
        <div className="px-5 mb-4">
          <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-3">{t('peer_voting.match_votes')}</p>
            {result?.verification_status !== 'verified' && (
              <p className="text-[11px] text-amber-600 mb-3 italic">{t('peer_voting.provisional_note')}</p>
            )}
            <div className="space-y-2.5">
              {PEER_VOTE_CATEGORIES.map((cat) => {
                const catVotes = allPeerVotes.filter((v) => v.category === cat.id)
                if (catVotes.length === 0) return null
                // Tally votes per votee
                const tally = new Map<string, number>()
                for (const v of catVotes) {
                  tally.set(v.voted_for_id, (tally.get(v.voted_for_id) ?? 0) + 1)
                }
                // Find winner (most votes)
                let winnerId = ''
                let winnerCount = 0
                for (const [pid, count] of tally) {
                  if (count > winnerCount) { winnerId = pid; winnerCount = count }
                }
                const winner = players.find((p) => p.id === winnerId)
                return (
                  <div key={cat.id} className="flex items-center gap-3">
                    <span className="text-[16px] flex-shrink-0">{cat.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-semibold text-gray-700">{t(`peer_voting.${cat.id}_name`, { defaultValue: cat.name })}</p>
                    </div>
                    {winner && (
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <PlayerAvatar name={winner.name} avatarUrl={winner.avatar_url} size="sm" />
                        <span className="text-[12px] font-semibold text-gray-800">{winner.name?.split(' ')[0]}</span>
                        <span className="text-[11px] text-gray-400">({winnerCount})</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* PeerVotingSheet modal (from MatchDetail) */}
      {matchIsCompleted && isParticipant && (
        <PeerVotingSheet
          open={showPeerVoting}
          onClose={() => setShowPeerVoting(false)}
          matchId={match.id}
          players={players}
          currentUserId={currentUserId}
        />
      )}

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
                    const isMe = passenger.id === profile?.id
                    const acceptedRequest = myTravelRequests.find((r) => r.status === 'accepted')
                    const pendingRequests = myTravelRequests.filter((r) => r.status === 'pending')
                    const acceptedDriver = acceptedRequest
                      ? travelInfo!.drivers.find((d) => d.id === acceptedRequest.driver_id)
                      : null

                    return (
                      <div key={passenger.id} className="flex items-center gap-2.5">
                        <PlayerAvatar name={passenger.name} avatarUrl={passenger.avatar_url} size="sm" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-semibold text-gray-800 truncate">{passenger.name}</p>
                          {isMe && acceptedDriver && (
                            <p className="text-[11px] text-green-600">Riding with {acceptedDriver.name.split(' ')[0]}</p>
                          )}
                          {isMe && !acceptedDriver && pendingRequests.length > 0 && (
                            <p className="text-[11px] text-gray-400">Waiting for response</p>
                          )}
                        </div>
                        {isMe && !acceptedDriver && (travelInfo!.drivers.length > 0) && (
                          <button
                            onClick={() => setShowLiftChooser(true)}
                            className="flex-shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-bold bg-[#009688] text-white"
                          >
                            <Car className="h-3 w-3 inline mr-1" />
                            Ask for a lift
                          </button>
                        )}
                        {isMe && acceptedDriver && (
                          <span className="flex-shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-bold bg-green-50 border border-green-100 text-green-600">
                            Lift confirmed
                          </span>
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

      {/* Ringer response banner */}
      {myRingerRequest?.status === 'pending' && new Date(myRingerRequest.expires_at) > new Date() && (
        <div className="mx-5 mb-4 rounded-2xl border border-teal-200 bg-teal-50 p-4">
          <p className="text-[14px] font-bold text-teal-900 mb-1">{t('ringers.ringer_request_banner_title')}</p>
          <p className="text-[12px] text-teal-700 mb-3">
            {t('ringers.ringer_request_banner_subtitle', {
              expiry: format(parseISO(myRingerRequest.expires_at), 'EEE d MMM, HH:mm', { locale })
            })}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => respondRingerMutation.mutate(true)}
              disabled={respondRingerMutation.isPending}
              className="flex-1 rounded-xl bg-teal-600 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
            >
              {t('ringers.ringer_request_yes')}
            </button>
            <button
              onClick={() => respondRingerMutation.mutate(false)}
              disabled={respondRingerMutation.isPending}
              className="flex-1 rounded-xl border border-gray-200 py-2.5 text-[13px] font-semibold text-gray-700 disabled:opacity-50"
            >
              {t('ringers.ringer_request_no')}
            </button>
          </div>
        </div>
      )}
      {myRingerRequest?.status === 'accepted' && (
        <div className="mx-5 mb-4 rounded-2xl bg-teal-50 border border-teal-200 px-4 py-3">
          <p className="text-[13px] font-semibold text-teal-800">{t('ringers.ringer_request_responded_yes', { name: '' })}</p>
        </div>
      )}
      {myRingerRequest?.status === 'declined' && (
        <div className="mx-5 mb-4 rounded-2xl bg-gray-50 border border-gray-200 px-4 py-3">
          <p className="text-[13px] font-semibold text-gray-700">{t('ringers.ringer_request_responded_no')}</p>
        </div>
      )}

      {/* Invitation response banner */}
      {myInvitation?.status === 'pending' && new Date(myInvitation.expires_at) > new Date() && (
        <div className="mx-5 mb-4 rounded-2xl border border-blue-200 bg-blue-50 p-4">
          <p className="text-[14px] font-bold text-blue-900 mb-1">You've been invited to this match</p>
          <p className="text-[12px] text-blue-700 mb-3">Reply by {format(parseISO(myInvitation.expires_at), 'EEE d MMM, HH:mm', { locale })}</p>
          <div className="flex gap-2">
            <button onClick={() => respondInvitationMutation.mutate(true)} disabled={respondInvitationMutation.isPending}
              className="flex-1 rounded-xl bg-blue-600 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50">
              Yes, I can play
            </button>
            <button onClick={() => respondInvitationMutation.mutate(false)} disabled={respondInvitationMutation.isPending}
              className="flex-1 rounded-xl border border-gray-200 py-2.5 text-[13px] font-semibold text-gray-700 disabled:opacity-50">
              Can't make it
            </button>
          </div>
        </div>
      )}
      {myInvitation?.status === 'accepted' && !isParticipant && (
        <div className="mx-5 mb-4 rounded-2xl bg-blue-50 border border-blue-200 px-4 py-3">
          <p className="text-[13px] font-semibold text-blue-900 mb-0.5">You accepted this invitation</p>
          <p className="text-[12px] text-blue-700">
            {myInvitation.is_broadcast
              ? 'Waiting on the host to confirm you for the match.'
              : "You'll be added to the match shortly."}
          </p>
        </div>
      )}

      {/* Claim open match banner */}
      {canClaim && (
        <div className="mx-5 mb-4 rounded-2xl border border-purple-200 bg-purple-50 p-4">
          <p className="text-[14px] font-bold text-purple-900 mb-1">{t('open_matches.claim_banner_title')}</p>
          <p className="text-[12px] text-purple-700 mb-3">{t('open_matches.claim_banner_subtitle')}</p>
          <button
            onClick={() => claimOpenMutation.mutate()}
            disabled={claimOpenMutation.isPending}
            className="w-full rounded-xl bg-purple-600 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            {claimOpenMutation.isPending ? 'Claiming\u2026' : t('open_matches.claim_button')}
          </button>
        </div>
      )}
      {!canClaim && (match as any).is_open && !isParticipant && playerIds.length < 4 && userElo != null && (
        <div className="mx-5 mb-4 rounded-2xl bg-gray-50 border border-gray-200 px-4 py-3">
          <p className="text-[13px] text-gray-600">
            {t('open_matches.claim_elo_out_of_range', {
              your_elo: userElo,
              min: (match as any).open_elo_min ?? '?',
              max: (match as any).open_elo_max ?? '?',
            })}
          </p>
        </div>
      )}

      {/* Result entry closed banner */}
      {resultEntryClosed && (
        <div className="px-5 mb-4">
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-center">
            <p className="text-[13px] font-semibold text-gray-600">Result entry closed</p>
            <p className="text-[11px] text-gray-400 mt-1">No result entered within 24 hours of match time.</p>
            {canEdit && (
              <p className="text-[11px] text-[#009688] mt-1">Played at a different time? Edit the match to update.</p>
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
          {(match as any).booking_status === 'booked' ? (
            <div className="col-span-2 rounded-2xl border border-teal-100 bg-teal-50 px-4 py-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[14px] font-bold text-teal-800">{match.booked_venue_name}</p>
                  {match.booked_court_number != null && (
                    <p className="text-[12px] text-teal-600">Court {match.booked_court_number}</p>
                  )}
                  {(match as any).booking_reference && (
                    <p className="text-[11px] text-gray-400 mt-0.5">Ref: {(match as any).booking_reference}</p>
                  )}
                </div>
                <span className="text-[10px] font-bold text-teal-600 bg-teal-100 rounded-full px-2 py-0.5">Booked</span>
              </div>
              {(match as any).booked_by === currentUserId && (
                <button
                  onClick={() => setConfirmCancelBooking(true)}
                  className="text-[11px] text-red-500 font-semibold mt-2"
                >
                  Cancel booking
                </button>
              )}
            </div>
          ) : match.status !== 'completed' && match.status !== 'cancelled' && isParticipant ? (
            <>
              <button
                onClick={() => navigate(`/play/book-court?match_id=${match.id}&date=${match.match_date}&time=${match.match_time ?? ''}`)}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 py-3 text-[13px] font-semibold text-teal-700"
              >
                <BookOpen className="h-4 w-4" />
                Book Court
              </button>
              <button
                onClick={() => setShowSelfReportSheet(true)}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 py-3 text-[13px] font-medium text-gray-600"
              >
                I booked elsewhere
              </button>
            </>
          ) : null}
          {playerIds.length < 4 && (isParticipant || isGroupAdmin) && match.status !== 'completed' && match.status !== 'cancelled' && (
            <button
              onClick={() => setShowAskRingers(true)}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-orange-200 bg-orange-50 py-3 text-[13px] font-semibold text-orange-700"
            >
              <Users className="h-4 w-4" />
              Ask ringers
            </button>
          )}
          {playerIds.length < 4 && (isParticipant || isGroupAdmin) && match.status !== 'completed' && match.status !== 'cancelled' && (
            <button
              onClick={() => setShowAskNetwork(true)}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 py-3 text-[13px] font-semibold text-blue-700"
            >
              <Users className="h-4 w-4" />
              Ask network
            </button>
          )}
          {playerIds.length < 4 && !(match as any).is_open && (isParticipant || isGroupAdmin) && match.status !== 'completed' && match.status !== 'cancelled' && (
            <button
              onClick={() => setShowPushToOpen(true)}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-purple-200 bg-purple-50 py-3 text-[13px] font-semibold text-purple-700"
            >
              Push to Open
            </button>
          )}
          {(match as any).is_open && (isParticipant || isGroupAdmin) && (
            <>
              <div className="flex items-center justify-center gap-1.5 rounded-xl border border-green-200 bg-green-50 py-3 text-[13px] font-semibold text-green-700">
                <CheckCircle className="h-4 w-4" />
                Open match
              </div>
              <button
                onClick={() => setShowPushToOpen(true)}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-purple-200 bg-purple-50 py-3 text-[13px] font-semibold text-purple-700"
              >
                Edit ELO range
              </button>
              <button
                onClick={async () => {
                  const { error } = await supabase.rpc('revert_open_match', { p_match_id: match.id })
                  if (error) { toast.error('Failed to close open match'); return }
                  toast.success('Match is now private')
                  queryClient.invalidateQueries({ queryKey: ['match', id] })
                }}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 py-3 text-[13px] font-semibold text-gray-600"
              >
                <XCircle className="h-4 w-4" />
                Make private
              </button>
            </>
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
          {canCancel && (
            <button
              onClick={() => setConfirmCancel(true)}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-amber-200 py-3 text-[13px] font-semibold text-amber-600"
            >
              <Ban className="h-4 w-4" />
              Cancel
            </button>
          )}
          {canDelete && (
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-red-200 py-3 text-[13px] font-semibold text-red-500"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          )}
          {canPlayAnother && (
            <button
              onClick={handlePlayAnother}
              disabled={creatingNext}
              className="col-span-2 flex items-center justify-center gap-1.5 rounded-xl bg-[#009688] py-3 text-[13px] font-bold text-white disabled:opacity-50"
            >
              <Play className="h-4 w-4" />
              {creatingNext ? 'Creating\u2026' : 'Play Another'}
            </button>
          )}
          <div className="col-span-2 flex justify-center pt-1">
            <ReportButton context="match" contextId={match.id} />
          </div>
        </div>
      </div>

      {/* Pending broadcast invitees */}
      {pendingInvitees.length > 0 && (isParticipant || isGroupAdmin) && playerIds.length < 4 && (
        <div className="px-5 mt-4">
          <h3 className="text-[13px] font-semibold text-gray-700 mb-2">
            Pending invitees ({pendingInvitees.length})
          </h3>
          <div className="space-y-2">
            {pendingInvitees.map((p: any) => (
              <div key={p.id} className="flex items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50 px-3 py-2.5">
                <PlayerAvatar name={p.inviteeName} avatarUrl={p.inviteeAvatar} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-gray-900 truncate">{p.inviteeName ?? 'Unknown'}</p>
                  <p className="text-[11px] text-gray-500">ELO {p.inviteeElo ?? '—'} · Accepted</p>
                </div>
                <button
                  onClick={() => confirmInviteeMutation.mutate(p.invitee_id)}
                  disabled={confirmingInviteeId !== null}
                  className={`rounded-xl px-3 py-1.5 text-[12px] font-semibold text-white ${
                    confirmingInviteeId === p.invitee_id
                      ? 'bg-blue-700 animate-pulse'
                      : 'bg-blue-600 disabled:bg-blue-400'
                  }`}
                >
                  {confirmingInviteeId === p.invitee_id ? 'Confirming…' : 'Confirm'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

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

      {/* Lift chooser sheet */}
      <AnimatePresence>
        {showLiftChooser && travelInfo && (
          <>
            <motion.div
              className="fixed inset-0 z-[60] bg-black/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowLiftChooser(false)}
            />
            <motion.div
              className="fixed bottom-0 left-0 right-0 z-[70] bg-white rounded-t-3xl"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            >
              <div className="flex justify-center pt-3 pb-1">
                <div className="h-1 w-10 rounded-full bg-gray-200" />
              </div>
              <div className="flex items-center justify-between px-5 py-3">
                <h2 className="text-[15px] font-bold text-gray-900">Choose a driver</h2>
                <button onClick={() => setShowLiftChooser(false)} className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center">
                  <XCircle className="h-4 w-4 text-gray-500" />
                </button>
              </div>
              <div className="px-5 pb-6 space-y-2" style={{ paddingBottom: 'calc(32px + env(safe-area-inset-bottom))' }}>
                {travelInfo.drivers.map((driver) => {
                  const myReq = myTravelRequests.find((r) => r.driver_id === driver.id)
                  const suggestion = travelInfo.suggestions.find((s) => s.driver.id === driver.id && s.passenger.id === profile?.id)
                  const hasActiveRequest = myReq && (myReq.status === 'pending' || myReq.status === 'accepted')

                  return (
                    <div key={driver.id} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-3">
                      <PlayerAvatar name={driver.name} avatarUrl={driver.avatar_url} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-gray-800">{driver.name}</p>
                        {suggestion && travelInfo.hasLocationData && (
                          <p className="text-[11px] text-gray-400">{formatDistance(suggestion.distanceMiles)} away</p>
                        )}
                        {driver.max_passengers > 0 && (
                          <p className="text-[10px] text-gray-400">{driver.max_passengers} seat{driver.max_passengers !== 1 ? 's' : ''} available</p>
                        )}
                      </div>
                      {myReq?.status === 'accepted' ? (
                        <span className="flex-shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-bold bg-green-50 border border-green-100 text-green-600">Accepted</span>
                      ) : myReq?.status === 'pending' ? (
                        <span className="flex-shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-bold bg-gray-100 text-gray-400">Requested</span>
                      ) : myReq?.status === 'declined' ? (
                        <button
                          onClick={() => {
                            requestLiftMutation.mutate({ driverId: driver.id })
                            setShowLiftChooser(false)
                          }}
                          disabled={requestLiftMutation.isPending}
                          className="flex-shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-bold bg-gray-100 text-gray-500"
                        >
                          Ask again
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            requestLiftMutation.mutate({ driverId: driver.id })
                            setShowLiftChooser(false)
                          }}
                          disabled={!!hasActiveRequest || requestLiftMutation.isPending}
                          className="flex-shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-bold bg-[#009688] text-white disabled:opacity-50"
                        >
                          Ask
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

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

      {/* Cancel match confirm dialog */}
      <AnimatePresence>
        {confirmCancel && (
          <>
            <motion.div
              className="fixed inset-0 z-[55] bg-black/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfirmCancel(false)}
            />
            <motion.div
              className="fixed bottom-0 left-0 right-0 z-[60] bg-white rounded-t-3xl px-5 pt-6"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              style={{ paddingBottom: 'calc(32px + env(safe-area-inset-bottom))' }}
            >
              <h3 className="text-[16px] font-bold text-gray-900 mb-2">Cancel this match?</h3>
              <p className="text-[13px] text-gray-500 mb-5">
                All players will be notified. The match record will be kept but marked as cancelled.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmCancel(false)}
                  className="flex-1 rounded-2xl border border-gray-200 py-3 text-[14px] font-semibold text-gray-700"
                >
                  Go back
                </button>
                <button
                  onClick={handleCancelMatch}
                  disabled={cancelling}
                  className="flex-1 rounded-2xl bg-amber-500 py-3 text-[14px] font-bold text-white disabled:opacity-60"
                >
                  {cancelling ? 'Cancelling\u2026' : 'Cancel Match'}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Cancel booking confirm dialog */}
      <AnimatePresence>
        {confirmCancelBooking && (
          <>
            <motion.div
              className="fixed inset-0 z-[55] bg-black/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfirmCancelBooking(false)}
            />
            <motion.div
              className="fixed bottom-0 left-0 right-0 z-[60] bg-white rounded-t-3xl px-5 pt-6"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              style={{ paddingBottom: 'calc(32px + env(safe-area-inset-bottom))' }}
            >
              <h3 className="text-[16px] font-bold text-gray-900 mb-2">Cancel this booking?</h3>
              <p className="text-[13px] text-gray-500 mb-5">
                All players will be notified. You'll need to book a new court.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmCancelBooking(false)}
                  className="flex-1 rounded-2xl border border-gray-200 py-3 text-[14px] font-semibold text-gray-700"
                >
                  Go back
                </button>
                <button
                  onClick={handleCancelBooking}
                  disabled={cancellingBooking}
                  className="flex-1 rounded-2xl bg-red-500 py-3 text-[14px] font-bold text-white disabled:opacity-60"
                >
                  {cancellingBooking ? 'Cancelling\u2026' : 'Cancel booking'}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Self-report booking sheet */}
      <SelfReportBookingSheet
        open={showSelfReportSheet}
        onClose={() => setShowSelfReportSheet(false)}
        matchId={data?.match.id ?? ''}
        playerCount={data?.match.player_ids?.length ?? 4}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['match', id] })
          queryClient.invalidateQueries({ queryKey: ['matches'] })
          queryClient.invalidateQueries({ queryKey: ['notifications'] })
        }}
      />

      <AskRingersSheet
        open={showAskRingers}
        onClose={() => setShowAskRingers(false)}
        matchId={match.id}
        groupId={match.group_id ?? null}
        matchDateTime={`${match.match_date}T${match.match_time ?? '00:00'}`}
        currentPlayerIds={match.player_ids ?? []}
        onSent={() => {
          queryClient.invalidateQueries({ queryKey: ['match', id] })
          queryClient.invalidateQueries({ queryKey: ['ringer-requests', match.id] })
        }}
      />

      <PushToOpenSheet
        open={showPushToOpen}
        onClose={() => setShowPushToOpen(false)}
        matchId={match.id}
        currentPlayerIds={match.player_ids ?? []}
        isEditing={(match as any).is_open === true}
        existingMin={(match as any).open_elo_min ?? null}
        existingMax={(match as any).open_elo_max ?? null}
        anchorLat={venueLatLng?.latitude ?? creatorLatLng?.latitude ?? null}
        anchorLng={venueLatLng?.longitude ?? creatorLatLng?.longitude ?? null}
        matchDate={match.match_date ?? null}
        matchTime={(match as any).match_time ?? null}
        onSent={() => {
          queryClient.invalidateQueries({ queryKey: ['match', id] })
        }}
      />

      <AskNetworkSheet
        open={showAskNetwork}
        onClose={() => setShowAskNetwork(false)}
        matchId={match.id}
        groupId={match.group_id ?? null}
        matchDateTime={`${match.match_date}T${match.match_time ?? '00:00'}`}
        currentPlayerIds={match.player_ids ?? []}
        onSent={() => {
          setShowAskNetwork(false)
          queryClient.invalidateQueries({ queryKey: ['match-invitations', match.id] })
          queryClient.invalidateQueries({ queryKey: ['match', id] })
        }}
      />

      {/* Delete match confirm dialog */}
      <AnimatePresence>
        {confirmDelete && (
          <>
            <motion.div
              className="fixed inset-0 z-[55] bg-black/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfirmDelete(false)}
            />
            <motion.div
              className="fixed bottom-0 left-0 right-0 z-[60] bg-white rounded-t-3xl px-5 pt-6"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              style={{ paddingBottom: 'calc(32px + env(safe-area-inset-bottom))' }}
            >
              <h3 className="text-[16px] font-bold text-red-600 mb-2">Delete this match permanently?</h3>
              <p className="text-[13px] text-gray-500 mb-5">
                This cannot be undone. All results, votes, and history will be deleted.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1 rounded-2xl border border-gray-200 py-3 text-[14px] font-semibold text-gray-700"
                >
                  Go back
                </button>
                <button
                  onClick={handleDeleteMatch}
                  disabled={deleting}
                  className="flex-1 rounded-2xl bg-red-500 py-3 text-[14px] font-bold text-white disabled:opacity-60"
                >
                  {deleting ? 'Deleting\u2026' : 'Delete Forever'}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Error toasts */}
      <AnimatePresence>
        {deleteError && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            onClick={() => setDeleteError(null)}
            className="fixed bottom-28 left-4 right-4 z-[70] bg-red-600 text-white text-[13px] font-medium px-4 py-3 rounded-2xl shadow-lg text-center"
          >
            {deleteError}
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {cancelError && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            onClick={() => setCancelError(null)}
            className="fixed bottom-28 left-4 right-4 z-[70] bg-red-600 text-white text-[13px] font-medium px-4 py-3 rounded-2xl shadow-lg text-center"
          >
            {cancelError}
          </motion.div>
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

// ── Teams & Prediction ────────────────────────────────────────────────────────

interface TeamsAndPredictionProps {
  matchId: string
  playerIds: string[]
  players: Profile[]
  savedTeam1: string[] | null
  savedTeam2: string[] | null
  canSwitch: boolean
  isFriendly: boolean
  isLeagueMatch: boolean
  currentUserId: string
}

function TeamsAndPrediction({
  matchId,
  playerIds,
  players,
  savedTeam1,
  savedTeam2,
  canSwitch,
  isFriendly,
  isLeagueMatch,
  currentUserId,
}: TeamsAndPredictionProps) {
  const queryClient = useQueryClient()

  const serverIndex = useMemo(
    () => findPairingIndex(playerIds, savedTeam1, savedTeam2),
    [playerIds, savedTeam1, savedTeam2],
  )

  // Local override when the user clicks Switch; cleared once save confirms.
  const [override, setOverride] = useState<number | null>(null)
  const [savedTick, setSavedTick] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const pairingIndex = override ?? serverIndex

  const teams = useMemo(
    () => pairingToTeams(playerIds, pairingIndex),
    [playerIds, pairingIndex],
  )

  const team1Players = teams.team1.map(
    (id) => players.find((p) => p.id === id),
  ).filter((p): p is Profile => !!p)
  const team2Players = teams.team2.map(
    (id) => players.find((p) => p.id === id),
  ).filter((p): p is Profile => !!p)

  const prediction = calculateMatchPrediction(team1Players, team2Players)

  const handleSwitch = () => {
    if (!canSwitch) return
    const next = (pairingIndex + 1) % PAIRINGS.length
    setOverride(next)
    setSaveError(false)

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      const { team1, team2 } = pairingToTeams(playerIds, next)
      const { error } = await supabase.rpc('switch_teams', {
        p_match_id: matchId,
        p_team1: team1,
        p_team2: team2,
      })
      if (error) {
        setSaveError(true)
        setOverride(null)
        return
      }
      setSavedTick(true)
      queryClient.invalidateQueries({ queryKey: ['match', matchId] })
      // Clear override once the server is the source of truth again.
      setOverride(null)
      setTimeout(() => setSavedTick(false), 2000)
    }, 1000)
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const team1Higher = prediction.team1WinProb >= prediction.team2WinProb

  return (
    <div className="px-5 mb-4">
      <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
        <div className="flex items-center gap-2 mb-3">
          <BarChart2 className="h-4 w-4 text-[#009688]" />
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Teams &amp; Prediction</p>
          <AnimatePresence>
            {savedTick && (
              <motion.span
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="ml-auto inline-flex items-center gap-1 text-[10px] font-semibold text-green-600"
              >
                <CheckCircle className="h-3 w-3" />
                Teams saved
              </motion.span>
            )}
            {saveError && !savedTick && (
              <span className="ml-auto text-[10px] font-semibold text-red-500">Couldn't save — reverted</span>
            )}
          </AnimatePresence>
        </div>

        <TeamRow
          label="Team 1"
          players={team1Players}
          winProb={prediction.team1WinProb}
          highlight={team1Higher && prediction.hasRankings}
        />
        <div className="h-2" />
        <TeamRow
          label="Team 2"
          players={team2Players}
          winProb={prediction.team2WinProb}
          highlight={!team1Higher && prediction.hasRankings}
        />

        {!prediction.hasRankings && (
          <p className="text-[10px] text-gray-400 mt-2 text-center italic">Predictions unavailable</p>
        )}

        {/* Points at stake */}
        {prediction.hasRankings && (
          <PointsAtStakeSection
            team1Players={team1Players}
            team2Players={team2Players}
            isFriendly={isFriendly}
            isLeagueMatch={isLeagueMatch}
            currentUserId={currentUserId}
          />
        )}

        {canSwitch && (
          <button
            onClick={handleSwitch}
            className="mt-3 w-full flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white py-2 text-[12px] font-semibold text-gray-700 active:scale-[0.98] transition-transform"
          >
            <Shuffle className="h-3.5 w-3.5" />
            Switch teams
          </button>
        )}
      </div>
    </div>
  )
}

function TeamRow({
  label,
  players,
  winProb,
  highlight,
}: {
  label: string
  players: Profile[]
  winProb: number
  highlight: boolean
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-xl border px-3 py-2.5',
        highlight ? 'border-teal-200 bg-teal-50/60' : 'border-gray-100 bg-white',
      )}
    >
      <div className="flex-shrink-0">
        <p className={cn('text-[10px] font-bold uppercase tracking-wide', highlight ? 'text-[#009688]' : 'text-gray-400')}>
          {label}
        </p>
      </div>
      <div className="flex-1 flex items-center gap-2 min-w-0">
        {players.map((p) => (
          <div key={p.id} className="flex items-center gap-1.5 min-w-0">
            <PlayerAvatar name={p.name} avatarUrl={p.avatar_url} size="sm" />
            <p className="text-[12px] font-semibold text-gray-800 truncate">{p.name.split(' ')[0]}</p>
          </div>
        ))}
      </div>
      <div className="flex-shrink-0 text-right">
        <p className={cn('text-[16px] font-black leading-none', highlight ? 'text-[#009688]' : 'text-gray-500')}>
          {winProb}%
        </p>
        <p className="text-[9px] text-gray-400 mt-0.5">to win</p>
      </div>
    </div>
  )
}

function PointsAtStakeSection({
  team1Players,
  team2Players,
  isFriendly,
  isLeagueMatch,
  currentUserId,
}: {
  team1Players: Profile[]
  team2Players: Profile[]
  isFriendly: boolean
  isLeagueMatch: boolean
  currentUserId: string
}) {
  if (isFriendly) {
    return (
      <p className="text-[10px] text-gray-400 mt-3 text-center italic">
        Friendly match — no points at stake. Career ratings will not be affected.
      </p>
    )
  }

  const preview = useMemo(
    () => previewMatchOutcomes(
      team1Players.map(p => ({ id: p.id, internal_ranking: (p as any).internal_ranking, matches_played: (p as any).matches_played })),
      team2Players.map(p => ({ id: p.id, internal_ranking: (p as any).internal_ranking, matches_played: (p as any).matches_played })),
      isLeagueMatch,
    ),
    [team1Players, team2Players, isLeagueMatch],
  )

  if (!preview) return null
  const stakes = preview

  const isInTeam1 = team1Players.some(p => p.id === currentUserId)
  const isInTeam2 = team2Players.some(p => p.id === currentUserId)
  const isParticipant = isInTeam1 || isInTeam2

  function getDelta(outcome: typeof stakes.team1Wins, teamNum: 1 | 2): number {
    const deltas = teamNum === 1 ? outcome.team1Deltas : outcome.team2Deltas
    const teamPlayers = teamNum === 1 ? team1Players : team2Players
    if (isParticipant) {
      const idx = teamPlayers.findIndex(p => p.id === currentUserId)
      if (idx >= 0) return deltas[idx]
    }
    return Math.round(deltas.reduce((s, d) => s + d, 0) / deltas.length)
  }

  function getLeaguePts(outcome: typeof stakes.team1Wins, teamNum: 1 | 2): number | null {
    return teamNum === 1 ? outcome.team1LeaguePts : outcome.team2LeaguePts
  }

  const formatDelta = (d: number) => d > 0 ? `+${d}` : `${d}`
  const deltaColor = (d: number) => d > 0 ? 'text-green-700' : d < 0 ? 'text-red-500' : 'text-gray-500'
  const formatLp = (lp: number | null) => {
    if (lp === null) return null
    return `+${lp} league pt${lp !== 1 ? 's' : ''}`
  }

  if (isParticipant) {
    const myTeam: 1 | 2 = isInTeam1 ? 1 : 2
    const winOutcome = myTeam === 1 ? stakes.team1Wins : stakes.team2Wins
    const loseOutcome = myTeam === 1 ? stakes.team2Wins : stakes.team1Wins
    const winD = getDelta(winOutcome, myTeam)
    const drawD = getDelta(stakes.draw, myTeam)
    const loseD = getDelta(loseOutcome, myTeam)
    const winLp = getLeaguePts(winOutcome, myTeam)
    const drawLp = getLeaguePts(stakes.draw, myTeam)
    const loseLp = getLeaguePts(loseOutcome, myTeam)

    return (
      <PointsAtStakeParticipant
        winD={winD} drawD={drawD} loseD={loseD}
        winLp={winLp} drawLp={drawLp} loseLp={loseLp}
        isLeagueMatch={isLeagueMatch}
        stakes={stakes}
        team1Players={team1Players} team2Players={team2Players}
        formatDelta={formatDelta} deltaColor={deltaColor}
        formatLp={formatLp}
      />
    )
  }

  // Spectator view
  const t1Win = Math.round(stakes.team1Wins.team1Deltas.reduce((s, d) => s + d, 0) / stakes.team1Wins.team1Deltas.length)
  const t2Win = Math.round(stakes.team2Wins.team2Deltas.reduce((s, d) => s + d, 0) / stakes.team2Wins.team2Deltas.length)
  const t1Lp = stakes.team1Wins.team1LeaguePts
  const t2Lp = stakes.team2Wins.team2LeaguePts

  return (
    <div className="mt-3 rounded-xl border border-gray-100 bg-white p-3">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Points at stake</p>
      <div className="flex justify-between text-[11px]">
        <div>
          <span className="text-gray-500">Team 1 wins: </span>
          <span className={cn('font-bold', deltaColor(t1Win))}>{formatDelta(t1Win)} ELO</span>
          {t1Lp !== null && <span className="text-[#009688] font-semibold ml-1">+{t1Lp} pts</span>}
        </div>
        <div>
          <span className="text-gray-500">Team 2 wins: </span>
          <span className={cn('font-bold', deltaColor(t2Win))}>{formatDelta(t2Win)} ELO</span>
          {t2Lp !== null && <span className="text-[#009688] font-semibold ml-1">+{t2Lp} pts</span>}
        </div>
      </div>
      {!isLeagueMatch && (
        <p className="text-[10px] text-gray-400 mt-2 text-center italic">No league points — not in a league</p>
      )}
    </div>
  )
}

function PointsAtStakeParticipant({
  winD, drawD, loseD, winLp, drawLp, loseLp,
  isLeagueMatch, stakes, team1Players, team2Players,
  formatDelta, deltaColor, formatLp,
}: {
  winD: number; drawD: number; loseD: number
  winLp: number | null; drawLp: number | null; loseLp: number | null
  isLeagueMatch: boolean
  stakes: any
  team1Players: Profile[]; team2Players: Profile[]
  formatDelta: (d: number) => string; deltaColor: (d: number) => string
  formatLp: (lp: number | null) => string | null
}) {
  const [showAll, setShowAll] = useState(false)

  return (
    <div className="mt-3 rounded-xl border border-gray-100 bg-white p-3">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Points at stake</p>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[12px] text-gray-600">If you win</span>
          <div className="flex items-center gap-3">
            <span className={cn('text-[13px] font-bold', deltaColor(winD))}>{formatDelta(winD)} ELO</span>
            {winLp !== null && <span className="text-[11px] font-semibold text-[#009688]">{formatLp(winLp)}</span>}
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[12px] text-gray-600">If you draw</span>
          <div className="flex items-center gap-3">
            <span className={cn('text-[13px] font-bold', deltaColor(drawD))}>{formatDelta(drawD)} ELO</span>
            {drawLp !== null && <span className="text-[11px] font-semibold text-gray-500">{formatLp(drawLp)}</span>}
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[12px] text-gray-600">If you lose</span>
          <div className="flex items-center gap-3">
            <span className={cn('text-[13px] font-bold', deltaColor(loseD))}>{formatDelta(loseD)} ELO</span>
            {loseLp !== null && <span className="text-[11px] font-semibold text-gray-400">{formatLp(loseLp)}</span>}
          </div>
        </div>
      </div>

      {/* View all players expansion */}
      <button
        onClick={() => setShowAll(v => !v)}
        className="w-full text-center text-[11px] font-semibold text-[#009688] mt-2 py-1"
      >
        {showAll ? 'Hide all players' : 'View all players'}
      </button>

      <AnimatePresence>
        {showAll && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="border-t border-gray-100 mt-1 pt-2 space-y-2">
              <div>
                <p className="text-[10px] font-bold text-teal-600 uppercase tracking-wide mb-1">Team 1 — if they win</p>
                {team1Players.map((p, i) => (
                  <div key={p.id} className="flex items-center justify-between py-0.5">
                    <span className="text-[12px] text-gray-700">{p.name?.split(' ')[0]}</span>
                    <span className={cn('text-[12px] font-bold', deltaColor(stakes.team1Wins.team1Deltas[i]))}>
                      {formatDelta(stakes.team1Wins.team1Deltas[i])} ELO
                    </span>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-[10px] font-bold text-orange-600 uppercase tracking-wide mb-1">Team 2 — if they win</p>
                {team2Players.map((p, i) => (
                  <div key={p.id} className="flex items-center justify-between py-0.5">
                    <span className="text-[12px] text-gray-700">{p.name?.split(' ')[0]}</span>
                    <span className={cn('text-[12px] font-bold', deltaColor(stakes.team2Wins.team2Deltas[i]))}>
                      {formatDelta(stakes.team2Wins.team2Deltas[i])} ELO
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!isLeagueMatch && (
        <p className="text-[10px] text-gray-400 mt-2 text-center italic">No league points — not in a league</p>
      )}
    </div>
  )
}

