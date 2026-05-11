import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Plus, Search, Users, MapPin, ChevronRight, UserPlus, Check, Clock, Calendar } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { format, parseISO } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PlayerAvatar } from '@/components/shared/PlayerAvatar'
import { CreateGroupSheet } from '@/components/community/CreateGroupSheet'
import { QuickLinksRow } from '@/components/community/QuickLinksRow'
import { ConnectionRequestCard } from '@/components/community/ConnectionRequestCard'
import { ConnectionCard } from '@/components/community/ConnectionCard'
import { InviteToMatchSheet } from '@/components/community/InviteToMatchSheet'
import { InviteToGroupSheet } from '@/components/community/InviteToGroupSheet'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

interface GroupRow {
  id: string
  name: string
  description: string | null
  city: string | null
  visibility: string | null
  join_mode: string | null
  admin_id: string
}

interface MyGroup extends GroupRow {
  memberCount: number
  hasActiveLeague: boolean
  recentMembers: Array<{ id: string; name: string; avatar_url?: string | null }>
  userRole: string
  memberStatus: string
}

interface DiscoverGroup extends GroupRow {
  memberCount: number
  membershipStatus: 'none' | 'pending' | 'approved'
}

interface ConnectionProfile {
  user_id: string
  name: string
  avatar_url?: string | null
  city?: string | null
  internal_ranking?: number | null
}

interface ConnectionsData {
  accepted: Set<string>
  acceptedProfiles: ConnectionProfile[]
  pendingOutgoing: Set<string>
  incomingRequests: ConnectionProfile[]
}

// ── My Groups query ───────────────────────────────────────────────────────────

function useMyGroups(userId: string) {
  return useQuery({
    queryKey: ['my-groups', userId],
    enabled: !!userId,
    queryFn: async (): Promise<MyGroup[]> => {
      const { data: memberships, error } = await supabase
        .from('group_members')
        .select('group_id, role, status, groups(id, name, description, city, visibility, admin_id)')
        .eq('user_id', userId)
        .in('status', ['approved', 'ringer'])

      if (error) throw error
      if (!memberships || memberships.length === 0) return []

      const groups = memberships.map((m) => ({
        ...(Array.isArray(m.groups) ? m.groups[0] : m.groups) as GroupRow,
        userRole: m.role as string,
        memberStatus: m.status as string,
      }))
      const groupIds = groups.map((g) => g.id)

      const { data: memberRows } = await supabase
        .from('group_members')
        .select('group_id, user_id')
        .in('group_id', groupIds)
        .eq('status', 'approved')

      const allUserIds = [...new Set((memberRows ?? []).map((m) => m.user_id))]
      const { data: profileRows } = await supabase
        .from('profiles')
        .select('id, name, avatar_url')
        .in('id', allUserIds)

      const profileMap = Object.fromEntries((profileRows ?? []).map((p) => [p.id, p]))

      const membersByGroup: Record<string, Array<{ id: string; name: string; avatar_url?: string | null }>> = {}
      for (const m of memberRows ?? []) {
        if (!membersByGroup[m.group_id]) membersByGroup[m.group_id] = []
        const p = profileMap[m.user_id]
        if (p) membersByGroup[m.group_id].push(p)
      }

      const { data: activeLeagues } = await supabase
        .from('leagues')
        .select('linked_group_ids')
        .eq('status', 'active')

      const activeGroupIds = new Set<string>()
      for (const l of activeLeagues ?? []) {
        for (const gid of (l.linked_group_ids ?? []) as string[]) {
          activeGroupIds.add(gid)
        }
      }

      return groups.map((g) => ({
        ...g,
        memberCount:     (membersByGroup[g.id] ?? []).length,
        hasActiveLeague: activeGroupIds.has(g.id),
        recentMembers:   (membersByGroup[g.id] ?? []).slice(0, 5),
      }))
    },
  })
}

// ── Pending requests query ────────────────────────────────────────────────────

interface PendingRequest {
  id: string
  group_id: string
  groupName: string
  groupCity: string | null
}

function usePendingRequests(userId: string) {
  return useQuery({
    queryKey: ['pending-requests', userId],
    enabled: !!userId,
    queryFn: async (): Promise<PendingRequest[]> => {
      const { data, error } = await supabase
        .from('group_members')
        .select('id, group_id, groups(id, name, city)')
        .eq('user_id', userId)
        .eq('status', 'pending')
      if (error) throw error
      return (data ?? []).map((row: any) => {
        const g = Array.isArray(row.groups) ? row.groups[0] : row.groups
        return { id: row.id, group_id: row.group_id, groupName: g?.name ?? 'Unknown group', groupCity: g?.city ?? null }
      })
    },
  })
}

// ── Discover Groups query ─────────────────────────────────────────────────────

function useDiscoverGroups(userId: string, search: string, myGroupIds: string[], activeFilter: string | null, userCity: string | null, sortBy: string) {
  return useQuery({
    queryKey: ['discover-groups', userId, search, activeFilter, sortBy],
    enabled: !!userId,
    queryFn: async (): Promise<DiscoverGroup[]> => {
      let query = supabase
        .from('groups')
        .select('id, name, description, city, visibility, join_mode, admin_id')
        .or('visibility.in.(public,open),visibility.is.null')
        .limit(40)

      if (sortBy === 'newest') query = query.order('created_at', { ascending: false })
      else query = query.order('name')

      if (search.trim()) {
        query = query.or(`name.ilike.%${search.trim()}%,description.ilike.%${search.trim()}%,city.ilike.%${search.trim()}%`)
      }

      if (activeFilter === 'near_me' && userCity) {
        const cityName = userCity.split(',')[0].split(' ')[0].trim()
        if (cityName.length >= 3) query = query.ilike('city', `%${cityName}%`)
      }
      if (activeFilter === 'open_to_join') {
        query = query.or('join_mode.eq.open,auto_approve.eq.true,join_mode.is.null')
      }

      const { data: groups, error } = await query
      if (error) throw error
      if (!groups || groups.length === 0) return []

      const filtered = groups.filter((g) => !myGroupIds.includes(g.id))
      if (filtered.length === 0) return []
      const filteredIds = filtered.map((g) => g.id)

      const { data: memberRows } = await supabase
        .from('group_members').select('group_id')
        .in('group_id', filteredIds).eq('status', 'approved')
      const countMap: Record<string, number> = {}
      for (const m of memberRows ?? []) countMap[m.group_id] = (countMap[m.group_id] ?? 0) + 1

      const { data: membershipRows } = await supabase
        .from('group_members').select('group_id, status')
        .in('group_id', filteredIds).eq('user_id', userId)
      const membershipStatusMap: Record<string, 'pending' | 'approved'> = {}
      for (const r of membershipRows ?? []) membershipStatusMap[r.group_id] = r.status as 'pending' | 'approved'

      const visibleGroups = filtered.filter((g) => membershipStatusMap[g.id] !== 'approved')

      const result = visibleGroups.map((g) => ({
        ...g, memberCount: countMap[g.id] ?? 0, membershipStatus: membershipStatusMap[g.id] ?? 'none',
      }))

      if (sortBy === 'most_members') {
        result.sort((a, b) => b.memberCount - a.memberCount)
      }

      return result
    },
  })
}

// ── Bidirectional Connections query ───────────────────────────────────────────

function useMyConnections(userId: string) {
  return useQuery<ConnectionsData>({
    queryKey: ['my-connections', userId],
    enabled: !!userId,
    queryFn: async (): Promise<ConnectionsData> => {
      const [{ data: outgoing }, { data: incoming }] = await Promise.all([
        supabase.from('player_connections').select('connected_user_id, status').eq('user_id', userId),
        supabase.from('player_connections').select('user_id, status').eq('connected_user_id', userId),
      ])

      const accepted = new Set<string>()
      const pendingOutgoing = new Set<string>()
      const incomingPendingIds: string[] = []

      for (const row of outgoing ?? []) {
        if (row.status === 'accepted') accepted.add(row.connected_user_id)
        else if (row.status === 'pending') pendingOutgoing.add(row.connected_user_id)
      }
      for (const row of incoming ?? []) {
        if (row.status === 'accepted') accepted.add(row.user_id)
        else if (row.status === 'pending') incomingPendingIds.push(row.user_id)
      }

      // Fetch profiles for accepted connections and incoming requests
      const allProfileIds = [...accepted, ...incomingPendingIds]
      let profiles: any[] = []
      if (allProfileIds.length > 0) {
        const { data } = await supabase
          .from('profiles')
          .select('id, name, avatar_url, city, internal_ranking')
          .in('id', allProfileIds)
        profiles = data ?? []
      }

      const profileMap = new Map(profiles.map((p: any) => [p.id, p]))

      const acceptedProfiles: ConnectionProfile[] = [...accepted]
        .map((id) => profileMap.get(id))
        .filter(Boolean)
        .map((p: any) => ({ user_id: p.id, name: p.name, avatar_url: p.avatar_url, city: p.city, internal_ranking: p.internal_ranking }))

      const incomingRequests: ConnectionProfile[] = incomingPendingIds
        .map((id) => profileMap.get(id))
        .filter(Boolean)
        .map((p: any) => ({ user_id: p.id, name: p.name, avatar_url: p.avatar_url, city: p.city, internal_ranking: p.internal_ranking }))

      return { accepted, acceptedProfiles, pendingOutgoing, incomingRequests }
    },
  })
}

// ── Find Players query ────────────────────────────────────────────────────────

function useFindPlayers(userId: string, query: string, city: string | null) {
  return useQuery({
    queryKey: ['find-players', userId, query, city],
    enabled: !!userId,
    queryFn: async () => {
      let q = supabase
        .from('profiles')
        .select('id, name, avatar_url, city, internal_ranking')
        .neq('id', userId)
        .order('internal_ranking', { ascending: false })
        .limit(30)
      if (query.trim()) q = q.ilike('name', `%${query.trim()}%`)
      if (city && !query.trim()) q = q.ilike('city', `%${city}%`)
      const { data } = await q
      return data ?? []
    },
  })
}

// ── My Group Card ─────────────────────────────────────────────────────────────

function MyGroupCard({ group, index, badge }: { group: MyGroup; index: number; badge?: string }) {
  const navigate = useNavigate()
  return (
    <motion.button
      onClick={() => navigate(`/community/groups/${group.id}`)}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      whileTap={{ scale: 0.985 }}
      className="w-full text-left bg-white rounded-2xl border border-gray-100 overflow-hidden hover:border-teal-200 transition-colors relative"
    >
      <div className="flex">
        <div className="w-1 bg-[#009688] flex-shrink-0" />
        <div className="flex-1 px-4 py-3.5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-[15px] font-bold text-gray-900 truncate">{group.name}</h3>
                {group.hasActiveLeague && (
                  <span className="inline-flex items-center rounded-full bg-teal-50 border border-teal-100 px-2 py-0.5 text-[10px] font-semibold text-teal-600">
                    Active League
                  </span>
                )}
                {badge && (
                  <span className={cn(
                    'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold',
                    badge === 'Ringer' ? 'bg-orange-100 text-orange-600' : 'bg-amber-100 text-amber-700'
                  )}>
                    {badge}
                  </span>
                )}
              </div>
              {group.city && (
                <div className="flex items-center gap-1 mt-0.5">
                  <MapPin className="h-3 w-3 text-gray-400" />
                  <p className="text-[12px] text-gray-400">{group.city}</p>
                </div>
              )}
            </div>
            <ChevronRight className="h-4 w-4 text-gray-300 flex-shrink-0 mt-1" />
          </div>

          <div className="flex items-center gap-2 mt-3">
            <div className="flex -space-x-1.5">
              {group.recentMembers.map((m) => (
                <PlayerAvatar key={m.id} name={m.name} avatarUrl={m.avatar_url} size="sm" />
              ))}
            </div>
            <span className="text-[12px] text-gray-500">
              <span className="font-semibold">{group.memberCount}</span>{' '}
              member{group.memberCount !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>
    </motion.button>
  )
}

// ── Discover Card ─────────────────────────────────────────────────────────────

function DiscoverCard({ group, index, onJoin }: { group: DiscoverGroup; index: number; onJoin: (id: string) => void }) {
  const navigate = useNavigate()
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="bg-white rounded-2xl border border-gray-100 px-4 py-3.5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-[14px] font-bold text-gray-900 truncate">{group.name}</h3>
          {group.city && (
            <div className="flex items-center gap-1 mt-0.5">
              <MapPin className="h-3 w-3 text-gray-400" />
              <p className="text-[12px] text-gray-400">{group.city}</p>
            </div>
          )}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1 text-[12px] text-gray-500">
              <Users className="h-3 w-3 text-gray-400" />
              <span className="font-semibold">{group.memberCount}</span> member{group.memberCount !== 1 ? 's' : ''}
            </span>
            {group.join_mode === 'closed' ? (
              <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 rounded-full px-1.5 py-0.5">Closed</span>
            ) : group.join_mode === 'open' || group.visibility === 'public' ? (
              <span className="text-[10px] font-semibold text-teal-700 bg-teal-50 rounded-full px-1.5 py-0.5">Open</span>
            ) : (
              <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 rounded-full px-1.5 py-0.5">Request</span>
            )}
          </div>
          {group.description && (
            <p className="text-[12px] text-gray-400 mt-1 line-clamp-2">{group.description}</p>
          )}
        </div>

        {group.membershipStatus === 'pending' ? (
          <span className="inline-flex items-center rounded-xl bg-gray-100 px-3 py-1.5 text-[12px] font-semibold text-gray-500 flex-shrink-0 self-start mt-0.5">
            Requested
          </span>
        ) : group.membershipStatus === 'approved' ? (
          <button
            onClick={() => navigate(`/community/groups/${group.id}`)}
            className="inline-flex items-center rounded-xl bg-teal-50 border border-teal-200 px-3 py-1.5 text-[12px] font-bold text-teal-700 flex-shrink-0 self-start mt-0.5 active:scale-95 transition-transform"
          >
            Member
          </button>
        ) : (
          <button
            onClick={() => onJoin(group.id)}
            className="inline-flex items-center rounded-xl bg-[#009688] px-3 py-1.5 text-[12px] font-bold text-white flex-shrink-0 self-start mt-0.5 active:scale-95 transition-transform"
          >
            Request to join
          </button>
        )}
      </div>
    </motion.div>
  )
}

// ── Upcoming Events ─────────────────────────────────────────────────────────

function UpcomingEventsSection({ userId, userGroupIds }: { userId: string; userGroupIds: string[] }) {
  const navigate = useNavigate()
  const today = new Date().toISOString().split('T')[0]

  const { data: events = [] } = useQuery({
    queryKey: ['upcoming-events-community', userId, userGroupIds],
    enabled: !!userId,
    queryFn: async () => {
      const filters = ['is_official.eq.true', `created_by.eq.${userId}`]
      if (userGroupIds.length > 0) filters.push(`group_id.in.(${userGroupIds.join(',')})`)

      const { data } = await supabase
        .from('events')
        .select('id, title, start_time, location, entry_fee_pence, is_official, group_id')
        .gte('start_time', today)
        .or(filters.join(','))
        .order('start_time', { ascending: true })
        .limit(6)
      return data ?? []
    },
  })

  if (events.length === 0) return null

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[16px] font-bold text-gray-900">Upcoming Events</h2>
      </div>
      <div className="space-y-2">
        {events.map((e) => (
          <button
            key={e.id}
            onClick={() => navigate(`/community/events/${e.id}`)}
            className={cn(
              'w-full text-left rounded-2xl border px-4 py-3 active:scale-[0.98] transition-transform',
              e.is_official ? 'border-purple-100 bg-purple-50/30' : 'border-gray-100 bg-white',
            )}
          >
            <div className="flex items-center gap-2 mb-1">
              {e.is_official && (
                <span className="text-[10px] font-bold text-purple-700 bg-purple-100 rounded-full px-2 py-0.5">OFFICIAL</span>
              )}
              {(e.entry_fee_pence ?? 0) > 0 ? (
                <span className="text-[10px] font-semibold text-gray-500">{'\u00A3'}{((e.entry_fee_pence ?? 0) / 100).toFixed(2)}</span>
              ) : (
                <span className="text-[10px] font-semibold text-green-600">Free</span>
              )}
            </div>
            <p className="text-[14px] font-bold text-gray-900">{e.title}</p>
            <p className="text-[12px] text-gray-500 mt-0.5">
              {(() => { try { return format(parseISO(e.start_time), 'EEE d MMM \u00B7 HH:mm') } catch { return e.start_time } })()}
              {e.location && ` \u00B7 ${e.location}`}
            </p>
          </button>
        ))}
      </div>
    </section>
  )
}

// ── Find a Coach ─────────────────────────────────────────────────────────────

function CoachesSection({ userCity }: { userCity?: string | null }) {
  const navigate = useNavigate()

  const { data: coaches = [] } = useQuery({
    queryKey: ['coaches-nearby', userCity],
    queryFn: async () => {
      let q = supabase
        .from('profiles')
        .select('id, name, avatar_url, city, internal_ranking')
        .eq('account_type', 'coach')
        .limit(6)
      if (userCity) q = q.ilike('city', `%${userCity}%`)
      const { data } = await q
      return data ?? []
    },
  })

  if (coaches.length === 0) return null

  return (
    <section>
      <h2 className="text-[16px] font-bold text-gray-900 mb-3">Find a Coach</h2>
      <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
        {coaches.map((c) => (
          <button
            key={c.id}
            onClick={() => navigate(`/players/${c.id}`)}
            className="flex-shrink-0 w-32 flex flex-col items-center rounded-2xl border border-gray-100 bg-white p-3 text-center active:scale-[0.97] transition-transform"
          >
            <PlayerAvatar name={c.name} avatarUrl={c.avatar_url} size="lg" />
            <p className="text-[12px] font-bold text-gray-900 mt-2 truncate w-full">{c.name}</p>
            <span className="text-[10px] font-semibold text-teal-600 bg-teal-50 rounded-full px-2 py-0.5 mt-1">Coach</span>
            {c.city && <p className="text-[10px] text-gray-400 mt-0.5">{c.city}</p>}
          </button>
        ))}
      </div>
    </section>
  )
}

// ── Nearby Venues ────────────────────────────────────────────────────────────

function NearbyVenuesSection({ userCity }: { userCity?: string | null }) {
  const navigate = useNavigate()

  const { data: venues = [] } = useQuery({
    queryKey: ['nearby-venues-community', userCity],
    queryFn: async () => {
      let q = supabase
        .from('padel_venues')
        .select('venue_id, venue_name, city, indoor_courts, outdoor_courts, ppa_bookable, rating')
        .limit(8)
      if (userCity) q = q.ilike('city', `%${userCity}%`)
      const { data } = await q
      return data ?? []
    },
  })

  if (venues.length === 0) return null

  return (
    <section>
      <h2 className="text-[16px] font-bold text-gray-900 mb-3">Padel Courts Near You</h2>
      <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
        {venues.map((v) => {
          const courts = (v.indoor_courts ?? 0) + (v.outdoor_courts ?? 0)
          return (
            <button
              key={v.venue_id}
              onClick={() => navigate(`/venues/${v.venue_id}`)}
              className="flex-shrink-0 w-48 rounded-2xl border border-gray-100 bg-white overflow-hidden text-left active:scale-[0.97] transition-transform"
            >
              <div className="h-20 bg-gradient-to-br from-teal-600 to-teal-400 flex items-center justify-center">
                <span className="text-3xl">🎾</span>
              </div>
              <div className="px-3 py-2.5">
                <p className="text-[13px] font-bold text-gray-900 truncate">{v.venue_name}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">{v.city}{courts > 0 ? ` \u00B7 ${courts} courts` : ''}</p>
                <div className="flex items-center gap-1.5 mt-1.5">
                  {v.ppa_bookable && (
                    <span className="text-[9px] font-bold text-teal-700 bg-teal-50 rounded-full px-1.5 py-0.5">PPA</span>
                  )}
                  {(v.rating as number) > 0 && (
                    <span className="text-[10px] text-gray-500">{'\u2B50'} {Number(v.rating).toFixed(1)}</span>
                  )}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function CommunityPage() {
  const { profile } = useAuth()
  const navigate     = useNavigate()
  const location     = useLocation()
  const queryClient  = useQueryClient()
  const { t }        = useTranslation()
  const [search, setSearch]                   = useState('')
  const [activeFilter, setActiveFilter]       = useState<string | null>(null)
  const [sortBy, setSortBy]                   = useState('newest')
  const [showCreateSheet, setShowCreateSheet] = useState(false)
  const [playerSearch, setPlayerSearch]       = useState('')
  const [playerCityFilter, setPlayerCityFilter] = useState(false)
  const [inviteMatchTarget, setInviteMatchTarget] = useState<{ id: string; name: string } | null>(null)
  const [inviteGroupTarget, setInviteGroupTarget] = useState<{ id: string; name: string } | null>(null)

  useEffect(() => {
    if (profile?.city) setPlayerCityFilter(true)
  }, [profile?.city])

  const userId = profile?.id ?? ''

  // Section refs for QuickLinks + hash scroll
  const groupsRef = useRef<HTMLElement>(null)
  const playersRef = useRef<HTMLElement>(null)
  const coachesRef = useRef<HTMLElement>(null)
  const venuesRef = useRef<HTMLElement>(null)
  const connectionsRef = useRef<HTMLElement>(null)

  // Queries
  const { data: connectionsData } = useMyConnections(userId)
  const connections = connectionsData ?? { accepted: new Set<string>(), acceptedProfiles: [], pendingOutgoing: new Set<string>(), incomingRequests: [] }
  const { data: allMyGroups = [], isLoading: loadingMine } = useMyGroups(userId)
  const { data: pendingRequests = [] } = usePendingRequests(userId)
  const myGroups = allMyGroups.filter(g => g.memberStatus === 'approved')
  const ringerGroups = allMyGroups.filter(g => g.memberStatus === 'ringer')
  const myGroupIds = allMyGroups.map((g) => g.id)

  const { data: discoverGroups = [], isLoading: loadingDiscover } = useDiscoverGroups(
    userId, search, myGroupIds, activeFilter, profile?.city ?? null, sortBy,
  )

  const { data: foundPlayers = [] } = useFindPlayers(
    userId,
    playerSearch,
    playerCityFilter ? (profile?.city ?? null) : null,
  )

  // Quick links config
  const quickLinks = useMemo(() => [
    { key: 'groups',  emoji: '👥', label: 'Groups',  ref: groupsRef },
    { key: 'players', emoji: '🤝', label: 'Players', ref: playersRef },
    { key: 'coaches', emoji: '🎾', label: 'Coaches', ref: coachesRef },
    { key: 'venues',  emoji: '📍', label: 'Venues',  ref: venuesRef },
  ], [])

  // Hash scroll for notification deep links (/community#connections)
  useEffect(() => {
    if (location.hash !== '#connections') return
    if (!connectionsData) return
    const timer = setTimeout(() => {
      connectionsRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, 150)
    return () => clearTimeout(timer)
  }, [location.hash, connectionsData])

  // ── Mutations ──────────────────────────────────────────────────────────────

  const joinMutation = useMutation({
    mutationFn: async (groupId: string) => {
      const group = discoverGroups.find((g) => g.id === groupId)
      if (group?.join_mode === 'closed') throw new Error('This group is closed to new members')
      const autoApprove = group?.join_mode === 'open' || (group as any)?.auto_approve === true
      const status = autoApprove ? 'approved' : 'pending'
      const { error } = await supabase.from('group_members').insert({
        group_id: groupId, user_id: userId, role: 'member', status,
      })
      if (error) throw error
      if (autoApprove) queryClient.invalidateQueries({ queryKey: ['my-groups', userId] })
      queryClient.invalidateQueries({ queryKey: ['discover-groups', userId, search] })
    },
  })

  const cancelRequestMutation = useMutation({
    mutationFn: async (groupId: string) => {
      const { error } = await supabase.from('group_members').delete()
        .eq('group_id', groupId).eq('user_id', userId).eq('status', 'pending')
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-requests', userId] })
      queryClient.invalidateQueries({ queryKey: ['discover-groups', userId, search] })
    },
  })

  const connectMutation = useMutation({
    mutationFn: async (targetId: string) => {
      const { error } = await supabase.from('player_connections').insert({
        user_id: userId, connected_user_id: targetId, status: 'pending',
      })
      if (error) throw error

      await supabase.from('notifications').insert({
        user_id: targetId,
        type: 'connection_request',
        title: 'Connection request',
        message: `${profile?.name ?? 'A player'} wants to connect with you.`,
        related_id: userId,
        read: false,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-connections', userId] })
    },
  })

  const acceptInlineMutation = useMutation({
    mutationFn: async (requesterId: string) => {
      const { error } = await supabase.rpc('accept_connection_request', { p_requester_id: requesterId })
      if (error) throw error
      await supabase.from('notifications').insert({
        user_id: requesterId,
        type: 'connection_accepted',
        title: 'Connection accepted',
        message: `${profile?.name ?? 'A player'} accepted your connection request.`,
        related_id: userId,
        read: false,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-connections', userId] })
    },
  })

  // Merged groups list: approved + ringer (with badge)
  const mergedGroups = [
    ...myGroups.map(g => ({ ...g, badge: undefined as string | undefined })),
    ...ringerGroups.map(g => ({ ...g, badge: 'Ringer' as string | undefined })),
  ]

  // Connect button state helper
  function getConnectState(playerId: string): 'none' | 'pending_out' | 'pending_in' | 'accepted' {
    if (connections.accepted.has(playerId)) return 'accepted'
    if (connections.pendingOutgoing.has(playerId)) return 'pending_out'
    if (connections.incomingRequests.some(r => r.user_id === playerId)) return 'pending_in'
    return 'none'
  }

  const inlineDiscoverGroups = discoverGroups.slice(0, 6)
  const inlinePlayers = foundPlayers.slice(0, 8)

  return (
    <div className="min-h-full bg-white pb-32">
      {/* Header */}
      <div className="px-5 pt-14 pb-4 sticky top-0 bg-white/95 backdrop-blur-sm z-10 border-b border-gray-50">
        <h1 className="text-[22px] font-bold text-gray-900">{t('community.title')}</h1>
      </div>

      <div className="px-5 space-y-6">
        {/* Hero card */}
        <div className="rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(135deg, #009688 0%, #00796B 100%)' }}>
          <div className="px-5 py-5 text-white">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-[20px] font-extrabold leading-tight">Your Padel Community</h2>
                <p className="text-[13px] text-white/80 mt-1">Connect, organise and play</p>
              </div>
              <div className="bg-white/15 rounded-xl px-3 py-2 text-center">
                <p className="text-[22px] font-black leading-none">{allMyGroups.length}</p>
                <p className="text-[10px] text-white/80 mt-0.5">groups</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowCreateSheet(true)} className="flex-1 rounded-xl bg-white py-2.5 text-[13px] font-bold text-[#009688]">
                + Create Group
              </button>
              <button onClick={() => playersRef.current?.scrollIntoView({ behavior: 'smooth' })} className="flex-1 rounded-xl bg-white/15 border border-white/30 py-2.5 text-[13px] font-bold text-white">
                Find Players
              </button>
            </div>
          </div>
        </div>

        {/* Quick links */}
        <QuickLinksRow sections={quickLinks} />

        {/* ── My Groups (merged: approved + ringer + pending) ── */}
        <section ref={groupsRef} id="groups">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[16px] font-bold text-gray-900">{t('community.my_groups')}</h2>
            {mergedGroups.length > 0 && (
              <span className="text-[12px] text-gray-400">
                {mergedGroups.length} group{mergedGroups.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {loadingMine ? (
            <div className="space-y-3">
              {[0, 1].map((i) => (
                <div key={i} className="h-20 rounded-2xl bg-gray-100 animate-pulse" />
              ))}
            </div>
          ) : mergedGroups.length === 0 && pendingRequests.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 p-6 text-center">
              <div className="h-10 w-10 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
                <Users className="h-5 w-5 text-gray-400" />
              </div>
              <p className="text-[14px] font-semibold text-gray-600 mb-1">{t('community.no_groups')}</p>
              <p className="text-[12px] text-gray-400 mb-4">{t('community.no_groups_sub')}</p>
              <button
                onClick={() => setShowCreateSheet(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#009688] px-4 py-2.5 text-[13px] font-bold text-white"
              >
                <Plus className="h-3.5 w-3.5" />
                {t('community.create_group')}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {mergedGroups.map((group, i) => (
                <MyGroupCard key={group.id} group={group} index={i} badge={group.badge} />
              ))}
              {/* Pending group requests inline */}
              {pendingRequests.map((req) => (
                <div key={req.id} className="flex items-center justify-between gap-3 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold text-gray-800 truncate">{req.groupName}</p>
                    {req.groupCity && <p className="text-[11px] text-gray-500">{req.groupCity}</p>}
                    <span className="inline-flex items-center mt-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                      Pending approval
                    </span>
                  </div>
                  <button
                    onClick={() => cancelRequestMutation.mutate(req.group_id)}
                    disabled={cancelRequestMutation.isPending}
                    className="flex-shrink-0 rounded-xl border border-red-200 px-3 py-1.5 text-[11px] font-bold text-red-500 active:scale-95 transition-transform"
                  >
                    Cancel
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Find Groups (was "Discover") ── */}
        <section>
          <h2 className="text-[16px] font-bold text-gray-900 mb-3">Find Groups</h2>

          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('community.search_placeholder')}
              style={{ fontSize: '16px', width: '100%', boxSizing: 'border-box' }}
              className="w-full rounded-xl border border-gray-200 pl-9 pr-4 py-2.5 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
            />
          </div>

          <div className="flex gap-2 mb-2 overflow-x-auto no-scrollbar pb-0.5">
            {[
              { key: 'near_me',      label: 'Near me'       },
              { key: 'open_to_join', label: 'Open to join'  },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setActiveFilter(activeFilter === key ? null : key)}
                className={`flex-shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold border transition-colors ${
                  activeFilter === key
                    ? 'bg-[#009688] text-white border-[#009688]'
                    : 'bg-white text-gray-600 border-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
            <span className="text-gray-300 self-center">|</span>
            {[
              { key: 'newest',       label: 'Newest'        },
              { key: 'most_members', label: 'Most members'  },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setSortBy(key)}
                className={`flex-shrink-0 rounded-full px-3 py-1.5 text-[11px] font-medium border transition-colors ${
                  sortBy === key
                    ? 'bg-gray-800 text-white border-gray-800'
                    : 'bg-gray-50 text-gray-500 border-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {loadingDiscover ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-20 rounded-2xl bg-gray-100 animate-pulse" />
              ))}
            </div>
          ) : discoverGroups.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 p-5 text-center">
              <p className="text-[13px] font-semibold text-gray-500">
                {search.trim() ? 'No groups found' : 'No public groups yet'}
              </p>
              <p className="text-[12px] text-gray-400 mt-1">Be the first — create one above</p>
            </div>
          ) : (
            <div className="space-y-3">
              {inlineDiscoverGroups.map((group, i) => (
                <DiscoverCard key={group.id} group={group} index={i} onJoin={(id) => joinMutation.mutate(id)} />
              ))}
              {discoverGroups.length > 6 && (
                <button
                  onClick={() => navigate('/community/groups')}
                  className="w-full text-center py-2.5 text-[13px] font-semibold text-[#009688]"
                >
                  Show all ({discoverGroups.length} groups) →
                </button>
              )}
            </div>
          )}
        </section>

        {/* ── Connections ── */}
        <section ref={connectionsRef} id="connections">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[16px] font-bold text-gray-900">Connections</h2>
            {connections.accepted.size > 0 && (
              <span className="text-[12px] text-gray-400">
                {connections.accepted.size} connection{connections.accepted.size !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* Incoming requests */}
          {connections.incomingRequests.length > 0 && (
            <div className="mb-4">
              <p className="text-[12px] font-bold text-gray-500 mb-2">
                Connection requests ({connections.incomingRequests.length})
              </p>
              <div className="space-y-2">
                {connections.incomingRequests.map((req) => (
                  <ConnectionRequestCard key={req.user_id} request={req} />
                ))}
              </div>
            </div>
          )}

          {/* My connections */}
          {connections.acceptedProfiles.length > 0 ? (
            <div className="space-y-2">
              {connections.acceptedProfiles.slice(0, 4).map((conn) => (
                <ConnectionCard key={conn.user_id} player={conn}>
                  <button
                    onClick={() => setInviteMatchTarget({ id: conn.user_id, name: conn.name })}
                    className="rounded-lg bg-teal-50 border border-teal-200 px-2 py-1 text-[10px] font-bold text-teal-700"
                  >
                    <Calendar className="h-3 w-3 inline mr-0.5" />
                    Match
                  </button>
                  <button
                    onClick={() => setInviteGroupTarget({ id: conn.user_id, name: conn.name })}
                    className="rounded-lg bg-blue-50 border border-blue-200 px-2 py-1 text-[10px] font-bold text-blue-700"
                  >
                    <Users className="h-3 w-3 inline mr-0.5" />
                    Group
                  </button>
                </ConnectionCard>
              ))}
              {connections.acceptedProfiles.length > 4 && (
                <button
                  onClick={() => navigate('/community/connections')}
                  className="w-full text-center py-2.5 text-[13px] font-semibold text-[#009688]"
                >
                  Show all ({connections.acceptedProfiles.length} connections) →
                </button>
              )}
            </div>
          ) : connections.incomingRequests.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 p-5 text-center">
              <p className="text-[13px] font-semibold text-gray-500">No connections yet</p>
              <p className="text-[12px] text-gray-400 mt-1">Connect with players below to invite them to matches and groups.</p>
            </div>
          ) : null}
        </section>

        {/* ── Find Players ── */}
        <section ref={playersRef} id="players">
          <h2 className="text-[16px] font-bold text-gray-900 mb-3">Find Players</h2>
          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={playerSearch}
              onChange={(e) => setPlayerSearch(e.target.value)}
              placeholder="Search players by name\u2026"
              style={{ fontSize: '16px', width: '100%', boxSizing: 'border-box' }}
              className="w-full rounded-xl border border-gray-200 pl-9 pr-4 py-2.5 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
            />
          </div>
          {profile?.city && (
            <button
              onClick={() => setPlayerCityFilter((v) => !v)}
              className={`mb-3 rounded-full px-3 py-1 text-[12px] font-semibold border transition-colors ${
                playerCityFilter
                  ? 'bg-[#009688] text-white border-[#009688]'
                  : 'bg-white text-gray-600 border-gray-200'
              }`}
            >
              Near me ({profile.city})
            </button>
          )}
          {foundPlayers.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 p-5 text-center">
              <p className="text-[13px] font-semibold text-gray-500">
                {playerSearch.trim() ? 'No players found' : 'No players yet'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {inlinePlayers.map((p) => {
                const state = getConnectState(p.id)
                return (
                  <div key={p.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50 border border-transparent">
                    <button
                      onClick={() => navigate(`/players/${p.id}`)}
                      className="flex items-center gap-3 flex-1 min-w-0 text-left"
                    >
                      <PlayerAvatar name={p.name} avatarUrl={p.avatar_url} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-gray-800 truncate">{p.name}</p>
                        {p.city && <p className="text-[11px] text-gray-400">{p.city}</p>}
                      </div>
                    </button>
                    {p.internal_ranking != null && (
                      <span className="text-[11px] font-bold text-teal-700 bg-teal-50 border border-teal-100 rounded-full px-2 py-0.5 flex-shrink-0">
                        {p.internal_ranking} ELO
                      </span>
                    )}
                    {p.id !== userId && (
                      <>
                        {state === 'none' && (
                          <button
                            onClick={() => connectMutation.mutate(p.id)}
                            disabled={connectMutation.isPending}
                            className="flex-shrink-0 flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold bg-[#009688] text-white hover:bg-teal-700 transition-colors"
                          >
                            <UserPlus className="h-3 w-3" /> Connect
                          </button>
                        )}
                        {state === 'pending_out' && (
                          <span className="flex-shrink-0 flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold bg-gray-100 text-gray-400">
                            <Clock className="h-3 w-3" /> Pending
                          </span>
                        )}
                        {state === 'pending_in' && (
                          <button
                            onClick={() => acceptInlineMutation.mutate(p.id)}
                            disabled={acceptInlineMutation.isPending}
                            className="flex-shrink-0 flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold bg-[#009688] text-white transition-colors"
                          >
                            <Check className="h-3 w-3" /> Accept
                          </button>
                        )}
                        {state === 'accepted' && (
                          <span className="flex-shrink-0 flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold bg-gray-100 text-gray-400">
                            <Check className="h-3 w-3" /> Connected
                          </span>
                        )}
                      </>
                    )}
                  </div>
                )
              })}
              {foundPlayers.length > 8 && (
                <button
                  onClick={() => navigate('/community/players')}
                  className="w-full text-center py-2.5 text-[13px] font-semibold text-[#009688]"
                >
                  Show all ({foundPlayers.length} players) →
                </button>
              )}
            </div>
          )}
        </section>

        {/* ── Upcoming Events ── */}
        <UpcomingEventsSection userId={userId} userGroupIds={allMyGroups.map(g => g.id)} />

        {/* ── Find a Coach ── */}
        <section ref={coachesRef} id="coaches">
          <CoachesSection userCity={profile?.city} />
        </section>

        {/* ── Nearby Venues ── */}
        <section ref={venuesRef} id="venues">
          <NearbyVenuesSection userCity={profile?.city} />
        </section>
      </div>

      {/* Floating + button */}
      <motion.button
        onClick={() => setShowCreateSheet(true)}
        whileTap={{ scale: 0.9 }}
        className="fixed bottom-[calc(80px+env(safe-area-inset-bottom)+16px)] right-5 z-40 h-14 w-14 rounded-full bg-[#009688] shadow-lg flex items-center justify-center"
      >
        <Plus className="h-6 w-6 text-white" />
      </motion.button>

      <CreateGroupSheet
        open={showCreateSheet}
        onClose={() => {
          setShowCreateSheet(false)
          queryClient.invalidateQueries({ queryKey: ['my-groups', userId] })
        }}
      />

      <InviteToMatchSheet
        open={!!inviteMatchTarget}
        onClose={() => setInviteMatchTarget(null)}
        playerId={inviteMatchTarget?.id ?? ''}
        playerName={inviteMatchTarget?.name ?? ''}
      />

      <InviteToGroupSheet
        open={!!inviteGroupTarget}
        onClose={() => setInviteGroupTarget(null)}
        playerId={inviteGroupTarget?.id ?? ''}
        playerName={inviteGroupTarget?.name ?? ''}
      />
    </div>
  )
}
