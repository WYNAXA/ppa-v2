import { useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, Share2, Plus, Check, MoreHorizontal, UserX, Shield, Star } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { MatchCard, type MatchCardData } from '@/components/shared/MatchCard'
import { PlayerAvatar } from '@/components/shared/PlayerAvatar'
import { CreateEventSheet } from '@/components/community/CreateEventSheet'
import { CreateMatchSheet } from '@/components/play/CreateMatchSheet'

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = 'members' | 'matches' | 'polls' | 'events' | 'leagues' | 'settings'

interface Group {
  id: string
  name: string
  description: string | null
  city: string | null
  visibility: string | null
  admin_id: string
  invite_code: string | null
}

interface Member {
  id: string
  name: string
  avatar_url: string | null
  ranking_points: number | null
  role: string
  memberStatus: string
}

interface Poll {
  id: string
  title: string
  closes_at: string | null
  status: string
  created_by: string
}

interface Event {
  id: string
  title: string
  start_time: string
  end_time: string | null
  location: string | null
  status: string
}

interface League {
  id: string
  name: string
  status: string
  city: string | null
}

// ── Data hooks ────────────────────────────────────────────────────────────────

function useGroup(groupId: string) {
  return useQuery({
    queryKey: ['group', groupId],
    enabled: !!groupId,
    queryFn: async (): Promise<Group | null> => {
      const { data, error } = await supabase
        .from('groups')
        .select('id, name, description, city, visibility, admin_id, invite_code')
        .eq('id', groupId)
        .single()
      if (error) throw error
      return data
    },
  })
}

function useGroupMembers(groupId: string) {
  return useQuery({
    queryKey: ['group-members', groupId],
    enabled: !!groupId,
    queryFn: async (): Promise<Member[]> => {
      // Two-step: fetch membership rows then profiles separately
      // (avoids unreliable implicit FK join on user_id)
      const { data: memberRows, error } = await supabase
        .from('group_members')
        .select('user_id, role, status')
        .eq('group_id', groupId)
        .in('status', ['approved', 'ringer'])
        .order('joined_at', { ascending: true })

      if (error) throw error
      if (!memberRows || memberRows.length === 0) return []

      const userIds = memberRows.map((m) => m.user_id)
      const { data: profileRows } = await supabase
        .from('profiles')
        .select('id, name, avatar_url, ranking_points')
        .in('id', userIds)

      const profileMap = Object.fromEntries((profileRows ?? []).map((p) => [p.id, p]))

      return memberRows
        .map((m) => {
          const p = profileMap[m.user_id]
          if (!p) return null
          return {
            id:             p.id,
            name:           p.name,
            avatar_url:     p.avatar_url ?? null,
            ranking_points: p.ranking_points ?? null,
            role:           m.role as string,
            memberStatus:   m.status as string,
          }
        })
        .filter(Boolean) as Member[]
    },
  })
}

function useGroupMatches(groupId: string) {
  return useQuery({
    queryKey: ['group-matches', groupId],
    enabled: !!groupId,
    queryFn: async (): Promise<MatchCardData[]> => {
      const { data: matches, error } = await supabase
        .from('matches')
        .select('*')
        .eq('group_id', groupId)
        .order('match_date', { ascending: false })
        .limit(50)

      if (error) throw error
      if (!matches || matches.length === 0) return []

      const allPlayerIds = [...new Set(matches.flatMap((m) => m.player_ids ?? []))]
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name, avatar_url')
        .in('id', allPlayerIds)

      return matches.map((m) => ({
        id:                m.id,
        match_date:        m.match_date,
        match_time:        m.match_time,
        booked_venue_name: m.booked_venue_name,
        player_ids:        m.player_ids ?? [],
        match_type:        m.match_type,
        status:            m.status,
        players:           (profiles ?? []).filter((p) => m.player_ids?.includes(p.id)),
      }))
    },
  })
}

function useGroupPolls(groupId: string) {
  return useQuery({
    queryKey: ['group-polls', groupId],
    enabled: !!groupId,
    queryFn: async (): Promise<Poll[]> => {
      const { data, error } = await supabase
        .from('polls')
        .select('id, title, closes_at, status, created_by')
        .eq('group_id', groupId)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data ?? []
    },
  })
}

function useGroupEvents(groupId: string) {
  return useQuery({
    queryKey: ['group-events', groupId],
    enabled: !!groupId,
    queryFn: async (): Promise<Event[]> => {
      const { data, error } = await supabase
        .from('events')
        .select('id, title, start_time, end_time, location, status')
        .eq('group_id', groupId)
        .order('start_time', { ascending: true })

      if (error) throw error
      return data ?? []
    },
  })
}

function useGroupLeagues(groupId: string) {
  return useQuery({
    queryKey: ['group-leagues', groupId],
    enabled: !!groupId,
    queryFn: async (): Promise<League[]> => {
      const { data, error } = await supabase
        .from('leagues')
        .select('id, name, status, city')
        .contains('linked_group_ids', [groupId])
        .order('created_at', { ascending: false })

      if (error) throw error
      return data ?? []
    },
  })
}

// ── Tab: Members ──────────────────────────────────────────────────────────────

function MembersTab({ members, isLoading, isAdmin, groupId, inviteCode, currentUserId }: {
  members: Member[]
  isLoading: boolean
  isAdmin: boolean
  groupId: string
  inviteCode: string | null
  currentUserId: string
}) {
  const queryClient = useQueryClient()
  const [copied, setCopied] = useState(false)
  const [memberFilter, setMemberFilter] = useState<'members' | 'ringers'>('members')
  const [menuMemberId, setMenuMemberId] = useState<string | null>(null)

  const memberAction = useMutation({
    mutationFn: async ({ action, memberId }: { action: 'make_admin' | 'make_ringer' | 'remove_ringer' | 'remove'; memberId: string }) => {
      if (action === 'make_admin') {
        await supabase.from('group_members').update({ role: 'admin' }).eq('group_id', groupId).eq('user_id', memberId)
        await supabase.from('groups').update({ admin_id: memberId }).eq('id', groupId)
      } else if (action === 'make_ringer') {
        await supabase.from('group_members').update({ status: 'ringer' }).eq('group_id', groupId).eq('user_id', memberId)
      } else if (action === 'remove_ringer') {
        await supabase.from('group_members').update({ status: 'approved' }).eq('group_id', groupId).eq('user_id', memberId)
      } else if (action === 'remove') {
        await supabase.from('group_members').delete().eq('group_id', groupId).eq('user_id', memberId)
      }
    },
    onSuccess: () => {
      if (navigator.vibrate) navigator.vibrate(10)
      setMenuMemberId(null)
      queryClient.invalidateQueries({ queryKey: ['group-members', groupId] })
    },
  })

  function copyInvite() {
    const url = inviteCode
      ? `${window.location.origin}/join/${inviteCode}`
      : `${window.location.origin}/community/groups/${groupId}`
    const doWrite = () => { setCopied(true); setTimeout(() => setCopied(false), 2000) }
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(doWrite).catch(() => { fallbackCopy(url); doWrite() })
    } else { fallbackCopy(url); doWrite() }
  }

  function fallbackCopy(text: string) {
    const el = document.createElement('textarea')
    el.value = text; el.style.position = 'fixed'; el.style.opacity = '0'
    document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el)
  }

  if (isLoading) return <TabSkeleton />

  const filtered = members.filter((m) =>
    memberFilter === 'ringers' ? m.memberStatus === 'ringer' : m.memberStatus !== 'ringer'
  )
  const menuMember = members.find((m) => m.id === menuMemberId)

  return (
    <div>
      {isAdmin && (
        <button
          onClick={copyInvite}
          className="w-full flex items-center justify-center gap-2 rounded-xl border border-teal-200 bg-teal-50 py-2.5 mb-4 text-[13px] font-semibold text-teal-700 transition-colors"
        >
          {copied ? <><Check className="h-4 w-4" /> Copied!</> : <><Share2 className="h-4 w-4" /> Copy invite link</>}
        </button>
      )}

      {/* Member/Ringer filter */}
      <div className="flex bg-gray-100 rounded-xl p-1 gap-1 mb-4">
        {(['members', 'ringers'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setMemberFilter(f)}
            className={`flex-1 rounded-lg py-2 text-[13px] font-semibold transition-colors capitalize ${
              memberFilter === f ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
            }`}
          >
            {f === 'members' ? `Members (${members.filter(m => m.memberStatus !== 'ringer').length})` : `Ringers (${members.filter(m => m.memberStatus === 'ringer').length})`}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyTab message={memberFilter === 'ringers' ? 'No ringers yet' : 'No members yet'} />
      ) : (
        <div className="space-y-2">
          {filtered.map((m) => (
            <div key={m.id} className="flex items-center gap-3 rounded-xl bg-gray-50 px-3 py-2.5">
              <PlayerAvatar name={m.name} avatarUrl={m.avatar_url} size="md" />
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-semibold text-gray-900 truncate">{m.name}</p>
                {m.ranking_points != null && <p className="text-[11px] text-gray-400">{m.ranking_points} pts</p>}
              </div>
              {m.role === 'admin' && (
                <span className="rounded-full bg-teal-50 border border-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-600">Admin</span>
              )}
              {m.memberStatus === 'ringer' && (
                <span className="rounded-full bg-orange-50 border border-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-500">Ringer</span>
              )}
              {isAdmin && m.id !== currentUserId && (
                <button
                  onClick={() => setMenuMemberId(m.id)}
                  className="h-7 w-7 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 flex-shrink-0"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Member action sheet */}
      <AnimatePresence>
        {menuMemberId && menuMember && (
          <>
            <motion.div
              className="fixed inset-0 z-[55] bg-black/40"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setMenuMemberId(null)}
            />
            <motion.div
              className="fixed bottom-0 left-0 right-0 z-[60] bg-white rounded-t-3xl px-5 pt-5"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}
            >
              <div className="flex items-center gap-3 mb-4 pb-3 border-b border-gray-100">
                <PlayerAvatar name={menuMember.name} avatarUrl={menuMember.avatar_url} size="md" />
                <div>
                  <p className="text-[15px] font-bold text-gray-900">{menuMember.name}</p>
                  <p className="text-[12px] text-gray-400 capitalize">{menuMember.memberStatus}</p>
                </div>
              </div>
              <div className="space-y-1">
                {menuMember.role !== 'admin' && (
                  <button
                    onClick={() => memberAction.mutate({ action: 'make_admin', memberId: menuMemberId })}
                    disabled={memberAction.isPending}
                    className="w-full flex items-center gap-3 rounded-xl px-3 py-3 text-[14px] font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    <Shield className="h-4 w-4 text-teal-500" />
                    Make Admin
                  </button>
                )}
                {menuMember.memberStatus === 'approved' ? (
                  <button
                    onClick={() => memberAction.mutate({ action: 'make_ringer', memberId: menuMemberId })}
                    disabled={memberAction.isPending}
                    className="w-full flex items-center gap-3 rounded-xl px-3 py-3 text-[14px] font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    <Star className="h-4 w-4 text-orange-400" />
                    Mark as Ringer
                  </button>
                ) : (
                  <button
                    onClick={() => memberAction.mutate({ action: 'remove_ringer', memberId: menuMemberId })}
                    disabled={memberAction.isPending}
                    className="w-full flex items-center gap-3 rounded-xl px-3 py-3 text-[14px] font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    <Star className="h-4 w-4 text-gray-400" />
                    Remove Ringer Status
                  </button>
                )}
                <button
                  onClick={() => memberAction.mutate({ action: 'remove', memberId: menuMemberId })}
                  disabled={memberAction.isPending}
                  className="w-full flex items-center gap-3 rounded-xl px-3 py-3 text-[14px] font-semibold text-red-500 hover:bg-red-50"
                >
                  <UserX className="h-4 w-4" />
                  Remove from Group
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Tab: Matches ──────────────────────────────────────────────────────────────

function MatchesTab({ matches, isLoading, userId, onCreateMatch }: {
  matches: MatchCardData[]
  isLoading: boolean
  userId: string
  onCreateMatch: () => void
}) {
  const [view, setView] = useState<'upcoming' | 'past'>('upcoming')
  const today = format(new Date(), 'yyyy-MM-dd')

  const filtered = matches.filter((m) =>
    view === 'upcoming' ? m.match_date >= today : m.match_date < today
  )

  if (isLoading) return <TabSkeleton />

  return (
    <div>
      <button
        onClick={onCreateMatch}
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#009688] py-2.5 mb-4 text-[13px] font-bold text-white"
      >
        <Plus className="h-4 w-4" />
        Create group match
      </button>

      {/* Upcoming / Past toggle */}
      <div className="flex bg-gray-100 rounded-xl p-1 gap-1 mb-4">
        {(['upcoming', 'past'] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`flex-1 rounded-lg py-2 text-[13px] font-semibold transition-colors capitalize ${
              view === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
            }`}
          >
            {v === 'upcoming' ? 'Upcoming' : 'Past'}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyTab
          message={view === 'upcoming' ? 'No upcoming matches' : 'No past matches'}
          sub={view === 'upcoming' ? 'Create one above' : undefined}
        />
      ) : (
        <div className="space-y-2.5">
          {filtered.map((match, i) => (
            <MatchCard key={match.id} match={match} currentUserId={userId} action="view" index={i} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Tab: Polls ────────────────────────────────────────────────────────────────

function PollsTab({ polls, isLoading, groupId }: {
  polls: Poll[]
  isLoading: boolean
  groupId: string
}) {
  const navigate = useNavigate()
  const active   = polls.filter((p) => p.status === 'open')
  const past     = polls.filter((p) => p.status !== 'open')

  if (isLoading) return <TabSkeleton />

  return (
    <div>
      <button
        onClick={() => navigate(`/play/availability/create?group_id=${groupId}`)}
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#009688] py-2.5 mb-4 text-[13px] font-bold text-white"
      >
        <Plus className="h-4 w-4" />
        Create availability poll
      </button>

      {polls.length === 0 ? (
        <EmptyTab message="No polls yet" sub="Create one to find the best time to play" />
      ) : (
        <>
          {active.length > 0 && (
            <div className="mb-4">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2">Active</p>
              <div className="space-y-2">
                {active.map((poll) => <PollCard key={poll.id} poll={poll} />)}
              </div>
            </div>
          )}
          {past.length > 0 && (
            <div>
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2">Past</p>
              <div className="space-y-2">
                {past.map((poll) => <PollCard key={poll.id} poll={poll} />)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function PollCard({ poll }: { poll: Poll }) {
  const navigate = useNavigate()
  return (
    <button
      onClick={() => navigate(`/play/availability/${poll.id}`)}
      className="w-full text-left rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 hover:border-teal-200 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-gray-900 truncate">{poll.title}</p>
          {poll.closes_at && (
            <p className="text-[11px] text-gray-400 mt-0.5">
              Closes {format(parseISO(poll.closes_at), 'EEE d MMM, HH:mm')}
            </p>
          )}
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold flex-shrink-0 mt-0.5 ${
          poll.status === 'open'
            ? 'bg-green-50 text-green-600 border border-green-100'
            : 'bg-gray-100 text-gray-500'
        }`}>
          {poll.status === 'open' ? 'Open' : 'Closed'}
        </span>
      </div>
    </button>
  )
}

// ── Tab: Events ───────────────────────────────────────────────────────────────

function EventsTab({ events, isLoading, groupId, isAdmin }: {
  events: Event[]
  isLoading: boolean
  groupId: string
  isAdmin: boolean
}) {
  const navigate    = useNavigate()
  const [showCreate, setShowCreate] = useState(false)
  const queryClient = useQueryClient()

  if (isLoading) return <TabSkeleton />

  return (
    <div>
      {isAdmin && (
        <button
          onClick={() => setShowCreate(true)}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#009688] py-2.5 mb-4 text-[13px] font-bold text-white"
        >
          <Plus className="h-4 w-4" />
          Create event
        </button>
      )}

      {events.length === 0 ? (
        <EmptyTab message="No events yet" sub={isAdmin ? 'Create one above' : 'Check back later'} />
      ) : (
        <div className="space-y-2">
          {events.map((event) => (
            <button
              key={event.id}
              onClick={() => navigate(`/community/events/${event.id}`)}
              className="w-full text-left rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 hover:border-teal-200 transition-colors"
            >
              <p className="text-[13px] font-semibold text-gray-900">{event.title}</p>
              <p className="text-[12px] text-gray-500 mt-0.5">
                {format(parseISO(event.start_time), 'EEE d MMM · HH:mm')}
                {event.end_time && ` – ${format(parseISO(event.end_time), 'HH:mm')}`}
              </p>
              {event.location && (
                <p className="text-[11px] text-gray-400 mt-0.5">{event.location}</p>
              )}
            </button>
          ))}
        </div>
      )}

      <CreateEventSheet
        open={showCreate}
        groupId={groupId}
        onClose={() => {
          setShowCreate(false)
          queryClient.invalidateQueries({ queryKey: ['group-events', groupId] })
        }}
      />
    </div>
  )
}

// ── Tab: Leagues ──────────────────────────────────────────────────────────────

function LeaguesTab({ leagues, isLoading, groupId }: {
  leagues: League[]
  isLoading: boolean
  groupId: string
}) {
  const navigate = useNavigate()

  if (isLoading) return <TabSkeleton />

  const STATUS_STYLE: Record<string, string> = {
    active:    'bg-green-50 text-green-600 border-green-100',
    upcoming:  'bg-blue-50 text-blue-600 border-blue-100',
    completed: 'bg-gray-100 text-gray-500 border-gray-200',
  }

  return (
    <div>
      <button
        onClick={() => navigate(`/compete/leagues/create?group_id=${groupId}`)}
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#009688] py-2.5 mb-4 text-[13px] font-bold text-white"
      >
        <Plus className="h-4 w-4" />
        Create league
      </button>

      {leagues.length === 0 ? (
        <EmptyTab message="No leagues yet" sub="Create one above to start competing" />
      ) : (
        <div className="space-y-2">
          {leagues.map((league) => (
            <button
              key={league.id}
              onClick={() => navigate(`/compete/leagues/${league.id}`)}
              className="w-full text-left rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 hover:border-teal-200 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-gray-900 truncate">{league.name}</p>
                  {league.city && (
                    <p className="text-[11px] text-gray-400 mt-0.5">{league.city}</p>
                  )}
                </div>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold flex-shrink-0 capitalize ${STATUS_STYLE[league.status] ?? 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                  {league.status}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Tab: Settings ────────────────────────────────────────────────────────────

function SettingsTab({ group, isAdmin, currentUserId }: {
  group: Group
  isAdmin: boolean
  currentUserId: string
}) {
  const navigate    = useNavigate()
  const queryClient = useQueryClient()
  const [name, setName]             = useState(group.name)
  const [visibility, setVisibility] = useState(group.visibility ?? 'public')
  const [saving, setSaving]         = useState(false)
  const [saved, setSaved]           = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)

  async function saveSettings() {
    setSaving(true)
    await supabase.from('groups').update({ name, visibility }).eq('id', group.id)
    setSaving(false)
    setSaved(true)
    if (navigator.vibrate) navigator.vibrate(10)
    setTimeout(() => setSaved(false), 2000)
    queryClient.invalidateQueries({ queryKey: ['group', group.id] })
  }

  async function leaveGroup() {
    await supabase.from('group_members').delete().eq('group_id', group.id).eq('user_id', currentUserId)
    queryClient.invalidateQueries({ queryKey: ['group-members', group.id] })
    navigate('/community')
  }

  return (
    <div className="space-y-4">
      {isAdmin && (
        <div className="rounded-2xl border border-gray-100 p-4 space-y-3">
          <p className="text-[12px] font-bold text-gray-400 uppercase tracking-wide">Group Settings</p>
          <div>
            <label className="text-[12px] text-gray-500 font-medium mb-1 block">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-[14px] text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#009688]"
            />
          </div>
          <div>
            <label className="text-[12px] text-gray-500 font-medium mb-1 block">Visibility</label>
            <div className="flex gap-2">
              {(['public', 'open', 'private'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setVisibility(v)}
                  className={`flex-1 rounded-xl border py-2 text-[12px] font-semibold capitalize transition-colors ${
                    visibility === v
                      ? 'border-teal-300 bg-teal-50 text-teal-700'
                      : 'border-gray-200 text-gray-500'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={saveSettings}
            disabled={saving}
            className="w-full rounded-xl bg-[#009688] py-3 text-[14px] font-bold text-white disabled:opacity-60"
          >
            {saved ? 'Saved!' : saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      )}

      <div className="rounded-2xl border border-red-100 p-4">
        <p className="text-[12px] font-bold text-gray-400 uppercase tracking-wide mb-3">Danger Zone</p>
        <button
          onClick={() => setConfirmLeave(true)}
          className="w-full rounded-xl border border-red-200 py-3 text-[14px] font-semibold text-red-500"
        >
          Leave Group
        </button>
      </div>

      <AnimatePresence>
        {confirmLeave && (
          <>
            <motion.div
              className="fixed inset-0 z-[55] bg-black/40"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setConfirmLeave(false)}
            />
            <motion.div
              className="fixed bottom-0 left-0 right-0 z-[60] bg-white rounded-t-3xl px-5 pt-6"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              style={{ paddingBottom: 'calc(32px + env(safe-area-inset-bottom))' }}
            >
              <p className="text-[16px] font-bold text-gray-900 text-center mb-2">Leave group?</p>
              <p className="text-[13px] text-gray-500 text-center mb-6">You can rejoin later if the group is public.</p>
              <div className="flex gap-3">
                <button onClick={() => setConfirmLeave(false)} className="flex-1 rounded-2xl border border-gray-200 py-3 text-[14px] font-semibold text-gray-700">Cancel</button>
                <button onClick={leaveGroup} className="flex-1 rounded-2xl bg-red-500 py-3 text-[14px] font-bold text-white">Leave</button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function TabSkeleton() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-14 rounded-xl bg-gray-100 animate-pulse" />
      ))}
    </div>
  )
}

function EmptyTab({ message, sub }: { message: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-200 p-8 text-center">
      <p className="text-[13px] font-semibold text-gray-500">{message}</p>
      {sub && <p className="text-[12px] text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function GroupDetailPage() {
  const { id: groupId = '' } = useParams<{ id: string }>()
  const navigate              = useNavigate()
  const { profile }           = useAuth()
  const userId                = profile?.id ?? ''

  // Store active tab in URL so browser back restores correct tab
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = (searchParams.get('tab') ?? 'members') as Tab
  function setActiveTab(tab: Tab) {
    setSearchParams({ tab }, { replace: true })
  }


  // BUG 4: CreateMatchSheet state — open inline instead of navigating away
  const [createMatchOpen, setCreateMatchOpen] = useState(false)

  const { data: group,   isLoading: loadingGroup   } = useGroup(groupId)
  const { data: members, isLoading: loadingMembers } = useGroupMembers(groupId)
  const { data: matches, isLoading: loadingMatches } = useGroupMatches(groupId)
  const { data: polls,   isLoading: loadingPolls   } = useGroupPolls(groupId)
  const { data: events,  isLoading: loadingEvents  } = useGroupEvents(groupId)
  const { data: leagues, isLoading: loadingLeagues } = useGroupLeagues(groupId)

  const isAdmin     = group?.admin_id === userId
  const memberCount = (members ?? []).filter(m => m.memberStatus !== 'ringer').length

  const TABS: Array<{ id: Tab; label: string }> = [
    { id: 'members',  label: 'Members'  },
    { id: 'matches',  label: 'Matches'  },
    { id: 'polls',    label: 'Polls'    },
    { id: 'events',   label: 'Events'   },
    { id: 'leagues',  label: 'Leagues'  },
    ...(isAdmin ? [{ id: 'settings' as Tab, label: 'Settings' }] : []),
  ]

  if (loadingGroup) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#009688] border-t-transparent" />
      </div>
    )
  }

  if (!group) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 text-center">
        <p className="text-[14px] font-semibold text-gray-500">Group not found</p>
        <button onClick={() => navigate('/community')} className="mt-4 text-[13px] text-teal-600 font-semibold">
          Back to Community
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-white">
      {/* Header */}
      <div className="px-5 pt-14 pb-4">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => navigate('/community')}
            className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0"
          >
            <ChevronLeft className="h-5 w-5 text-gray-600" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-[20px] font-bold text-gray-900 truncate">{group.name}</h1>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-[12px] text-gray-400">
                {memberCount} member{memberCount !== 1 ? 's' : ''}
              </span>
              {group.city && (
                <>
                  <span className="text-gray-300">·</span>
                  <span className="text-[12px] text-gray-400">{group.city}</span>
                </>
              )}
              {isAdmin && (
                <span className="rounded-full bg-teal-50 border border-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-600">
                  Admin
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="relative px-5 border-b border-gray-100">
        <div className="flex gap-5 overflow-x-auto no-scrollbar">
          {TABS.map((tab) => {
            const active = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative pb-3 text-[13px] font-semibold flex-shrink-0 transition-colors ${
                  active ? 'text-[#009688]' : 'text-gray-400'
                }`}
              >
                {tab.label}
                {active && (
                  <motion.div
                    layoutId="tab-underline"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#009688] rounded-full"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="px-5 pt-4 pb-32"
        >
          {activeTab === 'members' && (
            <MembersTab
              members={members ?? []}
              isLoading={loadingMembers}
              isAdmin={isAdmin}
              groupId={groupId}
              inviteCode={group.invite_code}
              currentUserId={userId}
            />
          )}
          {activeTab === 'matches' && (
            <MatchesTab
              matches={matches ?? []}
              isLoading={loadingMatches}
              userId={userId}
              onCreateMatch={() => setCreateMatchOpen(true)}
            />
          )}
          {activeTab === 'polls' && (
            <PollsTab
              polls={polls ?? []}
              isLoading={loadingPolls}
              groupId={groupId}
            />
          )}
          {activeTab === 'events' && (
            <EventsTab
              events={events ?? []}
              isLoading={loadingEvents}
              groupId={groupId}
              isAdmin={isAdmin}
            />
          )}
          {activeTab === 'leagues' && (
            <LeaguesTab
              leagues={leagues ?? []}
              isLoading={loadingLeagues}
              groupId={groupId}
            />
          )}
          {activeTab === 'settings' && isAdmin && (
            <SettingsTab
              group={group}
              isAdmin={isAdmin}
              currentUserId={userId}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* BUG 4: CreateMatchSheet inline with group_id pre-filled */}
      <CreateMatchSheet
        open={createMatchOpen}
        onClose={() => setCreateMatchOpen(false)}
        defaultGroupId={groupId}
      />
    </div>
  )
}
