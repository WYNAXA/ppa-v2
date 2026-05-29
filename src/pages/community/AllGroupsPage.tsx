import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, Search, Users, MapPin, Lock, X, Globe, UserCheck, Info } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

interface DiscoverGroup {
  id: string; name: string; description: string | null; city: string | null
  visibility: string | null; admin_id: string
  auto_approve: boolean | null; banner_url: string | null; allow_ringers: boolean | null
  memberCount: number; membershipStatus: 'none' | 'pending' | 'approved' | 'ringer' | 'pending_ringer'
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
  const [previewGroup, setPreviewGroup] = useState<DiscoverGroup | null>(null)

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
        .select('id, name, description, city, visibility, admin_id, auto_approve, banner_url, allow_ringers')
        .limit(100)

      if (sortBy === 'newest') q = q.order('created_at', { ascending: false })
      else q = q.order('name')

      if (search.trim()) q = q.or(`name.ilike.%${search.trim()}%,description.ilike.%${search.trim()}%,city.ilike.%${search.trim()}%`)
      if (activeFilter === 'near_me' && profile?.city) {
        const cityName = (profile.city ?? '').split(',')[0].split(' ')[0].trim()
        if (cityName.length >= 3) q = q.ilike('city', `%${cityName}%`)
      }
      if (activeFilter === 'open_to_join') q = q.or('visibility.in.(open,public),auto_approve.eq.true')
      if (activeFilter === 'welcomes_ringers') q = q.eq('allow_ringers', true)

      const { data, error } = await q
      if (error) throw error
      const filtered = (data ?? []).filter((g) => !myGroupIds.includes(g.id))
      console.warn(`[AllGroups] query returned ${(data ?? []).length} groups, after excluding mine: ${filtered.length}`)
      if (filtered.length === 0) return []

      const ids = filtered.map(g => g.id)
      const { data: memberRows } = await supabase.from('group_members').select('group_id').in('group_id', ids).eq('status', 'approved')
      const countMap: Record<string, number> = {}
      for (const m of memberRows ?? []) countMap[m.group_id] = (countMap[m.group_id] ?? 0) + 1
      console.warn(`[AllGroups] member counts:`, Object.entries(countMap).map(([id, c]) => `${id.slice(0,8)}=${c}`).join(', ') || '(all zero)')

      const { data: statusRows } = await supabase.from('group_members').select('group_id, status').in('group_id', ids).eq('user_id', userId)
      const statusMap: Record<string, string> = {}
      for (const r of statusRows ?? []) statusMap[r.group_id] = r.status

      const result = filtered
        .filter(g => statusMap[g.id] !== 'approved' && statusMap[g.id] !== 'ringer')
        .map(g => ({ ...g, memberCount: countMap[g.id] ?? 0, membershipStatus: (statusMap[g.id] ?? 'none') as any }))

      if (sortBy === 'most_members') result.sort((a, b) => b.memberCount - a.memberCount)
      console.warn(`[AllGroups] final result: ${result.length} groups, sort=${sortBy}, counts=[${result.map(g => g.memberCount).join(',')}]`)
      return result
    },
  })

  const joinMutation = useMutation({
    mutationFn: async (groupId: string) => {
      const group = groups.find(g => g.id === groupId)
      const isOpen = group?.visibility === 'open' || group?.visibility === 'public'
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

  const ringerOfferMutation = useMutation({
    mutationFn: async (groupId: string) => {
      const group = groups.find(g => g.id === groupId)
      const { error } = await supabase.from('group_members').insert({
        group_id: groupId, user_id: userId, role: 'member', status: 'pending_ringer',
      })
      if (error) {
        if (error.code === '23505') throw new Error('duplicate')
        throw error
      }
      return group?.name
    },
    onSuccess: (name) => {
      toast.success(t('community.ringer_offer_sent', { name: name ?? '' }))
      queryClient.invalidateQueries({ queryKey: ['all-groups'] })
    },
    onError: (err: Error) => {
      if (err.message === 'duplicate') {
        toast.error(t('community.join_declined_contact_admin'))
      } else {
        toast.error(err.message || t('community.join_error'))
      }
    },
  })

  const joiningId = joinMutation.isPending ? joinMutation.variables : undefined
  const [showRingerInfo, setShowRingerInfo] = useState(false)

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
          {[{ key: 'near_me', label: t('community.filter_near_me') }, { key: 'open_to_join', label: t('community.filter_open_to_join') }, { key: 'welcomes_ringers', label: t('community.filter_welcomes_ringers') }].map(({ key, label }) => (
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
                onClick={() => setPreviewGroup(g)}
                className="bg-white rounded-2xl border border-gray-100 px-4 py-3.5 cursor-pointer active:scale-[0.98] transition-transform">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-[14px] font-bold text-gray-900 truncate">{g.name}</h3>
                    {g.city && <div className="flex items-center gap-1 mt-0.5"><MapPin className="h-3 w-3 text-gray-400" /><p className="text-[12px] text-gray-400">{g.city}</p></div>}
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="inline-flex items-center gap-1 text-[12px] text-gray-500">
                        <Users className="h-3 w-3 text-gray-400" /> {g.memberCount === 1 ? t('community.member', { count: 1 }) : t('community.members', { count: g.memberCount })}
                      </span>
                      {g.visibility === 'private' && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-gray-600 bg-gray-100 rounded-full px-1.5 py-0.5">
                          <Lock className="h-2.5 w-2.5" /> {t('community.group_private')}
                        </span>
                      )}
                    </div>
                    {g.description && <p className="text-[12px] text-gray-400 mt-1 line-clamp-2">{g.description}</p>}
                  </div>
                  {g.membershipStatus === 'pending' ? (
                    <span className="rounded-xl bg-gray-100 px-3 py-1.5 text-[12px] font-semibold text-gray-500 flex-shrink-0">{t('community.group_requested')}</span>
                  ) : (() => {
                    const isAutoJoin = g.visibility === 'open' || g.visibility === 'public' || g.auto_approve === true
                    return (
                      <button onClick={(e) => { e.stopPropagation(); joinMutation.mutate(g.id) }} disabled={joinMutation.isPending && joinMutation.variables === g.id}
                        className="rounded-xl bg-[#009688] px-3 py-1.5 text-[12px] font-bold text-white flex-shrink-0 active:scale-95 transition-transform disabled:opacity-50">
                        {joinMutation.isPending && joinMutation.variables === g.id ? t('community.joining') : isAutoJoin ? t('community.join_btn') : t('community.request_to_join')}
                      </button>
                    )
                  })()}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Group Preview Sheet */}
      <AnimatePresence>
        {previewGroup && (
          <>
            <motion.div
              className="fixed inset-0 z-[55] bg-black/40"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setPreviewGroup(null)}
            />
            <motion.div
              className="fixed bottom-0 left-0 right-0 z-[60] bg-white rounded-t-3xl"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            >
              <div className="flex justify-center pt-3 pb-1">
                <div className="h-1 w-10 rounded-full bg-gray-200" />
              </div>
              <div className="flex justify-end px-5 pb-1">
                <button onClick={() => setPreviewGroup(null)} className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center">
                  <X className="h-4 w-4 text-gray-500" />
                </button>
              </div>
              <div className="px-5 overflow-y-auto" style={{ maxHeight: '75vh', paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}>
                {previewGroup.banner_url && (
                  <div className="relative h-32 rounded-2xl overflow-hidden mb-4">
                    <img src={previewGroup.banner_url} alt={previewGroup.name} className="w-full h-full object-cover" />
                  </div>
                )}
                <h2 className="text-[18px] font-bold text-gray-900">{previewGroup.name}</h2>
                {previewGroup.city && (
                  <div className="flex items-center gap-1 mt-1">
                    <MapPin className="h-3.5 w-3.5 text-gray-400" />
                    <p className="text-[13px] text-gray-500">{previewGroup.city}</p>
                  </div>
                )}
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  {previewGroup.visibility === 'private' ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-600 bg-gray-100 rounded-full px-2.5 py-1">
                      <Lock className="h-3 w-3" /> {t('community.group_private')}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-700 bg-teal-50 rounded-full px-2.5 py-1">
                      <Globe className="h-3 w-3" /> {previewGroup.visibility === 'public' ? 'Public' : t('community.group_open')}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-600 bg-gray-100 rounded-full px-2.5 py-1">
                    <Users className="h-3 w-3" /> {previewGroup.memberCount === 1 ? t('community.member', { count: 1 }) : t('community.members', { count: previewGroup.memberCount })}
                  </span>
                  {previewGroup.allow_ringers && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-orange-700 bg-orange-50 rounded-full px-2.5 py-1">
                      <UserCheck className="h-3 w-3" /> {t('community.welcomes_ringers')}
                    </span>
                  )}
                </div>
                {previewGroup.description && (
                  <p className="text-[13px] text-gray-500 mt-4 leading-relaxed">{previewGroup.description}</p>
                )}
                <div className="mt-6 mb-4 space-y-3">
                  {previewGroup.membershipStatus === 'pending' ? (
                    <div className="w-full rounded-2xl bg-gray-100 py-3.5 text-center text-[14px] font-semibold text-gray-500">
                      {t('community.group_requested')}
                    </div>
                  ) : previewGroup.membershipStatus === 'pending_ringer' ? (
                    <div className="w-full rounded-2xl bg-orange-50 border border-orange-200 py-3.5 text-center text-[14px] font-semibold text-orange-600">
                      {t('community.ringer_offer_pending')}
                    </div>
                  ) : previewGroup.membershipStatus === 'ringer' ? (
                    <div className="w-full rounded-2xl bg-orange-50 border border-orange-200 py-3.5 text-center text-[14px] font-semibold text-orange-600">
                      {t('community.already_ringer')}
                    </div>
                  ) : (() => {
                    const isAutoJoin = previewGroup.visibility === 'open' || previewGroup.visibility === 'public' || previewGroup.auto_approve === true
                    const canOfferRinger = previewGroup.allow_ringers && previewGroup.membershipStatus === 'none'
                    return (
                      <>
                        <button
                          onClick={() => joinMutation.mutate(previewGroup.id)}
                          disabled={joiningId === previewGroup.id}
                          className="w-full rounded-2xl bg-[#009688] py-3.5 text-[14px] font-bold text-white active:scale-[0.98] transition-transform disabled:opacity-50"
                        >
                          {joiningId === previewGroup.id ? t('community.joining') : isAutoJoin ? t('community.join_btn') : t('community.request_to_join')}
                        </button>
                        {canOfferRinger && (
                          <button
                            onClick={() => ringerOfferMutation.mutate(previewGroup.id)}
                            disabled={ringerOfferMutation.isPending}
                            className="w-full rounded-2xl border border-orange-200 bg-orange-50 py-3 text-[13px] font-semibold text-orange-700 active:scale-[0.98] transition-transform disabled:opacity-50 flex items-center justify-center gap-2"
                          >
                            <UserCheck className="h-4 w-4" />
                            {ringerOfferMutation.isPending ? t('community.offering') : t('community.offer_ringer')}
                            <button type="button" onClick={(e) => { e.stopPropagation(); setShowRingerInfo(!showRingerInfo) }} className="ml-1">
                              <Info className="h-3.5 w-3.5 text-orange-400" />
                            </button>
                          </button>
                        )}
                        {showRingerInfo && (
                          <p className="text-[11px] text-gray-500 leading-relaxed px-1">
                            {t('community.ringer_info')}
                          </p>
                        )}
                      </>
                    )
                  })()}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
