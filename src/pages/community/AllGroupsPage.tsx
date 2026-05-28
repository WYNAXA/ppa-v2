import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { ChevronLeft, Search, Users, MapPin } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

interface DiscoverGroup {
  id: string; name: string; description: string | null; city: string | null
  visibility: string | null; join_mode: string | null; admin_id: string
  auto_approve: boolean | null; allow_join_requests: boolean | null
  memberCount: number; membershipStatus: 'none' | 'pending' | 'approved'
}

export function AllGroupsPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const userId = profile?.id ?? ''
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState('newest')

  const { data: myGroupIds = [] } = useQuery({
    queryKey: ['my-group-ids', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from('group_members').select('group_id')
        .eq('user_id', userId).in('status', ['approved', 'ringer'])
      return (data ?? []).map((r: any) => r.group_id)
    },
  })

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ['all-groups', userId, search, activeFilter, sortBy],
    enabled: !!userId,
    queryFn: async (): Promise<DiscoverGroup[]> => {
      let q = supabase.from('groups')
        .select('id, name, description, city, visibility, join_mode, admin_id, auto_approve, allow_join_requests')
        .or('visibility.in.(public,open),visibility.is.null')
        .limit(100)

      if (sortBy === 'newest') q = q.order('created_at', { ascending: false })
      else q = q.order('name')

      if (search.trim()) q = q.or(`name.ilike.%${search.trim()}%,description.ilike.%${search.trim()}%,city.ilike.%${search.trim()}%`)
      if (activeFilter === 'near_me' && profile?.city) {
        const cityName = (profile.city ?? '').split(',')[0].split(' ')[0].trim()
        if (cityName.length >= 3) q = q.ilike('city', `%${cityName}%`)
      }
      if (activeFilter === 'open_to_join') q = q.or('join_mode.eq.open,auto_approve.eq.true,join_mode.is.null')

      const { data, error } = await q
      if (error) throw error
      const filtered = (data ?? []).filter((g) => !myGroupIds.includes(g.id))
      if (filtered.length === 0) return []

      const ids = filtered.map(g => g.id)
      const { data: memberRows } = await supabase.from('group_members').select('group_id').in('group_id', ids).eq('status', 'approved')
      const countMap: Record<string, number> = {}
      for (const m of memberRows ?? []) countMap[m.group_id] = (countMap[m.group_id] ?? 0) + 1

      const { data: statusRows } = await supabase.from('group_members').select('group_id, status').in('group_id', ids).eq('user_id', userId)
      const statusMap: Record<string, string> = {}
      for (const r of statusRows ?? []) statusMap[r.group_id] = r.status

      const result = filtered
        .filter(g => statusMap[g.id] !== 'approved')
        .map(g => ({ ...g, memberCount: countMap[g.id] ?? 0, membershipStatus: (statusMap[g.id] ?? 'none') as any }))

      if (sortBy === 'most_members') result.sort((a, b) => b.memberCount - a.memberCount)
      return result
    },
  })

  const joinMutation = useMutation({
    mutationFn: async (groupId: string) => {
      const group = groups.find(g => g.id === groupId)
      if (group?.join_mode === 'closed') throw new Error('Closed')
      const isOpen = group?.visibility === 'open' || group?.visibility === 'public' || group?.join_mode === 'open'
      const autoApprove = isOpen || group?.auto_approve === true
      const { error } = await supabase.from('group_members').insert({
        group_id: groupId, user_id: userId, role: 'member', status: autoApprove ? 'approved' : 'pending',
      })
      if (error) {
        if (error.code === '23505') throw new Error('duplicate')
        throw error
      }
      return { autoApprove, groupName: group?.name }
    },
    onSuccess: (data) => {
      const msg = data?.autoApprove
        ? t('community.joined_group_name', { name: data.groupName ?? '' })
        : t('community.request_sent')
      toast.success(msg)
      queryClient.invalidateQueries({ queryKey: ['all-groups'] })
      queryClient.invalidateQueries({ queryKey: ['my-groups'] })
    },
    onError: (err: Error) => {
      if (err.message === 'duplicate') {
        toast.error(t('community.join_declined_contact_admin'))
      } else {
        toast.error(err.message || t('community.join_error'))
      }
    },
  })

  return (
    <div className="min-h-full bg-white pb-32">
      <div className="px-4 pt-12 pb-4 bg-white border-b border-gray-100">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/community')} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 -ml-1">
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">{t('community.find_groups')}</h1>
        </div>
      </div>
      <div className="px-5 pt-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search groups..."
            style={{ fontSize: '16px' }}
            className="w-full rounded-xl border border-gray-200 pl-9 pr-4 py-2.5 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20" />
        </div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5">
          {[{ key: 'near_me', label: t('community.filter_near_me') }, { key: 'open_to_join', label: t('community.filter_open_to_join') }].map(({ key, label }) => (
            <button key={key} onClick={() => setActiveFilter(activeFilter === key ? null : key)}
              className={`flex-shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold border transition-colors ${activeFilter === key ? 'bg-[#009688] text-white border-[#009688]' : 'bg-white text-gray-600 border-gray-200'}`}>
              {label}
            </button>
          ))}
          <span className="text-gray-300 self-center">|</span>
          {[{ key: 'newest', label: t('community.filter_newest') }, { key: 'most_members', label: t('community.filter_most_members') }].map(({ key, label }) => (
            <button key={key} onClick={() => setSortBy(key)}
              className={`flex-shrink-0 rounded-full px-3 py-1.5 text-[11px] font-medium border transition-colors ${sortBy === key ? 'bg-gray-800 text-white border-gray-800' : 'bg-gray-50 text-gray-500 border-gray-200'}`}>
              {label}
            </button>
          ))}
        </div>
        {isLoading ? (
          <div className="space-y-3">{[0, 1, 2].map(i => <div key={i} className="h-20 rounded-2xl bg-gray-100 animate-pulse" />)}</div>
        ) : groups.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 p-5 text-center">
            <p className="text-[13px] font-semibold text-gray-500">{t('community.no_groups_found')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map((g, i) => (
              <motion.div key={g.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                className="bg-white rounded-2xl border border-gray-100 px-4 py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-[14px] font-bold text-gray-900 truncate">{g.name}</h3>
                    {g.city && <div className="flex items-center gap-1 mt-0.5"><MapPin className="h-3 w-3 text-gray-400" /><p className="text-[12px] text-gray-400">{g.city}</p></div>}
                    <span className="inline-flex items-center gap-1 text-[12px] text-gray-500 mt-1">
                      <Users className="h-3 w-3 text-gray-400" /> <span className="font-semibold">{g.memberCount}</span> members
                    </span>
                    {g.description && <p className="text-[12px] text-gray-400 mt-1 line-clamp-2">{g.description}</p>}
                  </div>
                  {g.membershipStatus === 'pending' ? (
                    <span className="rounded-xl bg-gray-100 px-3 py-1.5 text-[12px] font-semibold text-gray-500 flex-shrink-0">{t('community.group_requested')}</span>
                  ) : (() => {
                    const isAutoJoin = g.visibility === 'open' || g.visibility === 'public' || g.join_mode === 'open' || g.auto_approve === true
                    return (
                      <button onClick={() => joinMutation.mutate(g.id)} disabled={joinMutation.isPending}
                        className="rounded-xl bg-[#009688] px-3 py-1.5 text-[12px] font-bold text-white flex-shrink-0 active:scale-95 transition-transform disabled:opacity-50">
                        {isAutoJoin ? t('community.join_btn') : t('community.request_to_join')}
                      </button>
                    )
                  })()}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
