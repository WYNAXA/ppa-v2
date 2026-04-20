import { useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, Share2, Plus, Check } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { MatchCard, type MatchCardData } from '@/components/shared/MatchCard'
import { PlayerAvatar } from '@/components/shared/PlayerAvatar'
import { CreateEventSheet } from '@/components/community/CreateEventSheet'
import { CreateMatchSheet } from '@/components/play/CreateMatchSheet'

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = 'members' | 'matches' | 'polls' | 'events' | 'leagues'

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'members', label: 'Members' },
  { id: 'matches', label: 'Matches' },
  { id: 'polls',   label: 'Polls'   },
  { id: 'events',  label: 'Events'  },
  { id: 'leagues', label: 'Leagues' },
]

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
        .select('user_id, role')
        .eq('group_id', groupId)
        .eq('status', 'approved')
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

function MembersTab({ members, isLoading, isAdmin, groupId, inviteCode }: {
  members: Member[]
  isLoading: boolean
  isAdmin: boolean
  groupId: string
  inviteCode: string | null
}) {
  const [copied, setCopied] = useState(false)

  function copyInvite() {
    // Use invite_code if available, otherwise use group URL
    const url = inviteCode
      ? `${window.location.origin}/join/${inviteCode}`
      : `${window.location.origin}/community/groups/${groupId}`

    const doWrite = () => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }

    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(doWrite).catch(() => {
        fallbackCopy(url)
        doWrite()
      })
    } else {
      fallbackCopy(url)
      doWrite()
    }
  }

  function fallbackCopy(text: string) {
    const el = document.createElement('textarea')
    el.value = text
    el.style.position = 'fixed'
    el.style.opacity = '0'
    document.body.appendChild(el)
    el.select()
    document.execCommand('copy')
    document.body.removeChild(el)
  }

  if (isLoading) return <TabSkeleton />

  return (
    <div>
      {isAdmin && (
        <button
          onClick={copyInvite}
          className="w-full flex items-center justify-center gap-2 rounded-xl border border-teal-200 bg-teal-50 py-2.5 mb-4 text-[13px] font-semibold text-teal-700 transition-colors"
        >
          {copied ? (
            <><Check className="h-4 w-4" /> Copied!</>
          ) : (
            <><Share2 className="h-4 w-4" /> Copy invite link</>
          )}
        </button>
      )}
      {members.length === 0 ? (
        <EmptyTab message="No members yet" />
      ) : (
        <div className="space-y-2">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-3 rounded-xl bg-gray-50 px-3 py-2.5">
              <PlayerAvatar name={m.name} avatarUrl={m.avatar_url} size="md" />
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-semibold text-gray-900 truncate">{m.name}</p>
                {m.ranking_points != null && (
                  <p className="text-[11px] text-gray-400">{m.ranking_points} pts</p>
                )}
              </div>
              {m.role === 'admin' && (
                <span className="rounded-full bg-teal-50 border border-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-600">
                  Admin
                </span>
              )}
            </div>
          ))}
        </div>
      )}
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

  // BUG 7: Store active tab in URL so browser back restores correct tab
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
  const memberCount = members?.length ?? 0

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
