/**
 * Social-graph queries: groups, connections, pending requests.
 *
 * Extracted from People.tsx so Home.tsx and Discover.tsx can share them
 * without duplicating the query definitions. The convention in this repo
 * is one hook per file in src/hooks/; these three are in one file because
 * they share types and are always used together.
 */
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// ── Types ────────────────────────────────────────────────────────────────────

export interface GroupRow {
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

export interface MyGroup extends GroupRow {
  memberCount: number
  hasActiveLeague: boolean
  recentMembers: Array<{ id: string; name: string; avatar_url?: string | null }>
  userRole: string
  memberStatus: string
}

export interface ConnectionProfile {
  user_id: string
  name: string
  avatar_url?: string | null
  city?: string | null
  internal_ranking?: number | null
}

export interface ConnectionsData {
  accepted: Set<string>
  acceptedProfiles: ConnectionProfile[]
  pendingOutgoing: Set<string>
  incomingRequests: ConnectionProfile[]
}

export interface PendingRequest {
  id: string
  group_id: string
  groupName: string
  groupCity: string | null
}

// ── Hooks ────────────────────────────────────────────────────────────────────

export function useMyGroups(userId: string) {
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

export function usePendingRequests(userId: string) {
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

export function useMyConnections(userId: string) {
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
