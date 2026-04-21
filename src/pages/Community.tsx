import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Plus, Search, Users, MapPin, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PlayerAvatar } from '@/components/shared/PlayerAvatar'
import { CreateGroupSheet } from '@/components/community/CreateGroupSheet'

// ── Types ─────────────────────────────────────────────────────────────────────

interface GroupRow {
  id: string
  name: string
  description: string | null
  city: string | null
  visibility: string | null
  admin_id: string
}

interface MyGroup extends GroupRow {
  memberCount: number
  hasActiveLeague: boolean
  recentMembers: Array<{ id: string; name: string; avatar_url?: string | null }>
  userRole: string
}

interface DiscoverGroup extends GroupRow {
  memberCount: number
  pendingJoin: boolean
}

// ── My Groups query ───────────────────────────────────────────────────────────

function useMyGroups(userId: string) {
  return useQuery({
    queryKey: ['my-groups', userId],
    enabled: !!userId,
    queryFn: async (): Promise<MyGroup[]> => {
      const { data: memberships, error } = await supabase
        .from('group_members')
        .select('group_id, role, groups(id, name, description, city, visibility, admin_id)')
        .eq('user_id', userId)
        .eq('status', 'approved')

      if (error) throw error
      if (!memberships || memberships.length === 0) return []

      const groups = memberships.map((m) => ({
        ...(Array.isArray(m.groups) ? m.groups[0] : m.groups) as GroupRow,
        userRole: m.role as string,
      }))
      const groupIds = groups.map((g) => g.id)

      // Step 1: Fetch member user_ids per group (avoid unreliable implicit FK join)
      const { data: memberRows } = await supabase
        .from('group_members')
        .select('group_id, user_id')
        .in('group_id', groupIds)
        .eq('status', 'approved')

      // Step 2: Fetch profiles for all those user_ids
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

      // Check active leagues
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

// ── Discover Groups query ─────────────────────────────────────────────────────

function useDiscoverGroups(userId: string, search: string, myGroupIds: string[], activeFilter: string | null, userCity: string | null) {
  return useQuery({
    queryKey: ['discover-groups', userId, search, activeFilter],
    enabled: !!userId,
    queryFn: async (): Promise<DiscoverGroup[]> => {
      let query = supabase
        .from('groups')
        .select('id, name, description, city, visibility, join_mode, admin_id')
        .eq('visibility', 'open')
        .order('name')
        .limit(40)

      if (search.trim()) {
        query = query.or(`name.ilike.%${search.trim()}%,city.ilike.%${search.trim()}%`)
      }

      if (activeFilter === 'near_me' && userCity) {
        query = query.ilike('city', `%${userCity}%`)
      }

      if (activeFilter === 'open_to_join') {
        query = query.neq('join_mode', 'closed')
      }

      const { data: groups, error } = await query
      if (error) throw error
      if (!groups || groups.length === 0) return []

      const filtered = groups.filter((g) => !myGroupIds.includes(g.id))
      if (filtered.length === 0) return []

      const filteredIds = filtered.map((g) => g.id)

      // Count members
      const { data: memberRows } = await supabase
        .from('group_members')
        .select('group_id')
        .in('group_id', filteredIds)
        .eq('status', 'approved')

      const countMap: Record<string, number> = {}
      for (const m of memberRows ?? []) {
        countMap[m.group_id] = (countMap[m.group_id] ?? 0) + 1
      }

      // Check user's pending/existing membership
      const { data: pendingRows } = await supabase
        .from('group_members')
        .select('group_id')
        .in('group_id', filteredIds)
        .eq('user_id', userId)

      const pendingIds = new Set((pendingRows ?? []).map((r) => r.group_id))

      return filtered.map((g) => ({
        ...g,
        memberCount: countMap[g.id] ?? 0,
        pendingJoin: pendingIds.has(g.id),
      }))
    },
  })
}

// ── My Group Card ─────────────────────────────────────────────────────────────

function MyGroupCard({ group, index }: { group: MyGroup; index: number }) {
  const navigate = useNavigate()
  return (
    <motion.button
      onClick={() => navigate(`/community/groups/${group.id}`)}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      whileTap={{ scale: 0.985 }}
      className="w-full text-left bg-white rounded-2xl border border-gray-100 overflow-hidden hover:border-teal-200 transition-colors"
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

function DiscoverCard({
  group,
  index,
  onJoin,
}: {
  group: DiscoverGroup
  index: number
  onJoin: (id: string) => void
}) {
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
          <div className="flex items-center gap-1 mt-1.5">
            <Users className="h-3 w-3 text-gray-400" />
            <span className="text-[12px] text-gray-500">
              <span className="font-semibold">{group.memberCount}</span>{' '}
              member{group.memberCount !== 1 ? 's' : ''}
            </span>
          </div>
          {group.description && (
            <p className="text-[12px] text-gray-400 mt-1 line-clamp-2">{group.description}</p>
          )}
        </div>

        {group.pendingJoin ? (
          <span className="inline-flex items-center rounded-xl bg-gray-100 px-3 py-1.5 text-[12px] font-semibold text-gray-500 flex-shrink-0 self-start mt-0.5">
            Requested
          </span>
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

// ── Main Page ─────────────────────────────────────────────────────────────────

export function CommunityPage() {
  const { profile } = useAuth()
  const queryClient  = useQueryClient()
  const [search, setSearch]                   = useState('')
  const [activeFilter, setActiveFilter]       = useState<string | null>(null)
  const [showCreateSheet, setShowCreateSheet] = useState(false)

  const userId = profile?.id ?? ''
  const { data: myGroups = [], isLoading: loadingMine } = useMyGroups(userId)
  const myGroupIds = myGroups.map((g) => g.id)

  const { data: discoverGroups = [], isLoading: loadingDiscover } = useDiscoverGroups(
    userId,
    search,
    myGroupIds,
    activeFilter,
    profile?.city ?? null,
  )

  const joinMutation = useMutation({
    mutationFn: async (groupId: string) => {
      const group    = discoverGroups.find((g) => g.id === groupId)
      const isPublic = group?.visibility === 'open'

      const { error } = await supabase.from('group_members').insert({
        group_id: groupId,
        user_id:  userId,
        role:     'member',
        status:   isPublic ? 'approved' : 'pending',
      })
      if (error) throw error

      if (isPublic) queryClient.invalidateQueries({ queryKey: ['my-groups', userId] })
      queryClient.invalidateQueries({ queryKey: ['discover-groups', userId, search] })
    },
  })

  return (
    <div className="min-h-full bg-white pb-32">
      {/* Header */}
      <div className="px-5 pt-14 pb-4">
        <h1 className="text-[22px] font-bold text-gray-900">Community</h1>
      </div>

      <div className="px-5 space-y-6">
        {/* My Groups */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[16px] font-bold text-gray-900">My Groups</h2>
            {myGroups.length > 0 && (
              <span className="text-[12px] text-gray-400">
                {myGroups.length} group{myGroups.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {loadingMine ? (
            <div className="space-y-3">
              {[0, 1].map((i) => (
                <div key={i} className="h-20 rounded-2xl bg-gray-100 animate-pulse" />
              ))}
            </div>
          ) : myGroups.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 p-6 text-center">
              <div className="h-10 w-10 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
                <Users className="h-5 w-5 text-gray-400" />
              </div>
              <p className="text-[14px] font-semibold text-gray-600 mb-1">You're not in any groups yet</p>
              <p className="text-[12px] text-gray-400 mb-4">Discover groups below or create your own</p>
              <button
                onClick={() => setShowCreateSheet(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#009688] px-4 py-2.5 text-[13px] font-bold text-white"
              >
                <Plus className="h-3.5 w-3.5" />
                Create a group
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {myGroups.map((group, i) => (
                <MyGroupCard key={group.id} group={group} index={i} />
              ))}
            </div>
          )}
        </section>

        {/* Discover */}
        <section>
          <h2 className="text-[16px] font-bold text-gray-900 mb-3">Discover Groups</h2>

          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or city…"
              style={{ fontSize: '16px', width: '100%', boxSizing: 'border-box' }}
              className="w-full rounded-xl border border-gray-200 pl-9 pr-4 py-2.5 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
            />
          </div>

          {/* Filter chips */}
          <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
            {[
              { key: 'near_me',      label: 'Near me'       },
              { key: 'open_to_join', label: 'Open to join'  },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setActiveFilter(activeFilter === key ? null : key)}
                className={`flex-shrink-0 rounded-full px-3 py-1 text-[12px] font-semibold border transition-colors ${
                  activeFilter === key
                    ? 'bg-[#009688] text-white border-[#009688]'
                    : 'bg-white text-gray-600 border-gray-200'
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
              {discoverGroups.map((group, i) => (
                <DiscoverCard
                  key={group.id}
                  group={group}
                  index={i}
                  onJoin={(id) => joinMutation.mutate(id)}
                />
              ))}
            </div>
          )}
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
    </div>
  )
}
