import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, MapPin, Clock, Calendar, Share2, Edit2, LogOut, BookOpen, Trophy } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PlayerAvatar } from '@/components/shared/PlayerAvatar'
import { RecordResultSheet } from '@/components/play/RecordResultSheet'
import { EditMatchSheet } from '@/components/play/EditMatchSheet'
import { cn } from '@/lib/utils'
import type { Match, MatchResult, Profile } from '@/lib/types'

const TYPE_STYLES: Record<string, { label: string; className: string }> = {
  competitive: { label: 'Competitive', className: 'bg-orange-50 text-orange-600 border-orange-100' },
  friendly:    { label: 'Friendly',    className: 'bg-blue-50 text-blue-600 border-blue-100' },
  casual:      { label: 'Casual',      className: 'bg-gray-50 text-gray-500 border-gray-100' },
  group:       { label: 'Group',       className: 'bg-teal-50 text-teal-600 border-teal-100' },
}

const STATUS_STYLES: Record<string, { label: string; className: string; dot: string }> = {
  confirmed:  { label: 'Confirmed',  className: 'bg-green-50 text-green-700 border-green-100',   dot: 'bg-green-400' },
  scheduled:  { label: 'Confirmed',  className: 'bg-green-50 text-green-700 border-green-100',   dot: 'bg-green-400' },
  open:       { label: 'Open',       className: 'bg-orange-50 text-orange-600 border-orange-100', dot: 'bg-orange-400' },
  pending:    { label: 'Pending',    className: 'bg-yellow-50 text-yellow-700 border-yellow-100', dot: 'bg-yellow-400' },
  completed:  { label: 'Completed',  className: 'bg-gray-50 text-gray-500 border-gray-100',      dot: 'bg-gray-400' },
  cancelled:  { label: 'Cancelled',  className: 'bg-red-50 text-red-500 border-red-100',         dot: 'bg-red-400' },
}

async function fetchMatchDetail(id: string): Promise<{
  match: Match
  players: Profile[]
  result: MatchResult | null
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
      .select('id, name, email, avatar_url, playtomic_level, ranking_points')
      .in('id', playerIds)
    players = data ?? []
  }

  const { data: result } = await supabase
    .from('match_results')
    .select('*')
    .eq('match_id', id)
    .maybeSingle()

  return { match, players, result: result ?? null }
}

function ResultBanner({ result, players }: { result: MatchResult; players: Profile[] }) {
  const getPlayer = (id: string) => players.find((p) => p.id === id)
  const completedSets: Array<{ team1: number; team2: number }> =
    (result.sets_data ?? []).filter((s) => s.team1 !== '' && s.team2 !== '') as Array<{ team1: number; team2: number }>

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

      {/* Teams row */}
      <div className="flex items-center justify-between gap-3">
        {/* Team 1 */}
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

        {/* Scores */}
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
              {completedSets.map((s) => `${s.team1}-${s.team2}`).join('  ')}
            </p>
          )}
        </div>

        {/* Team 2 */}
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
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [showRecordResult, setShowRecordResult] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [copied, setCopied] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [leaving, setLeaving] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['match', id],
    queryFn: () => fetchMatchDetail(id!),
    enabled: !!id,
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

  const { match, players, result } = data
  const currentUserId = profile?.id ?? ''
  const isParticipant = match.player_ids.includes(currentUserId)
  const isCreator = match.created_by === currentUserId
  const canRecordResult = isParticipant && match.status !== 'completed' && match.status !== 'cancelled' && match.player_ids.length === 4 && !result

  const typeStyle = TYPE_STYLES[match.match_type ?? 'group'] ?? TYPE_STYLES.group
  const statusStyle = STATUS_STYLES[match.status] ?? { label: match.status, className: 'bg-gray-50 text-gray-500 border-gray-100', dot: 'bg-gray-300' }

  const formattedDate = (() => {
    try {
      return format(parseISO(match.match_date), 'EEEE, d MMMM yyyy')
    } catch { return match.match_date }
  })()

  const handleShare = async () => {
    const url = `${window.location.origin}/matches/${id}`
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

  // Build 4 player slots — fill empty slots with guest players if available
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
        {/* Badges */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold', typeStyle.className)}>
            {typeStyle.label}
          </span>
          <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold', statusStyle.className)}>
            <span className={cn('h-1.5 w-1.5 rounded-full', statusStyle.dot)} />
            {statusStyle.label}
          </span>
        </div>

        {/* Date + time */}
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

        {/* Venue */}
        {match.booked_venue_name && (
          <div className="flex items-center gap-2 mb-2">
            <MapPin className="h-4 w-4 text-gray-400 flex-shrink-0" />
            <p className="text-[13px] text-gray-700 truncate">
              {match.booked_venue_name}
              {match.booked_court_number != null && ` · Court ${match.booked_court_number}`}
            </p>
          </div>
        )}

        {/* Notes */}
        {match.notes && (
          <p className="mt-2 text-[12px] text-gray-500 italic">{match.notes}</p>
        )}
      </motion.div>

      {/* Result banner */}
      {result && <ResultBanner result={result} players={players} />}

      {/* Players */}
      <div className="px-5 mb-4">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2">Players</p>
        <div className="grid grid-cols-2 gap-2">
          {slots.map((player, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className={cn(
                'flex items-center gap-2.5 rounded-xl border px-3 py-2.5',
                player ? 'border-gray-100 bg-white' : 'border-dashed border-gray-200 bg-gray-50'
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
                    {'ranking_points' in player && player.ranking_points != null && (
                      <p className="text-[10px] text-gray-400">{player.ranking_points} pts</p>
                    )}
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
                      onClick={() => navigate(`/matches/${match.id}/invite`)}
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
          ))}
        </div>
      </div>

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
          {isCreator && match.status !== 'completed' && match.status !== 'cancelled' && (
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
          {!match.booked_venue_name && match.status !== 'completed' && match.status !== 'cancelled' && (
            <button
              onClick={() => navigate(`/play/book-court?match_id=${match.id}`)}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 py-3 text-[13px] font-semibold text-gray-700"
            >
              <BookOpen className="h-4 w-4" />
              Book Court
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

      {/* Record Result Sheet */}
      <RecordResultSheet
        open={showRecordResult}
        onClose={() => setShowRecordResult(false)}
        match={match}
        players={players}
        currentUserId={currentUserId}
      />

      {/* Edit Match Sheet */}
      <EditMatchSheet
        open={showEdit}
        onClose={() => setShowEdit(false)}
        match={match}
      />

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
