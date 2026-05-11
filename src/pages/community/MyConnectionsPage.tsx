import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, Calendar, Users } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { ConnectionCard } from '@/components/community/ConnectionCard'
import { ConnectionRequestCard } from '@/components/community/ConnectionRequestCard'
import { InviteToMatchSheet } from '@/components/community/InviteToMatchSheet'
import { InviteToGroupSheet } from '@/components/community/InviteToGroupSheet'

interface ConnectionProfile {
  user_id: string; name: string; avatar_url?: string | null; city?: string | null; internal_ranking?: number | null
}

export function MyConnectionsPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const userId = profile?.id ?? ''
  const [inviteMatch, setInviteMatch] = useState<{ id: string; name: string } | null>(null)
  const [inviteGroup, setInviteGroup] = useState<{ id: string; name: string } | null>(null)

  const { data } = useQuery({
    queryKey: ['my-connections-full', userId],
    enabled: !!userId,
    queryFn: async () => {
      const [{ data: out }, { data: inc }] = await Promise.all([
        supabase.from('player_connections').select('connected_user_id, status').eq('user_id', userId),
        supabase.from('player_connections').select('user_id, status').eq('connected_user_id', userId),
      ])

      const acceptedIds = new Set<string>()
      const incomingPendingIds: string[] = []
      for (const r of out ?? []) { if (r.status === 'accepted') acceptedIds.add(r.connected_user_id) }
      for (const r of inc ?? []) {
        if (r.status === 'accepted') acceptedIds.add(r.user_id)
        else if (r.status === 'pending') incomingPendingIds.push(r.user_id)
      }

      const allIds = [...acceptedIds, ...incomingPendingIds]
      let profiles: any[] = []
      if (allIds.length > 0) {
        const { data } = await supabase.from('profiles').select('id, name, avatar_url, city, internal_ranking').in('id', allIds)
        profiles = data ?? []
      }
      const map = new Map(profiles.map((p: any) => [p.id, p]))

      const toProfile = (id: string): ConnectionProfile | null => {
        const p = map.get(id)
        return p ? { user_id: p.id, name: p.name, avatar_url: p.avatar_url, city: p.city, internal_ranking: p.internal_ranking } : null
      }

      return {
        accepted: [...acceptedIds].map(toProfile).filter(Boolean) as ConnectionProfile[],
        incomingRequests: incomingPendingIds.map(toProfile).filter(Boolean) as ConnectionProfile[],
      }
    },
  })

  const accepted = data?.accepted ?? []
  const incoming = data?.incomingRequests ?? []

  return (
    <div className="min-h-full bg-white pb-32">
      <div className="px-4 pt-12 pb-4 bg-white border-b border-gray-100">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/community')} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 -ml-1">
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">My Connections</h1>
          {accepted.length > 0 && <span className="text-[12px] text-gray-400 ml-auto">{accepted.length}</span>}
        </div>
      </div>
      <div className="px-5 pt-4 space-y-5">
        {incoming.length > 0 && (
          <div>
            <p className="text-[12px] font-bold text-gray-500 mb-2">Requests ({incoming.length})</p>
            <div className="space-y-2">
              {incoming.map(r => <ConnectionRequestCard key={r.user_id} request={r} />)}
            </div>
          </div>
        )}

        {accepted.length > 0 ? (
          <div className="space-y-2">
            {accepted.map(conn => (
              <ConnectionCard key={conn.user_id} player={conn}>
                <button onClick={() => setInviteMatch({ id: conn.user_id, name: conn.name })}
                  className="rounded-lg bg-teal-50 border border-teal-200 px-2 py-1 text-[10px] font-bold text-teal-700">
                  <Calendar className="h-3 w-3 inline mr-0.5" /> Match
                </button>
                <button onClick={() => setInviteGroup({ id: conn.user_id, name: conn.name })}
                  className="rounded-lg bg-blue-50 border border-blue-200 px-2 py-1 text-[10px] font-bold text-blue-700">
                  <Users className="h-3 w-3 inline mr-0.5" /> Group
                </button>
              </ConnectionCard>
            ))}
          </div>
        ) : incoming.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 p-5 text-center">
            <p className="text-[13px] font-semibold text-gray-500">No connections yet</p>
            <p className="text-[12px] text-gray-400 mt-1">Find players in the Community tab to connect.</p>
          </div>
        ) : null}
      </div>

      <InviteToMatchSheet open={!!inviteMatch} onClose={() => setInviteMatch(null)}
        playerId={inviteMatch?.id ?? ''} playerName={inviteMatch?.name ?? ''} />
      <InviteToGroupSheet open={!!inviteGroup} onClose={() => setInviteGroup(null)}
        playerId={inviteGroup?.id ?? ''} playerName={inviteGroup?.name ?? ''} />
    </div>
  )
}
