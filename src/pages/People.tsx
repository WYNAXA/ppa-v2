import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Plus, Users, MapPin, ChevronRight, Trophy } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PlayerAvatar } from '@/components/shared/PlayerAvatar'
import { CreateGroupSheet } from '@/components/people/CreateGroupSheet'
import { DirectoryGrid } from '@/components/people/DirectoryGrid'
import { ClubThisWeek } from '@/components/people/ClubThisWeek'
import { ConnectionRequestCard } from '@/components/people/ConnectionRequestCard'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

interface GroupRow {
  id: string
  name: string
  description: string | null
  city: string | null
  visibility: string | null
  admin_id: string
  auto_approve: boolean | null
  banner_url: string | null
  allow_ringers: boolean | null
}

interface MyGroup extends GroupRow {
  memberCount: number
  hasActiveLeague: boolean
  recentMembers: Array<{ id: string; name: string; avatar_url?: string | null }>
  userRole: string
  memberStatus: string
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


// ── My Group Card ─────────────────────────────────────────────────────────────

function MyGroupCard({ group, index, badge }: { group: MyGroup; index: number; badge?: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  return (
    <motion.button
      onClick={() => navigate(`/people/groups/${group.id}`)}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      whileTap={{ scale: 0.985 }}
      className="w-full text-left bg-card rounded-2xl border border-hairline overflow-hidden hover:border-court-100 transition-colors relative"
    >
      <div className="flex">
        <div className="w-1 bg-court flex-shrink-0" />
        <div className="flex-1 px-4 py-3.5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-[15px] font-bold text-ink truncate">{group.name}</h3>
                {group.hasActiveLeague && (
                  <span className="inline-flex items-center rounded-full bg-court-50 border border-court-100 px-2 py-0.5 text-[11px] font-semibold text-court">
                    {t('people.active_league')}
                  </span>
                )}
                {badge && (
                  <span className={cn(
                    'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold',
                    badge === t('people.badge_ringer') ? 'bg-warn text-white' : 'bg-warn text-white'
                  )}>
                    {badge}
                  </span>
                )}
              </div>
              {group.city && (
                <div className="flex items-center gap-1 mt-0.5">
                  <MapPin className="h-3 w-3 text-ink-2" />
                  <p className="text-[12px] text-ink-2">{group.city}</p>
                </div>
              )}
            </div>
            <ChevronRight className="h-4 w-4 text-ink-3 flex-shrink-0 mt-1" />
          </div>

          <div className="flex items-center gap-2 mt-3">
            <div className="flex -space-x-1.5">
              {group.recentMembers.map((m) => (
                <PlayerAvatar key={m.id} name={m.name} avatarUrl={m.avatar_url} size="sm" />
              ))}
            </div>
            <span className="text-[12px] text-ink-2">
              {group.memberCount === 1 ? t('people.member', { count: 1 }) : t('people.members', { count: group.memberCount })}
            </span>
          </div>
        </div>
      </div>
    </motion.button>
  )
}

// ── Group Preview Sheet ──────────────────────────────────────────────────────





// ── Main Page ─────────────────────────────────────────────────────────────────

export function PeoplePage() {
  const { profile } = useAuth()
  const navigate     = useNavigate()
  const location     = useLocation()
  const queryClient  = useQueryClient()
  const { t }        = useTranslation()
  const [showCreateSheet, setShowCreateSheet] = useState(false)


  const userId = profile?.id ?? ''

  // Section refs for QuickLinks + hash scroll
  const groupsRef = useRef<HTMLElement>(null)
  const connectionsRef = useRef<HTMLElement>(null)

  /**
   * Leagues the player is actually in.
   *
   * Until now nothing in the app linked to `/leagues` at all — the route
   * existed, `LeagueDiscovery` was built, and the only way in was a deep link.
   * Leagues are a social object, so Community is where the door belongs.
   */
  const { data: myLeagueCount = 0 } = useQuery({
    queryKey: ['my-league-count', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('league_members')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'active')
      if (error) throw error
      return count ?? 0
    },
  })

  // Queries
  const { data: connectionsData } = useMyConnections(userId)
  const connections = connectionsData ?? { accepted: new Set<string>(), acceptedProfiles: [], pendingOutgoing: new Set<string>(), incomingRequests: [] }
  const { data: allMyGroups = [], isLoading: loadingMine } = useMyGroups(userId)
  const { data: pendingRequests = [] } = usePendingRequests(userId)
  const myGroups = allMyGroups.filter(g => g.memberStatus === 'approved')
  const ringerGroups = allMyGroups.filter(g => g.memberStatus === 'ringer')



  // Quick links config
  const { data: playerCount = 0 } = useQuery<number>({
    queryKey: ['people-player-count'],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { count } = await supabase
        .from('profiles').select('id', { count: 'exact', head: true })
      return count ?? 0
    },
  })

  const { data: venueCount = 0 } = useQuery<number>({
    queryKey: ['people-venue-count'],
    staleTime: 24 * 60 * 60_000,
    queryFn: async () => {
      const { count } = await supabase
        .from('discoverable_venues')
        .select('venue_id', { count: 'exact', head: true })
      return count ?? 0
    },
  })

  // Hash scroll for notification deep links (/people#connections)
  useEffect(() => {
    if (location.hash !== '#connections') return
    if (!connectionsData) return
    const timer = setTimeout(() => {
      connectionsRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, 150)
    return () => clearTimeout(timer)
  }, [location.hash, connectionsData])

  // ── Mutations ──────────────────────────────────────────────────────────────



  const cancelRequestMutation = useMutation({
    mutationFn: async (groupId: string) => {
      const { error } = await supabase.from('group_members').delete()
        .eq('group_id', groupId).eq('user_id', userId).eq('status', 'pending')
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-requests', userId] })
      queryClient.invalidateQueries({ queryKey: ['all-groups'] })
    },
  })



  // Merged groups list: approved + ringer (with badge)
  const mergedGroups = [
    ...myGroups.map(g => ({ ...g, badge: undefined as string | undefined })),
    ...ringerGroups.map(g => ({ ...g, badge: t('people.badge_ringer') as string | undefined })),
  ]



  return (
    <div className="min-h-full bg-surface pb-32">
      <div className="px-5 pb-2 pt-14">
        <ClubThisWeek
          groups={allMyGroups.map((g) => ({ id: g.id, name: g.name }))}
          userId={userId}
        />
      </div>

      <div className="px-5 space-y-6 pt-4">
        {/* Directory — the five things you come here to find. */}
        <DirectoryGrid
          counts={{
            groups: allMyGroups.length || undefined,
            players: playerCount || undefined,
            venues: venueCount || undefined,
          }}
        />

        {/* Open Matches link.
            It used to sit on `warn-50` behind a 🎾 emoji. Two things wrong with
            that: `warn` means *something needs your attention*, and an open
            match is an invitation, not a warning; and the emoji renders in a
            different palette on every platform — blue on Android, green on iOS —
            so it was the one genuinely off-brand element on the page. Open
            Matches and My Connections are the same kind of thing — two doors to
            finding people to play with — so they are now a matched pair, told
            apart by their words and their glyphs rather than by hue. The ring
            glyph is the one the Play sheet already uses for open matches. */}
        <button
          onClick={() => navigate('/open-matches')}
          className="w-full flex items-center gap-3 rounded-2xl border border-court-100 bg-court-50/50 px-4 py-3 text-left active:scale-[0.98] transition-transform"
        >
          <div className="h-9 w-9 rounded-xl bg-court-100 flex items-center justify-center flex-shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-court)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 1 0 18" /><path d="M12 3a9 9 0 0 0 0 18" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-bold text-ink">{t('people.open_matches')}</p>
            <p className="text-[11px] text-ink-2">{t('people.open_matches_subtitle')}</p>
          </div>
          <ChevronRight className="h-4 w-4 text-ink-3 flex-shrink-0" />
        </button>

        {/* My Connections link */}
        <button
          onClick={() => navigate('/people/connections')}
          className="w-full flex items-center gap-3 rounded-2xl border border-court-100 bg-court-50/50 px-4 py-3 text-left active:scale-[0.98] transition-transform"
        >
          <div className="h-9 w-9 rounded-xl bg-court-100 flex items-center justify-center flex-shrink-0">
            <Users className="h-4.5 w-4.5 text-court" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-bold text-ink">{t('people.my_connections')}</p>
            <p className="text-[11px] text-ink-2">{t('people.my_connections_subtitle')}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {connections.accepted.size > 0 && (
              <span className="text-[12px] font-semibold text-court">{connections.accepted.size}</span>
            )}
            <ChevronRight className="h-4 w-4 text-ink-3" />
          </div>
        </button>

        {/* My Leagues link — the app's only entry point to league discovery. */}
        <button
          onClick={() => navigate('/leagues')}
          className="w-full flex items-center gap-3 rounded-2xl border border-court-100 bg-court-50/50 px-4 py-3 text-left active:scale-[0.98] transition-transform"
        >
          <div className="h-9 w-9 rounded-xl bg-court-100 flex items-center justify-center flex-shrink-0">
            <Trophy className="h-4.5 w-4.5 text-court" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-bold text-ink">{t('people.my_leagues')}</p>
            <p className="text-[11px] text-ink-2">
              {myLeagueCount > 0
                ? t('people.my_leagues_subtitle')
                : t('people.my_leagues_empty')}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {myLeagueCount > 0 && (
              <span className="text-[12px] font-semibold text-court">{myLeagueCount}</span>
            )}
            <ChevronRight className="h-4 w-4 text-ink-3" />
          </div>
        </button>

        {/* ── Connection requests ──
            What was a full "Connections" section here duplicated the My
            Connections row directly above: same four faces, same "show all",
            same destination. The one part that was not a duplicate is this —
            somebody is waiting on a yes or no. A task belongs near the top and
            should disappear when there is nothing to do, so it is now a
            conditional strip rather than a permanent heading with an empty
            state under it. */}
        {connections.incomingRequests.length > 0 && (
          <section ref={connectionsRef} id="connections">
            <p className="mb-2 text-[11px] font-bold uppercase leading-[14px] tracking-[0.06em] text-ink-2">
              {t('people.connection_requests', { count: connections.incomingRequests.length })}
            </p>
            <div className="space-y-2">
              {connections.incomingRequests.map((req) => (
                <ConnectionRequestCard key={req.user_id} request={req} />
              ))}
            </div>
          </section>
        )}

        {/* ── My Groups (merged: approved + ringer + pending) ── */}
        <section ref={groupsRef} id="groups" style={{ scrollMarginTop: '120px' }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[16px] font-bold text-ink">{t('people.my_groups')}</h2>
            {mergedGroups.length > 0 && (
              <span className="text-[12px] text-ink-2">
                {mergedGroups.length} group{mergedGroups.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {loadingMine ? (
            <div className="space-y-3">
              {[0, 1].map((i) => (
                <div key={i} className="h-20 rounded-2xl bg-hairline animate-pulse" />
              ))}
            </div>
          ) : mergedGroups.length === 0 && pendingRequests.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-hairline p-6 text-center">
              <div className="h-10 w-10 rounded-2xl bg-hairline flex items-center justify-center mx-auto mb-3">
                <Users className="h-5 w-5 text-ink-2" />
              </div>
              <p className="text-[14px] font-semibold text-ink-2 mb-1">{t('people.no_groups')}</p>
              <p className="text-[12px] text-ink-2 mb-4">{t('people.no_groups_sub')}</p>
              <button
                onClick={() => setShowCreateSheet(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-court px-4 py-2.5 text-[13px] font-bold text-white"
              >
                <Plus className="h-3.5 w-3.5" />
                {t('people.create_group')}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {mergedGroups.map((group, i) => (
                <MyGroupCard key={group.id} group={group} index={i} badge={group.badge} />
              ))}
              {/* Pending group requests inline */}
              {pendingRequests.map((req) => (
                <div key={req.id} className="flex items-center justify-between gap-3 rounded-2xl border border-warn-100 bg-warn-50 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold text-ink truncate">{req.groupName}</p>
                    {req.groupCity && <p className="text-[11px] text-ink-2">{req.groupCity}</p>}
                    <span className="inline-flex items-center mt-1 rounded-full bg-warn-100 px-2 py-0.5 text-[11px] font-semibold text-warn">
                      {t('people.pending_approval')}
                    </span>
                  </div>
                  <button
                    onClick={() => cancelRequestMutation.mutate(req.group_id)}
                    disabled={cancelRequestMutation.isPending}
                    className="flex-shrink-0 rounded-xl border border-alert/40 px-3 py-1.5 text-[11px] font-bold text-alert active:scale-95 transition-transform"
                  >
                    {t('people.cancel')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>






      </div>

      {/* Floating + button */}
      <motion.button
        onClick={() => setShowCreateSheet(true)}
        whileTap={{ scale: 0.9 }}
        className="fixed bottom-[calc(80px+env(safe-area-inset-bottom)+16px)] right-5 z-40 h-14 w-14 rounded-full bg-court shadow-lg flex items-center justify-center"
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
