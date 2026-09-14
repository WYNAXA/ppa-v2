import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, Search, Users, MapPin, Lock, X, Globe, UserCheck, Info, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useMyGroups } from '@/hooks/useSocial'
import { useDiscoverList } from '@/hooks/useDiscoverList'
import { MyGroupCard } from '@/components/people/MyGroupCard'
import { CreateGroupSheet } from '@/components/people/CreateGroupSheet'

interface DiscoverGroup {
  id: string; name: string; description: string | null; city: string | null
  visibility: string | null; admin_id: string
  auto_approve: boolean | null; banner_url: string | null; allow_ringers: boolean | null
  memberCount: number; membershipStatus: 'none' | 'pending' | 'approved' | 'ringer' | 'pending_ringer' | 'ringer_declined'
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
  const [showCreateGroup, setShowCreateGroup] = useState(false)
  const { data: myGroupsList = [] } = useMyGroups(userId)
  const myApproved = myGroupsList.filter(g => g.memberStatus === 'approved')
  const myRinger = myGroupsList.filter(g => g.memberStatus === 'ringer')

  const { data: nearYouGroups = [], isLoading: loadingNearYou } = useDiscoverList('groups')

  // Filter near-you by search
  const filteredGroups = search.trim()
    ? nearYouGroups.filter(g => g.title.toLowerCase().includes(search.trim().toLowerCase()) || (g.subtitle ?? '').toLowerCase().includes(search.trim().toLowerCase()))
    : nearYouGroups

  const joinMutation = useMutation({
    mutationFn: async (groupId: string) => {
      const group = nearYouGroups.find(g => g.id === groupId)
      const joinMode = group?.meta.join_mode as string | null
      const autoApprove = joinMode === 'open'
      const { error } = await supabase.from('group_members').insert({
        group_id: groupId, user_id: userId, role: 'member', status: autoApprove ? 'approved' : 'pending',
      })
      if (error) {
        if (error.code === '23505') throw new Error('duplicate')
        throw error
      }
      return { autoApprove, groupName: group?.title }
    },
    onSuccess: (data) => {
      const msg = data?.autoApprove
        ? t('people.joined_group_name', { name: data.groupName ?? '' })
        : t('people.request_sent')
      toast.success(msg)
      queryClient.invalidateQueries({ queryKey: ['discover-list', 'groups'] })
      queryClient.invalidateQueries({ queryKey: ['my-groups'] })
    },
    onError: (err: Error) => {
      if (err.message === 'duplicate') {
        toast.error(t('people.join_declined_contact_admin'))
      } else {
        toast.error(err.message || t('people.join_error'))
      }
    },
  })

  const ringerOfferMutation = useMutation({
    mutationFn: async (groupId: string) => {
      const group = nearYouGroups.find(g => g.id === groupId)
      const { error } = await supabase.from('group_members').insert({
        group_id: groupId, user_id: userId, role: 'member', status: 'pending_ringer',
      })
      if (error) {
        if (error.code === '23505') throw new Error('duplicate')
        throw error
      }
      return group?.title
    },
    onSuccess: (name, groupId) => {
      toast.success(t('people.ringer_offer_sent', { name: name ?? '' }))
      queryClient.invalidateQueries({ queryKey: ['discover-list', 'groups'] })
      setPreviewGroup(prev => prev?.id === groupId ? { ...prev, membershipStatus: 'pending_ringer' } : prev)
    },
    onError: (err: Error) => {
      if (err.message === 'duplicate') {
        toast.error(t('people.join_declined_contact_admin'))
      } else {
        toast.error(err.message || t('people.join_error'))
      }
    },
  })

  const joiningId = joinMutation.isPending ? joinMutation.variables : undefined
  const [showRingerInfo, setShowRingerInfo] = useState(false)

  return (
    <div className="min-h-full bg-card pb-32">
      <div className="px-4 pt-12 pb-4 bg-card border-b border-hairline">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/discover')} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-hairline -ml-1">
            <ChevronLeft className="w-5 h-5 text-ink-2" />
          </button>
          <h1 className="text-xl font-bold text-ink flex-1">{t('people.find_groups')}</h1>
          <button
            onClick={() => setShowCreateGroup(true)}
            className="h-8 w-8 rounded-full bg-court flex items-center justify-center flex-shrink-0"
          >
            <Plus className="h-4 w-4 text-white" />
          </button>
        </div>
      </div>
      <div className="px-5 pt-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-2" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder={t('discover.search_groups_placeholder')}
            style={{ fontSize: '16px' }}
            className="w-full rounded-xl border border-hairline pl-9 pr-4 py-2.5 outline-none focus:border-court focus:ring-2 focus:ring-court/20" />
        </div>
        <div className="flex gap-2 overflow-x-auto scrollbar-none pb-0.5">
          {[{ key: 'near_me', label: t('people.filter_near_me') }, { key: 'open_to_join', label: t('people.filter_open_to_join') }, { key: 'welcomes_ringers', label: t('people.filter_welcomes_ringers') }].map(({ key, label }) => (
            <button key={key} onClick={() => setActiveFilter(activeFilter === key ? null : key)}
              className={`flex-shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold border transition-colors ${activeFilter === key ? 'bg-court text-white border-court' : 'bg-card text-ink-2 border-hairline'}`}>
              {label}
            </button>
          ))}
          <span className="text-ink-3 self-center">|</span>
          {[{ key: 'newest', label: t('people.filter_newest') }, { key: 'most_members', label: t('people.filter_most_members') }].map(({ key, label }) => (
            <button key={key} onClick={() => setSortBy(key)}
              className={`flex-shrink-0 rounded-full px-3 py-1.5 text-[11px] font-medium border transition-colors ${sortBy === key ? 'bg-court text-white border-court' : 'bg-card text-ink-2 border-hairline'}`}>
              {label}
            </button>
          ))}
        </div>
        {/* My groups — the Mine section, above Browse */}
        {myApproved.length + myRinger.length > 0 && (
          <section className="mb-4">
            <h2 className="text-[11px] font-bold uppercase leading-[14px] tracking-[0.06em] text-ink-2 mb-2">
              {t('people.my_groups')}
            </h2>
            <div className="space-y-2">
              {myApproved.map((g, i) => (
                <MyGroupCard key={g.id} group={g} index={i} />
              ))}
              {myRinger.map((g, i) => (
                <MyGroupCard key={g.id} group={g} index={myApproved.length + i} badge={t('people.badge_ringer')} />
              ))}
            </div>
          </section>
        )}

        {/* Near you — from discover_list */}
        <section className="mb-4">
          <h2 className="text-[11px] font-bold uppercase leading-[14px] tracking-[0.06em] text-ink-2 mb-2">
            {t('discover.near_you')} · {filteredGroups.length}
          </h2>
          {loadingNearYou ? (
            <div className="h-20 rounded-2xl bg-hairline animate-pulse" />
          ) : filteredGroups.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-hairline p-5 text-center">
              <p className="text-[13px] font-semibold text-ink-2">{t('people.no_groups_found')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredGroups.map((g) => {
                const myStatus = g.meta.my_status as string | null
                const joinMode = g.meta.join_mode as string | null
                return (
                  <button
                    key={g.id}
                    onClick={() => navigate(`/discover/groups/${g.id}`)}
                    className="w-full flex items-center gap-3 rounded-2xl border border-hairline bg-card p-3 text-left active:scale-[0.99] transition-transform"
                  >
                    <div className="h-10 w-10 rounded-full bg-court-50 flex items-center justify-center flex-shrink-0">
                      <Users className="h-5 w-5 text-court" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-semibold text-ink truncate">{g.title}</p>
                      <p className="text-[12px] text-ink-2 truncate">
                        {[g.subtitle, g.distance_miles != null ? `${g.distance_miles < 10 ? g.distance_miles.toFixed(1) : Math.round(g.distance_miles)} mi` : null].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    {myStatus === 'approved' || myStatus === 'ringer' ? (
                      <span className="text-[11px] font-bold text-court">{t('people.connected')}</span>
                    ) : joinMode !== 'closed' ? (
                      <span className="text-[11px] font-bold text-court bg-court-50 border border-court-100 rounded-full px-2 py-0.5">{t('people.join')}</span>
                    ) : null}
                  </button>
                )
              })}
            </div>
          )}
        </section>

      </div>

      {/* Group Preview Sheet */}
      <AnimatePresence>
        {previewGroup && (
          <>
            <motion.div
              className="fixed inset-0 z-[55] bg-scrim"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setPreviewGroup(null)}
            />
            <motion.div
              className="fixed bottom-0 left-0 right-0 z-[60] bg-card rounded-t-3xl"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            >
              <div className="flex justify-center pt-3 pb-1">
                <div className="h-1 w-10 rounded-full bg-hairline" />
              </div>
              <div className="flex justify-end px-5 pb-1">
                <button onClick={() => setPreviewGroup(null)} className="h-8 w-8 rounded-full bg-hairline flex items-center justify-center">
                  <X className="h-4 w-4 text-ink-2" />
                </button>
              </div>
              <div className="px-5 overflow-y-auto" style={{ maxHeight: '75vh', paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}>
                {previewGroup.banner_url && (
                  <div className="relative h-32 rounded-2xl overflow-hidden mb-4">
                    <img src={previewGroup.banner_url} alt={previewGroup.name} className="w-full h-full object-cover" />
                  </div>
                )}
                <h2 className="text-[18px] font-bold text-ink">{previewGroup.name}</h2>
                {previewGroup.city && (
                  <div className="flex items-center gap-1 mt-1">
                    <MapPin className="h-3.5 w-3.5 text-ink-2" />
                    <p className="text-[13px] text-ink-2">{previewGroup.city}</p>
                  </div>
                )}
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  {previewGroup.visibility === 'private' ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-ink-2 bg-hairline rounded-full px-2.5 py-1">
                      <Lock className="h-3 w-3" /> {t('people.group_private')}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-court-700 bg-court-50 rounded-full px-2.5 py-1">
                      <Globe className="h-3 w-3" /> {previewGroup.visibility === 'public' ? 'Public' : t('people.group_open')}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-ink-2 bg-hairline rounded-full px-2.5 py-1">
                    <Users className="h-3 w-3" /> {previewGroup.memberCount === 1 ? t('people.member', { count: 1 }) : t('people.members', { count: previewGroup.memberCount })}
                  </span>
                  {previewGroup.allow_ringers && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-warn bg-warn-50 rounded-full px-2.5 py-1">
                      <UserCheck className="h-3 w-3" /> {t('people.welcomes_ringers')}
                    </span>
                  )}
                </div>
                {previewGroup.description && (
                  <p className="text-[13px] text-ink-2 mt-4 leading-relaxed">{previewGroup.description}</p>
                )}
                <div className="mt-6 mb-4 space-y-3">
                  {previewGroup.membershipStatus === 'pending' ? (
                    <div className="w-full rounded-2xl bg-hairline py-3.5 text-center text-[14px] font-semibold text-ink-2">
                      {t('people.group_requested')}
                    </div>
                  ) : previewGroup.membershipStatus === 'pending_ringer' ? (
                    <div className="w-full rounded-2xl bg-warn-50 border border-warn py-3.5 text-center text-[14px] font-semibold text-warn">
                      {t('people.ringer_offer_pending')}
                    </div>
                  ) : previewGroup.membershipStatus === 'ringer' ? (
                    <div className="w-full rounded-2xl bg-warn-50 border border-warn py-3.5 text-center text-[14px] font-semibold text-warn">
                      {t('people.already_ringer')}
                    </div>
                  ) : (() => {
                    const isAutoJoin = previewGroup.visibility === 'open' || previewGroup.visibility === 'public' || previewGroup.auto_approve === true
                    const canOfferRinger = previewGroup.allow_ringers && (previewGroup.membershipStatus === 'none' || previewGroup.membershipStatus === 'ringer_declined')
                    return (
                      <>
                        <button
                          onClick={() => joinMutation.mutate(previewGroup.id)}
                          disabled={joiningId === previewGroup.id}
                          className="w-full rounded-2xl bg-court py-3.5 text-[14px] font-bold text-white active:scale-[0.98] transition-transform disabled:opacity-50"
                        >
                          {joiningId === previewGroup.id ? t('people.joining') : isAutoJoin ? t('people.join_btn') : t('people.request_to_join')}
                        </button>
                        {canOfferRinger && (
                          <button
                            onClick={() => ringerOfferMutation.mutate(previewGroup.id)}
                            disabled={ringerOfferMutation.isPending}
                            className="w-full rounded-2xl border border-warn bg-warn-50 py-3 text-[13px] font-semibold text-warn active:scale-[0.98] transition-transform disabled:opacity-50 flex items-center justify-center gap-2"
                          >
                            <UserCheck className="h-4 w-4" />
                            {ringerOfferMutation.isPending ? t('people.offering') : t('people.offer_ringer')}
                            <button type="button" onClick={(e) => { e.stopPropagation(); setShowRingerInfo(!showRingerInfo) }} className="ml-1">
                              <Info className="h-3.5 w-3.5 text-warn" />
                            </button>
                          </button>
                        )}
                        {showRingerInfo && (
                          <p className="text-[11px] text-ink-2 leading-relaxed px-1">
                            {t('people.ringer_info')}
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

      <CreateGroupSheet open={showCreateGroup} onClose={() => setShowCreateGroup(false)} />
    </div>
  )
}
