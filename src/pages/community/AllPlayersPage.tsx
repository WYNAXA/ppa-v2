import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, Search, UserPlus, Check, Clock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PlayerAvatar } from '@/components/shared/PlayerAvatar'

export function AllPlayersPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const userId = profile?.id ?? ''
  const [search, setSearch] = useState('')
  const [cityFilter, setCityFilter] = useState(false)

  useEffect(() => { if (profile?.city) setCityFilter(true) }, [profile?.city])

  const { data: players = [] } = useQuery({
    queryKey: ['all-players', userId, search, cityFilter],
    enabled: !!userId,
    queryFn: async () => {
      let q = supabase.from('profiles').select('id, name, avatar_url, city, internal_ranking')
        .neq('id', userId).order('internal_ranking', { ascending: false }).limit(100)
      if (search.trim()) q = q.ilike('name', `%${search.trim()}%`)
      if (cityFilter && profile?.city && !search.trim()) q = q.ilike('city', `%${profile.city}%`)
      const { data } = await q
      return data ?? []
    },
  })

  const { data: connectionData } = useQuery({
    queryKey: ['my-connections-status', userId],
    enabled: !!userId,
    queryFn: async () => {
      const [{ data: out }, { data: inc }] = await Promise.all([
        supabase.from('player_connections').select('connected_user_id, status').eq('user_id', userId),
        supabase.from('player_connections').select('user_id, status').eq('connected_user_id', userId),
      ])
      const accepted = new Set<string>()
      const pendingOut = new Set<string>()
      const pendingIn = new Set<string>()
      for (const r of out ?? []) { if (r.status === 'accepted') accepted.add(r.connected_user_id); else if (r.status === 'pending') pendingOut.add(r.connected_user_id) }
      for (const r of inc ?? []) { if (r.status === 'accepted') accepted.add(r.user_id); else if (r.status === 'pending') pendingIn.add(r.user_id) }
      return { accepted, pendingOut, pendingIn }
    },
  })

  const conns = connectionData ?? { accepted: new Set<string>(), pendingOut: new Set<string>(), pendingIn: new Set<string>() }

  const connectMutation = useMutation({
    mutationFn: async (targetId: string) => {
      const { error } = await supabase.from('player_connections').insert({ user_id: userId, connected_user_id: targetId, status: 'pending' })
      if (error) throw error
      await supabase.from('notifications').insert({
        user_id: targetId, type: 'connection_request', title: 'Connection request',
        message: `${profile?.name ?? 'A player'} wants to connect with you.`, related_id: userId, read: false,
      })
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['my-connections-status', userId] }) },
  })

  const acceptMutation = useMutation({
    mutationFn: async (requesterId: string) => {
      const { error } = await supabase.rpc('accept_connection_request', { p_requester_id: requesterId })
      if (error) throw error
      await supabase.from('notifications').insert({
        user_id: requesterId, type: 'connection_accepted', title: 'Connection accepted',
        message: `${profile?.name ?? 'A player'} accepted your connection request.`, related_id: userId, read: false,
      })
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['my-connections-status', userId] }) },
  })

  function getState(pid: string) {
    if (conns.accepted.has(pid)) return 'accepted'
    if (conns.pendingOut.has(pid)) return 'pending_out'
    if (conns.pendingIn.has(pid)) return 'pending_in'
    return 'none'
  }

  return (
    <div className="min-h-full bg-white pb-32">
      <div className="px-4 pt-12 pb-4 bg-white border-b border-gray-100">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/community')} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 -ml-1">
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">Find Players</h1>
        </div>
      </div>
      <div className="px-5 pt-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search players by name..."
            style={{ fontSize: '16px' }}
            className="w-full rounded-xl border border-gray-200 pl-9 pr-4 py-2.5 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20" />
        </div>
        {profile?.city && (
          <button onClick={() => setCityFilter(v => !v)}
            className={`rounded-full px-3 py-1 text-[12px] font-semibold border transition-colors ${cityFilter ? 'bg-[#009688] text-white border-[#009688]' : 'bg-white text-gray-600 border-gray-200'}`}>
            Near me ({profile.city})
          </button>
        )}
        <div className="space-y-2">
          {players.map(p => {
            const state = getState(p.id)
            return (
              <div key={p.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50">
                <button onClick={() => navigate(`/players/${p.id}`)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                  <PlayerAvatar name={p.name} avatarUrl={p.avatar_url} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-gray-800 truncate">{p.name}</p>
                    {p.city && <p className="text-[11px] text-gray-400">{p.city}</p>}
                  </div>
                </button>
                {p.internal_ranking != null && (
                  <span className="text-[11px] font-bold text-teal-700 bg-teal-50 border border-teal-100 rounded-full px-2 py-0.5 flex-shrink-0">{p.internal_ranking} ELO</span>
                )}
                {state === 'none' && (
                  <button onClick={() => connectMutation.mutate(p.id)} disabled={connectMutation.isPending}
                    className="flex-shrink-0 flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold bg-[#009688] text-white">
                    <UserPlus className="h-3 w-3" /> Connect
                  </button>
                )}
                {state === 'pending_out' && (
                  <span className="flex-shrink-0 flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold bg-gray-100 text-gray-400">
                    <Clock className="h-3 w-3" /> Pending
                  </span>
                )}
                {state === 'pending_in' && (
                  <button onClick={() => acceptMutation.mutate(p.id)} disabled={acceptMutation.isPending}
                    className="flex-shrink-0 flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold bg-[#009688] text-white">
                    <Check className="h-3 w-3" /> Accept
                  </button>
                )}
                {state === 'accepted' && (
                  <span className="flex-shrink-0 flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold bg-gray-100 text-gray-400">
                    <Check className="h-3 w-3" /> Connected
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
