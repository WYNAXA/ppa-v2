import { useState, type ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, Share2, Plus, Check, MoreHorizontal, UserX, Shield, Star } from 'lucide-react'
import { toast } from 'sonner'
import imageCompression from 'browser-image-compression'
import { ReportButton } from '@/components/shared/ReportButton'
import { format, parseISO, startOfWeek, endOfWeek, addDays, endOfMonth } from 'date-fns'
import { useDateLocale, getDateLocale } from '@/lib/dateLocale'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useIsGroupAdmin } from '@/hooks/useIsGroupAdmin'
import { MatchCard, type MatchCardData } from '@/components/shared/MatchCard'
import { PlayerAvatar } from '@/components/shared/PlayerAvatar'
import { CreateEventSheet } from '@/components/community/CreateEventSheet'
import { CreateMatchSheet } from '@/components/play/CreateMatchSheet'

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = 'members' | 'matches' | 'polls' | 'events' | 'leagues' | 'settings'

interface Group {
  id: string
  name: string
  description: string | null
  city: string | null
  visibility: string | null
  admin_id: string
  invite_code: string | null
  rules: string | null
  max_members: number | null
  auto_approve: boolean | null
  created_at: string | null
  banner_url: string | null
}

interface Member {
  id: string
  name: string
  avatar_url: string | null
  ranking_points: number | null
  internal_ranking: number | null
  role: string
  memberStatus: string
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
        .select('id, name, description, city, visibility, admin_id, invite_code, rules, max_members, auto_approve, created_at, banner_url')
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
        .select('user_id, role, status')
        .eq('group_id', groupId)
        .in('status', ['approved', 'ringer'])
        .order('joined_at', { ascending: true })

      if (error) throw error
      if (!memberRows || memberRows.length === 0) return []

      const userIds = memberRows.map((m) => m.user_id)
      const { data: profileRows } = await supabase
        .from('profiles')
        .select('id, name, avatar_url, ranking_points, internal_ranking')
        .in('id', userIds)

      const profileMap = Object.fromEntries((profileRows ?? []).map((p) => [p.id, p]))

      return memberRows
        .map((m) => {
          const p = profileMap[m.user_id]
          if (!p) return null
          return {
            id:               p.id,
            name:             p.name,
            avatar_url:       p.avatar_url ?? null,
            ranking_points:   p.ranking_points ?? null,
            internal_ranking: p.internal_ranking ?? null,
            role:             m.role as string,
            memberStatus:     m.status as string,
          }
        })
        .filter(Boolean) as Member[]
    },
  })
}

interface PendingMember {
  id: string
  user_id: string
  name: string
  avatar_url: string | null
  internal_ranking: number | null
}

function usePendingMembers(groupId: string, isAdmin: boolean) {
  return useQuery({
    queryKey: ['pending-members', groupId],
    enabled: !!groupId && isAdmin,
    queryFn: async (): Promise<PendingMember[]> => {
      const { data: rows } = await supabase
        .from('group_members')
        .select('id, user_id')
        .eq('group_id', groupId)
        .eq('status', 'pending')

      if (!rows || rows.length === 0) return []
      const userIds = rows.map((r) => r.user_id)
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name, avatar_url, internal_ranking')
        .in('id', userIds)

      const pm = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]))
      return rows
        .map((r) => {
          const p = pm[r.user_id]
          if (!p) return null
          return { id: r.id, user_id: r.user_id, name: p.name, avatar_url: p.avatar_url ?? null, internal_ranking: p.internal_ranking ?? null }
        })
        .filter(Boolean) as PendingMember[]
    },
  })
}

function useGroupInviteNotification(groupId: string, userId: string) {
  return useQuery({
    queryKey: ['group-invite-notification', groupId, userId],
    enabled: !!groupId && !!userId,
    queryFn: async () => {
      // Check if user already a member
      const { data: existing } = await supabase
        .from('group_members')
        .select('status')
        .eq('group_id', groupId)
        .eq('user_id', userId)
        .maybeSingle()

      if (existing?.status === 'approved' || existing?.status === 'ringer') {
        // Already a member — silently mark any stray invite notifications as read
        await supabase
          .from('notifications')
          .update({ read: true })
          .eq('user_id', userId)
          .eq('type', 'group_invite')
          .eq('related_id', groupId)
          .eq('read', false)
        return null
      }

      // Check for pending invite notification
      const { data: notif } = await supabase
        .from('notifications')
        .select('id')
        .eq('user_id', userId)
        .eq('type', 'group_invite')
        .eq('related_id', groupId)
        .eq('read', false)
        .limit(1)
        .maybeSingle()

      return notif ? { notificationId: notif.id, alreadyRejected: existing?.status === 'rejected' } : null
    },
  })
}

function useGroupMatches(groupId: string) {
  const today = new Date().toISOString().split('T')[0]
  return useQuery({
    queryKey: ['group-matches', groupId, today],
    enabled: !!groupId && groupId.length > 0,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    queryFn: async (): Promise<MatchCardData[]> => {
      const { data: matches, error } = await supabase
        .from('matches')
        .select('*')
        .eq('group_id', groupId)
        .gte('match_date', today)
        .in('status', ['scheduled', 'pending', 'confirmed', 'open'])
        .order('match_date', { ascending: true })
        .order('match_time', { ascending: true })
        .limit(20)

      console.log('[GroupMatches:upcoming] groupId:', groupId, 'today:', today, 'count:', matches?.length, 'error:', error?.message)
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

function useGroupPastMatches(groupId: string) {
  return useQuery({
    queryKey: ['group-past-matches', groupId],
    enabled: !!groupId && groupId.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<MatchCardData[]> => {
      const today = new Date().toISOString().split('T')[0]
      const { data: matches, error } = await supabase
        .from('matches')
        .select('*')
        .eq('group_id', groupId)
        .lt('match_date', today)
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
    queryKey: ['polls', 'group', groupId],
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

function MembersTab({ members, isLoading, isAdmin, groupId, currentUserId }: {
  members: Member[]
  isLoading: boolean
  isAdmin: boolean
  groupId: string
  currentUserId: string
}) {
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const [memberFilter, setMemberFilter] = useState<'members' | 'ringers'>('members')
  const [menuMemberId, setMenuMemberId] = useState<string | null>(null)

  const memberAction = useMutation({
    mutationFn: async ({ action, memberId }: { action: 'make_admin' | 'make_ringer' | 'remove_ringer' | 'remove'; memberId: string }) => {
      if (action === 'make_admin') {
        await supabase.from('group_members').update({ role: 'admin' }).eq('group_id', groupId).eq('user_id', memberId)
        await supabase.from('groups').update({ admin_id: memberId }).eq('id', groupId)
      } else if (action === 'make_ringer') {
        await supabase.from('group_members').update({ status: 'ringer' }).eq('group_id', groupId).eq('user_id', memberId)
      } else if (action === 'remove_ringer') {
        await supabase.from('group_members').update({ status: 'approved' }).eq('group_id', groupId).eq('user_id', memberId)
      } else if (action === 'remove') {
        await supabase.from('group_members').delete().eq('group_id', groupId).eq('user_id', memberId)
      }
    },
    onSuccess: () => {
      if (navigator.vibrate) navigator.vibrate(10)
      setMenuMemberId(null)
      queryClient.invalidateQueries({ queryKey: ['group-members', groupId] })
    },
  })

  async function shareOrCopyInvite() {
    const url = `${window.location.origin}/community/groups/${groupId}`
    if (navigator.share) {
      try { await navigator.share({ title: t('group_detail.share_title'), url }) } catch { /* cancelled */ }
      return
    }
    const doWrite = () => { setCopied(true); setTimeout(() => setCopied(false), 2000) }
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(doWrite).catch(() => { fallbackCopy(url); doWrite() })
    } else { fallbackCopy(url); doWrite() }
  }

  function fallbackCopy(text: string) {
    const el = document.createElement('textarea')
    el.value = text; el.style.position = 'fixed'; el.style.opacity = '0'
    document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el)
  }

  if (isLoading) return <TabSkeleton />

  const filtered = members.filter((m) =>
    memberFilter === 'ringers' ? m.memberStatus === 'ringer' : m.memberStatus !== 'ringer'
  )
  const menuMember = members.find((m) => m.id === menuMemberId)

  return (
    <div>
      <button
        onClick={shareOrCopyInvite}
        className="w-full flex items-center justify-center gap-2 rounded-xl border border-teal-200 bg-teal-50 py-2.5 mb-4 text-[13px] font-semibold text-teal-700 transition-colors"
      >
        {copied ? <><Check className="h-4 w-4" /> {t('group_detail.copied')}</> : <><Share2 className="h-4 w-4" /> {t('group_detail.share_group')}</>}
      </button>

      {/* Member/Ringer filter */}
      <div className="flex bg-gray-100 rounded-xl p-1 gap-1 mb-4">
        {(['members', 'ringers'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setMemberFilter(f)}
            className={`flex-1 rounded-lg py-2 text-[13px] font-semibold transition-colors capitalize ${
              memberFilter === f ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
            }`}
          >
            {f === 'members' ? t('group_detail.members_count', { count: members.filter(m => m.memberStatus !== 'ringer').length }) : t('group_detail.ringers_count', { count: members.filter(m => m.memberStatus === 'ringer').length })}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyTab message={memberFilter === 'ringers' ? t('group_detail.no_ringers_yet') : t('group_detail.no_members_yet')} />
      ) : (
        <div className="space-y-2">
          {filtered.map((m) => (
            <div key={m.id} className="flex items-center gap-3 rounded-xl bg-gray-50 px-3 py-2.5">
              <PlayerAvatar name={m.name} avatarUrl={m.avatar_url} size="md" />
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-semibold text-gray-900 truncate">{m.name}</p>
                {m.ranking_points != null && <p className="text-[11px] text-gray-400">{m.ranking_points} pts</p>}
              </div>
              {m.role === 'admin' && (
                <span className="rounded-full bg-teal-50 border border-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-600">{t('group_detail.badge_admin')}</span>
              )}
              {m.memberStatus === 'ringer' && (
                <span className="rounded-full bg-orange-50 border border-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-500">{t('group_detail.badge_ringer')}</span>
              )}
              {isAdmin && m.id !== currentUserId && (
                <button
                  onClick={() => setMenuMemberId(m.id)}
                  className="h-7 w-7 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 flex-shrink-0"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Member action sheet */}
      <AnimatePresence>
        {menuMemberId && menuMember && (
          <>
            <motion.div
              className="fixed inset-0 z-[55] bg-black/40"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setMenuMemberId(null)}
            />
            <motion.div
              className="fixed bottom-0 left-0 right-0 z-[60] bg-white rounded-t-3xl px-5 pt-5"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}
            >
              <div className="flex items-center gap-3 mb-4 pb-3 border-b border-gray-100">
                <PlayerAvatar name={menuMember.name} avatarUrl={menuMember.avatar_url} size="md" />
                <div>
                  <p className="text-[15px] font-bold text-gray-900">{menuMember.name}</p>
                  <p className="text-[12px] text-gray-400 capitalize">{menuMember.memberStatus}</p>
                </div>
              </div>
              <div className="space-y-1">
                {menuMember.role !== 'admin' && (
                  <button
                    onClick={() => memberAction.mutate({ action: 'make_admin', memberId: menuMemberId })}
                    disabled={memberAction.isPending}
                    className="w-full flex items-center gap-3 rounded-xl px-3 py-3 text-[14px] font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    <Shield className="h-4 w-4 text-teal-500" />
                    {t('group_detail.make_admin')}
                  </button>
                )}
                {menuMember.memberStatus === 'approved' ? (
                  <button
                    onClick={() => memberAction.mutate({ action: 'make_ringer', memberId: menuMemberId })}
                    disabled={memberAction.isPending}
                    className="w-full flex items-center gap-3 rounded-xl px-3 py-3 text-[14px] font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    <Star className="h-4 w-4 text-orange-400" />
                    {t('group_detail.mark_as_ringer')}
                  </button>
                ) : (
                  <button
                    onClick={() => memberAction.mutate({ action: 'remove_ringer', memberId: menuMemberId })}
                    disabled={memberAction.isPending}
                    className="w-full flex items-center gap-3 rounded-xl px-3 py-3 text-[14px] font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    <Star className="h-4 w-4 text-gray-400" />
                    {t('group_detail.promote_to_member')}
                  </button>
                )}
                <button
                  onClick={() => memberAction.mutate({ action: 'remove', memberId: menuMemberId })}
                  disabled={memberAction.isPending}
                  className="w-full flex items-center gap-3 rounded-xl px-3 py-3 text-[14px] font-semibold text-red-500 hover:bg-red-50"
                >
                  <UserX className="h-4 w-4" />
                  {t('group_detail.remove_from_group')}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Tab: Matches ──────────────────────────────────────────────────────────────

type PastFilter = 'all' | 'competitive' | 'friendly' | 'this_month'

function MatchesTab({ upcoming, past, isLoading, userId, onCreateMatch }: {
  upcoming: MatchCardData[]
  past: MatchCardData[]
  isLoading: boolean
  userId: string
  onCreateMatch: () => void
}) {
  const locale = useDateLocale()
  const { t } = useTranslation()
  const [view, setView] = useState<'upcoming' | 'past'>('upcoming')
  const [pastFilter, setPastFilter] = useState<PastFilter>('all')
  const [weekFilter, setWeekFilter] = useState<'this_week' | 'next_week' | 'this_month' | 'all'>('this_week')
  const [needsRingersOnly, setNeedsRingersOnly] = useState(false)
  const monthStart = format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd', { locale })

  const filteredPast = past.filter((m) => {
    if (pastFilter === 'competitive') return m.match_type === 'competitive'
    if (pastFilter === 'friendly') return m.match_type === 'friendly'
    if (pastFilter === 'this_month') return m.match_date >= monthStart
    return true
  })

  // Week filter for upcoming matches
  const now = new Date()
  const thisWeekStart = format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd', { locale })
  const thisWeekEnd = format(endOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd', { locale })
  const nextWeekStart = format(startOfWeek(addDays(now, 7), { weekStartsOn: 1 }), 'yyyy-MM-dd', { locale })
  const nextWeekEnd = format(endOfWeek(addDays(now, 7), { weekStartsOn: 1 }), 'yyyy-MM-dd', { locale })
  const thisMonthEnd = format(endOfMonth(now), 'yyyy-MM-dd', { locale })

  let filteredUpcoming = upcoming
  if (weekFilter === 'this_week') filteredUpcoming = upcoming.filter(m => m.match_date >= thisWeekStart && m.match_date <= thisWeekEnd)
  else if (weekFilter === 'next_week') filteredUpcoming = upcoming.filter(m => m.match_date >= nextWeekStart && m.match_date <= nextWeekEnd)
  else if (weekFilter === 'this_month') filteredUpcoming = upcoming.filter(m => m.match_date <= thisMonthEnd)

  if (needsRingersOnly) filteredUpcoming = filteredUpcoming.filter(m => (m.player_ids?.length ?? 0) < 4)

  const filtered = view === 'upcoming' ? filteredUpcoming : filteredPast

  // Personal stats in this group (only matches user participated in)
  const myPastMatches = past.filter(m => m.player_ids.includes(userId))
  const pastCount = myPastMatches.length
  const winsCount = myPastMatches.filter(m => m.didWin === true).length

  if (isLoading) return <TabSkeleton />

  return (
    <div>
      <button
        onClick={onCreateMatch}
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#009688] py-2.5 mb-4 text-[13px] font-bold text-white"
      >
        <Plus className="h-4 w-4" />
        {t('group_detail.create_group_match')}
      </button>

      {/* Upcoming / Past toggle */}
      <div className="flex bg-gray-100 rounded-xl p-1 gap-1 mb-3">
        {(['upcoming', 'past'] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`flex-1 rounded-lg py-2 text-[13px] font-semibold transition-colors capitalize ${
              view === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
            }`}
          >
            {v === 'upcoming' ? t('group_detail.upcoming_count', { count: upcoming.length }) : t('group_detail.past_count', { count: past.length })}
          </button>
        ))}
      </div>

      {/* Upcoming filter chips */}
      {view === 'upcoming' && upcoming.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar mb-3">
          {([
            { key: 'this_week' as const, label: t('group_detail.chip_this_week') },
            { key: 'next_week' as const, label: t('group_detail.chip_next_week') },
            { key: 'this_month' as const, label: t('group_detail.chip_this_month') },
            { key: 'all' as const, label: t('group_detail.chip_all') },
          ]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setWeekFilter(key)}
              className={`flex-shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${
                weekFilter === key ? 'bg-[#009688] border-[#009688] text-white' : 'border-gray-200 text-gray-500 bg-white'
              }`}
            >
              {label}
            </button>
          ))}
          <button
            onClick={() => setNeedsRingersOnly(v => !v)}
            className={`flex-shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${
              needsRingersOnly ? 'bg-orange-500 border-orange-500 text-white' : 'border-gray-200 text-gray-500 bg-white'
            }`}
          >
            {t('group_detail.needs_ringers')}
          </button>
        </div>
      )}

      {/* Past filter pills */}
      {view === 'past' && past.length > 0 && (
        <>
          <div className="flex gap-2 overflow-x-auto no-scrollbar mb-3">
            {([
              { id: 'all' as PastFilter, label: t('group_detail.chip_all') },
              { id: 'competitive' as PastFilter, label: t('group_detail.chip_competitive') },
              { id: 'friendly' as PastFilter, label: t('group_detail.chip_friendly') },
              { id: 'this_month' as PastFilter, label: t('group_detail.chip_this_month') },
            ]).map((f) => (
              <button
                key={f.id}
                onClick={() => setPastFilter(f.id)}
                className={`flex-shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${
                  pastFilter === f.id ? 'bg-[#009688] border-[#009688] text-white' : 'border-gray-200 text-gray-500 bg-white'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          {/* Stats summary */}
          {pastCount > 0 && (
          <div className="rounded-xl bg-gray-50 border border-gray-100 px-3 py-2 mb-3">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">{t('group_detail.your_record_in_group')}</p>
            <div className="flex gap-4">
              <span className="text-[13px] font-bold text-gray-900">{t('group_detail.played', { count: pastCount })}</span>
              <span className="text-[13px] font-bold text-green-700">{winsCount}W</span>
              <span className="text-[13px] font-bold text-red-500">{pastCount - winsCount}L</span>
              <span className="text-[13px] font-bold text-gray-500">{pastCount > 0 ? Math.round((winsCount / pastCount) * 100) : 0}%</span>
            </div>
          </div>
          )}
        </>
      )}

      {filtered.length === 0 ? (
        <EmptyTab
          message={view === 'upcoming' ? t('group_detail.no_upcoming_matches') : t('group_detail.no_past_matches')}
          sub={view === 'upcoming' ? t('group_detail.create_one_above') : undefined}
        />
      ) : (
        <div className="space-y-2.5">
          {filtered.map((match, i) => {
            const isInMatch = match.player_ids.includes(userId)
            return (
              <div key={match.id} className={!isInMatch ? 'opacity-75' : ''}>
                {!isInMatch && (
                  <p className="text-[10px] text-gray-400 mb-0.5 pl-1">{t('group_detail.not_in_this_match')}</p>
                )}
                <MatchCard match={match} currentUserId={userId} action="view" index={i} />
              </div>
            )
          })}
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
  const { t } = useTranslation()
  const now = new Date()
  const isStillOpen = (p: Poll) => p.status === 'open' && (p.closes_at ? new Date(p.closes_at) > now : true)
  const active   = polls.filter(isStillOpen)
  const past     = polls.filter((p) => !isStillOpen(p))

  if (isLoading) return <TabSkeleton />

  return (
    <div>
      <button
        onClick={() => navigate(`/play/availability/create?group_id=${groupId}`)}
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#009688] py-2.5 mb-4 text-[13px] font-bold text-white"
      >
        <Plus className="h-4 w-4" />
        {t('group_detail.create_poll')}
      </button>

      {polls.length === 0 ? (
        <EmptyTab message={t('group_detail.no_polls_yet')} sub={t('group_detail.no_polls_sub')} />
      ) : (
        <>
          {active.length > 0 && (
            <div className="mb-4">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2">{t('group_detail.active')}</p>
              <div className="space-y-2">
                {active.map((poll) => <PollCard key={poll.id} poll={poll} />)}
              </div>
            </div>
          )}
          {past.length > 0 && (
            <div>
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2">{t('group_detail.past')}</p>
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
  const { t } = useTranslation()
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
              {t('group_detail.closes')} {format(parseISO(poll.closes_at), 'EEE d MMM, HH:mm', { locale: getDateLocale() })}
            </p>
          )}
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold flex-shrink-0 mt-0.5 ${
          poll.status === 'open'
            ? 'bg-green-50 text-green-600 border border-green-100'
            : 'bg-gray-100 text-gray-500'
        }`}>
          {poll.status === 'open' ? t('group_detail.poll_open') : t('group_detail.poll_closed')}
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
  const locale = useDateLocale()
  const { t } = useTranslation()
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
          {t('group_detail.create_event')}
        </button>
      )}

      {events.length === 0 ? (
        <EmptyTab message={t('group_detail.no_events_yet')} sub={isAdmin ? t('group_detail.create_one_above') : t('group_detail.check_back_later')} />
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
                {format(parseISO(event.start_time), 'EEE d MMM · HH:mm', { locale })}
                {event.end_time && ` – ${format(parseISO(event.end_time), 'HH:mm', { locale })}`}
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
  const { t } = useTranslation()

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
        {t('group_detail.create_league')}
      </button>

      {leagues.length === 0 ? (
        <EmptyTab message={t('group_detail.no_leagues_yet')} sub={t('group_detail.no_leagues_sub')} />
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

// ── Tab: Settings / Admin ─────────────────────────────────────────────────────

type AdminSection = 'overview' | 'members' | 'announce' | 'settings'

function SettingsTab({ group, members, isAdmin, currentUserId }: {
  group: Group
  members: Member[]
  isAdmin: boolean
  currentUserId: string
}) {
  const navigate    = useNavigate()
  const queryClient = useQueryClient()
  const locale = useDateLocale()
  const { t } = useTranslation()
  const [adminSection, setAdminSection] = useState<AdminSection>('overview')
  const [confirmLeave, setConfirmLeave] = useState(false)

  // Settings form state
  const [name, setName]             = useState(group.name)
  const [description, setDescription] = useState(group.description ?? '')
  const [city, setCity]             = useState(group.city ?? '')
  const [visibility, setVisibility] = useState(group.visibility ?? 'open')
  const [rules, setRules]           = useState(group.rules ?? '')
  const [maxMembers, setMaxMembers] = useState(group.max_members?.toString() ?? '')
  const [autoApprove, setAutoApprove] = useState(group.auto_approve ?? false)
  const [saving, setSaving]         = useState(false)
  const [saved, setSaved]           = useState(false)
  const [uploading, setUploading]   = useState(false)

  async function handleBannerUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error(t('group_detail.banner_invalid_type'))
      return
    }
    setUploading(true)
    try {
      const compressed = await imageCompression(file, {
        maxSizeMB: 2,
        maxWidthOrHeight: 2000,
        useWebWorker: true,
        fileType: 'image/jpeg',
      })
      const path = `${group.id}/banner.jpg`
      const { error: uploadError } = await supabase.storage
        .from('group-banners')
        .upload(path, compressed, { upsert: true, cacheControl: '3600', contentType: 'image/jpeg' })
      if (uploadError) throw uploadError
      const { data: { publicUrl } } = supabase.storage.from('group-banners').getPublicUrl(path)
      const { error: updateError } = await supabase.from('groups').update({ banner_url: publicUrl }).eq('id', group.id)
      if (updateError) throw updateError
      queryClient.invalidateQueries({ queryKey: ['group', group.id] })
      toast.success(t('group_detail.banner_uploaded'))
    } catch (err) {
      console.error('[Banner] upload error:', err)
      toast.error(t('group_detail.banner_upload_failed'))
    } finally {
      setUploading(false)
    }
  }

  // Announcement form state
  const [announcement, setAnnouncement] = useState('')
  const [sending, setSending]       = useState(false)
  const [sent, setSent]             = useState(false)
  const [sentCount, setSentCount]   = useState(0)

  const { data: pendingMembers = [], isLoading: loadingPending } = usePendingMembers(group.id, isAdmin)

  const approvedMembers = members.filter(m => m.memberStatus === 'approved')
  const avgElo = approvedMembers.length > 0
    ? Math.round(approvedMembers.reduce((s, m) => s + (m.internal_ranking ?? 1500), 0) / approvedMembers.length)
    : null

  async function saveSettings() {
    setSaving(true)
    await supabase.from('groups').update({
      name,
      description: description.trim() || null,
      city: city.trim() || null,
      visibility,
      rules: rules.trim() || null,
      max_members: maxMembers ? parseInt(maxMembers, 10) : null,
      auto_approve: autoApprove,
    }).eq('id', group.id)
    setSaving(false)
    setSaved(true)
    if (navigator.vibrate) navigator.vibrate(10)
    setTimeout(() => setSaved(false), 2000)
    queryClient.invalidateQueries({ queryKey: ['group', group.id] })
  }

  async function leaveGroup() {
    await supabase.from('group_members').delete().eq('group_id', group.id).eq('user_id', currentUserId)
    queryClient.invalidateQueries({ queryKey: ['group-members', group.id] })
    navigate('/community')
  }

  async function approveMember(userId: string) {
    await supabase.from('group_members').update({ status: 'approved' }).eq('group_id', group.id).eq('user_id', userId)
    await supabase.from('notifications').insert({
      user_id: userId,
      type: 'group_join',
      title: group.name,
      message: `Your request to join ${group.name} was approved.`,
      read: false,
    })
    queryClient.invalidateQueries({ queryKey: ['pending-members', group.id] })
    queryClient.invalidateQueries({ queryKey: ['group-members', group.id] })
  }

  async function declineMember(userId: string) {
    await supabase.from('group_members').update({ status: 'rejected' }).eq('group_id', group.id).eq('user_id', userId)
    queryClient.invalidateQueries({ queryKey: ['pending-members', group.id] })
  }

  async function removeMember(memberId: string) {
    await supabase.from('group_members').delete().eq('group_id', group.id).eq('user_id', memberId)
    queryClient.invalidateQueries({ queryKey: ['group-members', group.id] })
  }

  async function toggleRole(member: Member) {
    const newRole = member.role === 'admin' ? 'member' : 'admin'
    await supabase.from('group_members').update({ role: newRole }).eq('group_id', group.id).eq('user_id', member.id)
    queryClient.invalidateQueries({ queryKey: ['group-members', group.id] })
  }

  async function sendAnnouncement() {
    if (!announcement.trim()) return
    setSending(true)
    const { data: allMembers } = await supabase
      .from('group_members')
      .select('user_id')
      .eq('group_id', group.id)
      .eq('status', 'approved')
    const notifications = (allMembers ?? [])
      .filter((m) => m.user_id !== currentUserId)
      .map((m) => ({
        user_id: m.user_id,
        type: 'announcement',
        title: group.name,
        message: announcement.trim(),
        read: false,
      }))
    if (notifications.length > 0) {
      const { error: notifErr } = await supabase.from('notifications').insert(notifications)
      if (notifErr) console.error('[Announce] notification error:', notifErr)
    }
    setSending(false)
    setSent(true)
    setSentCount(notifications.length)
    setAnnouncement('')
    setTimeout(() => setSent(false), 5000)
  }

  return (
    <div className="space-y-4">
      {isAdmin && (
        <>
          {/* Admin sub-nav */}
          <div className="grid grid-cols-4 gap-1">
            {(['overview', 'members', 'announce', 'settings'] as AdminSection[]).map((s) => (
              <button
                key={s}
                onClick={() => setAdminSection(s)}
                className={`text-[11px] font-semibold py-2 rounded-xl capitalize transition-colors ${
                  adminSection === s
                    ? 'bg-[#009688] text-white'
                    : 'bg-gray-100 text-gray-500'
                }`}
              >
                {s === 'overview' ? t('group_detail.admin_overview') : s === 'members' ? t('group_detail.admin_members') : s === 'announce' ? t('group_detail.admin_post') : t('group_detail.admin_settings')}
              </button>
            ))}
          </div>

          {/* OVERVIEW */}
          {adminSection === 'overview' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: t('group_detail.stat_total_members'), value: approvedMembers.length },
                  { label: t('group_detail.stat_pending_requests'), value: pendingMembers.length },
                  { label: t('group_detail.stat_avg_elo'), value: avgElo?.toLocaleString() ?? '—' },
                  { label: t('group_detail.stat_created'), value: group.created_at ? format(parseISO(group.created_at), 'd MMM yyyy', { locale }) : '—' },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                    <p className="text-[11px] text-gray-400 font-medium">{label}</p>
                    <p className="text-[20px] font-black text-gray-900 mt-0.5">{value}</p>
                  </div>
                ))}
              </div>
              {pendingMembers.length > 0 && (
                <button
                  onClick={() => setAdminSection('members')}
                  className="w-full rounded-xl bg-amber-50 border border-amber-100 py-3 text-[13px] font-bold text-amber-700"
                >
                  {pendingMembers.length === 1 ? t('group_detail.pending_review', { count: pendingMembers.length }) : t('group_detail.pending_review_plural', { count: pendingMembers.length })}
                </button>
              )}
            </div>
          )}

          {/* MEMBERS */}
          {adminSection === 'members' && (
            <div className="space-y-3">
              {/* Pending requests */}
              {(loadingPending || pendingMembers.length > 0) && (
                <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                  <p className="text-[12px] font-bold text-amber-700 uppercase tracking-wide mb-3">
                    {t('group_detail.pending_requests_label')} {pendingMembers.length > 0 ? `(${pendingMembers.length})` : ''}
                  </p>
                  {loadingPending ? (
                    <div className="h-10 bg-amber-100 rounded-xl animate-pulse" />
                  ) : (
                    <div className="space-y-2">
                      {pendingMembers.map((pm) => (
                        <div key={pm.id} className="flex items-center gap-3 bg-white rounded-xl px-3 py-2.5">
                          <PlayerAvatar name={pm.name} avatarUrl={pm.avatar_url} size="sm" />
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-semibold text-gray-800 truncate">{pm.name}</p>
                            {pm.internal_ranking != null && (
                              <p className="text-[11px] text-gray-400">{pm.internal_ranking} ELO</p>
                            )}
                          </div>
                          <button
                            onClick={() => approveMember(pm.user_id)}
                            className="rounded-lg bg-[#009688] px-3 py-1.5 text-[11px] font-bold text-white"
                          >
                            {t('group_detail.approve')}
                          </button>
                          <button
                            onClick={() => declineMember(pm.user_id)}
                            className="rounded-lg border border-red-200 px-3 py-1.5 text-[11px] font-bold text-red-500"
                          >
                            {t('group_detail.decline')}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Approved members */}
              <div className="rounded-2xl border border-gray-100 p-4">
                <p className="text-[12px] font-bold text-gray-400 uppercase tracking-wide mb-3">
                  {t('group_detail.members_label', { count: approvedMembers.length })}
                </p>
                <div className="space-y-2">
                  {approvedMembers.map((m) => (
                    <div key={m.id} className="flex items-center gap-3 py-1.5">
                      <PlayerAvatar name={m.name} avatarUrl={m.avatar_url} size="sm" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-[13px] font-semibold text-gray-800 truncate">{m.name}</p>
                          {m.id === currentUserId && (
                            <span className="text-[10px] text-gray-400">(you)</span>
                          )}
                          {m.role === 'admin' && (
                            <span className="text-[10px] font-bold text-teal-600 bg-teal-50 rounded-full px-1.5 py-0.5">{t('group_detail.badge_admin')}</span>
                          )}
                        </div>
                        {m.internal_ranking != null && (
                          <p className="text-[11px] text-gray-400">{m.internal_ranking.toLocaleString()} ELO</p>
                        )}
                      </div>
                      {m.id !== currentUserId && (
                        <div className="flex gap-1.5 flex-shrink-0">
                          <button
                            onClick={() => toggleRole(m)}
                            className="rounded-lg border border-gray-200 px-2.5 py-1 text-[10px] font-semibold text-gray-600"
                          >
                            {m.role === 'admin' ? t('group_detail.role_demote') : t('group_detail.role_make_admin')}
                          </button>
                          <button
                            onClick={() => removeMember(m.id)}
                            className="rounded-lg border border-red-200 px-2.5 py-1 text-[10px] font-semibold text-red-500"
                          >
                            {t('group_detail.remove')}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ANNOUNCE */}
          {adminSection === 'announce' && (
            <div className="rounded-2xl border border-gray-100 p-4 space-y-3">
              <p className="text-[12px] font-bold text-gray-400 uppercase tracking-wide">{t('group_detail.send_announcement')}</p>
              <p className="text-[12px] text-gray-400">{t('group_detail.announcement_subtitle', { count: approvedMembers.length })}</p>
              <textarea
                value={announcement}
                onChange={(e) => setAnnouncement(e.target.value)}
                placeholder={t('group_detail.announcement_placeholder')}
                rows={4}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-[13px] text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#009688] resize-none"
              />
              <button
                onClick={sendAnnouncement}
                disabled={sending || !announcement.trim()}
                className="w-full rounded-xl bg-[#009688] py-3 text-[13px] font-bold text-white disabled:opacity-40"
              >
                {sent ? t('group_detail.sent_to_n_members', { count: sentCount }) : sending ? t('group_detail.sending') : t('group_detail.send_to_n_members', { count: approvedMembers.length })}
              </button>
            </div>
          )}

          {/* SETTINGS */}
          {adminSection === 'settings' && (
            <div className="rounded-2xl border border-gray-100 p-4 space-y-3">
              <p className="text-[12px] font-bold text-gray-400 uppercase tracking-wide">{t('group_detail.group_settings')}</p>

              {/* Banner upload */}
              <div>
                <label className="text-[12px] text-gray-500 font-medium mb-1 block">{t('group_detail.group_banner')}</label>
                {group.banner_url && (
                  <img src={group.banner_url} alt="Banner" className="w-full h-24 object-cover rounded-xl mb-2" />
                )}
                <label className={`flex items-center justify-center gap-2 w-full rounded-xl border border-dashed border-gray-300 py-2.5 text-[12px] font-semibold text-gray-500 cursor-pointer hover:border-teal-400 hover:text-teal-600 transition-colors ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                  <input type="file" accept="image/*" className="hidden" onChange={handleBannerUpload} />
                  {uploading ? t('group_detail.uploading') : t('group_detail.upload_banner')}
                </label>
              </div>

              <div>
                <label className="text-[12px] text-gray-500 font-medium mb-1 block">{t('group_detail.name_label')}</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-[14px] text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#009688]"
                />
              </div>

              <div>
                <label className="text-[12px] text-gray-500 font-medium mb-1 block">{t('group_detail.description_label')}</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder={t('group_detail.description_placeholder')}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-[13px] text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#009688] resize-none"
                />
              </div>

              <div>
                <label className="text-[12px] text-gray-500 font-medium mb-1 block">{t('group_detail.city_label')}</label>
                <input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder={t('group_detail.city_placeholder')}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-[14px] text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#009688]"
                />
              </div>

              <div>
                <label className="text-[12px] text-gray-500 font-medium mb-1 block">{t('group_detail.visibility_label')}</label>
                <div className="flex gap-2">
                  {(['open', 'private'] as const).map((v) => (
                    <button
                      key={v}
                      onClick={() => setVisibility(v)}
                      className={`flex-1 rounded-xl border py-2 text-[12px] font-semibold capitalize transition-colors ${
                        visibility === v
                          ? 'border-teal-300 bg-teal-50 text-teal-700'
                          : 'border-gray-200 text-gray-500'
                      }`}
                    >
                      {v === 'open' ? t('group_detail.visibility_open') : t('group_detail.visibility_private')}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between py-1">
                <div>
                  <p className="text-[13px] font-medium text-gray-700">{t('group_detail.auto_approve_label')}</p>
                  <p className="text-[11px] text-gray-400">
                    {visibility === 'private' ? t('group_detail.auto_approve_help_private') : t('group_detail.auto_approve_help_open')}
                  </p>
                </div>
                <button
                  onClick={() => visibility !== 'private' && setAutoApprove(v => !v)}
                  disabled={visibility === 'private'}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    visibility === 'private' ? 'bg-gray-100 opacity-50' : autoApprove ? 'bg-[#009688]' : 'bg-gray-200'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    autoApprove ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>

              <div>
                <label className="text-[12px] text-gray-500 font-medium mb-1 block">{t('group_detail.max_members_label')}</label>
                <input
                  type="number"
                  value={maxMembers}
                  onChange={(e) => setMaxMembers(e.target.value)}
                  placeholder={t('group_detail.max_members_placeholder')}
                  min="1"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-[14px] text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#009688]"
                />
              </div>

              <div>
                <label className="text-[12px] text-gray-500 font-medium mb-1 block">{t('group_detail.group_rules_label')}</label>
                <textarea
                  value={rules}
                  onChange={(e) => setRules(e.target.value)}
                  rows={3}
                  placeholder={t('group_detail.group_rules_placeholder')}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-[13px] text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#009688] resize-none"
                />
              </div>

              <button
                onClick={saveSettings}
                disabled={saving}
                className="w-full rounded-xl bg-[#009688] py-3 text-[14px] font-bold text-white disabled:opacity-60"
              >
                {saved ? t('group_detail.saved') : saving ? t('group_detail.saving') : t('group_detail.save_changes')}
              </button>
            </div>
          )}
        </>
      )}

      {/* Danger Zone — visible to all members */}
      <div className="rounded-2xl border border-red-100 p-4">
        <p className="text-[12px] font-bold text-gray-400 uppercase tracking-wide mb-3">{t('group_detail.danger_zone')}</p>
        <button
          onClick={() => setConfirmLeave(true)}
          className="w-full rounded-xl border border-red-200 py-3 text-[14px] font-semibold text-red-500"
        >
          {t('group_detail.leave_group_btn')}
        </button>
      </div>

      <AnimatePresence>
        {confirmLeave && (
          <>
            <motion.div
              className="fixed inset-0 z-[55] bg-black/40"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setConfirmLeave(false)}
            />
            <motion.div
              className="fixed bottom-0 left-0 right-0 z-[60] bg-white rounded-t-3xl px-5 pt-6"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              style={{ paddingBottom: 'calc(32px + env(safe-area-inset-bottom))' }}
            >
              <p className="text-[16px] font-bold text-gray-900 text-center mb-2">{t('group_detail.leave_group')}</p>
              <p className="text-[13px] text-gray-500 text-center mb-6">{t('group_detail.leave_group_help')}</p>
              <div className="flex gap-3">
                <button onClick={() => setConfirmLeave(false)} className="flex-1 rounded-2xl border border-gray-200 py-3 text-[14px] font-semibold text-gray-700">{t('group_detail.cancel')}</button>
                <button onClick={leaveGroup} className="flex-1 rounded-2xl bg-red-500 py-3 text-[14px] font-bold text-white">{t('group_detail.leave')}</button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
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
  const { t } = useTranslation()

  // Store active tab in URL so browser back restores correct tab
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = (searchParams.get('tab') ?? 'members') as Tab
  function setActiveTab(tab: Tab) {
    setSearchParams({ tab }, { replace: true })
  }


  // BUG 4: CreateMatchSheet state — open inline instead of navigating away
  const [createMatchOpen, setCreateMatchOpen] = useState(false)

  const { data: group,   isLoading: loadingGroup   } = useGroup(groupId)
  const { data: members, isLoading: loadingMembers } = useGroupMembers(groupId)
  const { data: upcomingMatches, isLoading: loadingUpcoming } = useGroupMatches(groupId)
  const { data: pastMatches, isLoading: loadingPast } = useGroupPastMatches(groupId)
  const loadingMatches = loadingUpcoming || loadingPast
  const { data: polls,   isLoading: loadingPolls   } = useGroupPolls(groupId)
  const { data: events,  isLoading: loadingEvents  } = useGroupEvents(groupId)
  const { data: leagues, isLoading: loadingLeagues } = useGroupLeagues(groupId)

  const { isAdmin } = useIsGroupAdmin(groupId)
  const memberCount = (members ?? []).filter(m => m.memberStatus !== 'ringer').length
  const queryClient = useQueryClient()
  const { data: inviteData } = useGroupInviteNotification(groupId, userId)

  const acceptInviteMutation = useMutation({
    mutationFn: async () => {
      if (!inviteData) throw new Error('No invite')
      if (inviteData.alreadyRejected) throw new Error('rejected')
      const { error } = await supabase.from('group_members').insert({
        group_id: groupId, user_id: userId, role: 'member', status: 'approved',
      })
      if (error) {
        if (error.code === '23505') throw new Error('rejected')
        throw error
      }
      await supabase.from('notifications').update({ read: true }).eq('id', inviteData.notificationId)
    },
    onSuccess: () => {
      toast.success(t('group_detail.welcome_to_group', { name: group?.name }))
      queryClient.invalidateQueries({ queryKey: ['group-invite-notification', groupId, userId] })
      queryClient.invalidateQueries({ queryKey: ['group-members', groupId] })
      queryClient.invalidateQueries({ queryKey: ['my-groups', userId] })
    },
    onError: (err: Error) => {
      if (err.message === 'rejected') {
        toast.error(t('community.join_declined_contact_admin'))
      } else {
        toast.error(t('group_detail.accept_invite_failed'))
      }
    },
  })

  const declineInviteMutation = useMutation({
    mutationFn: async () => {
      if (!inviteData) throw new Error('No invite')
      await supabase.from('notifications').update({ read: true }).eq('id', inviteData.notificationId)
    },
    onSuccess: () => {
      toast(t('group_detail.invite_declined'))
      queryClient.invalidateQueries({ queryKey: ['group-invite-notification', groupId, userId] })
    },
  })

  const TABS: Array<{ id: Tab; label: string }> = [
    { id: 'members',  label: t('group_detail.tab_members')  },
    { id: 'matches',  label: t('group_detail.tab_matches')  },
    { id: 'polls',    label: t('group_detail.tab_polls')    },
    { id: 'events',   label: t('group_detail.tab_events')   },
    { id: 'leagues',  label: t('group_detail.tab_leagues')  },
    ...(isAdmin ? [{ id: 'settings' as Tab, label: t('group_detail.tab_settings') }] : []),
  ]

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
        <p className="text-[14px] font-semibold text-gray-500">{t('group_detail.group_not_found')}</p>
        <button onClick={() => navigate('/community')} className="mt-4 text-[13px] text-teal-600 font-semibold">
          {t('group_detail.back_to_community')}
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-white">
      {/* Banner */}
      {group.banner_url && (
        <div className="relative h-36 overflow-hidden">
          <img src={group.banner_url} alt={group.name} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/30" />
        </div>
      )}
      {/* Header */}
      <div className={`px-5 pb-4 ${group.banner_url ? 'pt-4' : 'pt-14'}`}>
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
                  {t('group_detail.badge_admin')}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex justify-end">
          <ReportButton context="group" contextId={groupId} />
        </div>
      </div>

      {/* Invite banner */}
      {inviteData && !acceptInviteMutation.isSuccess && !declineInviteMutation.isSuccess && (
        <div className="mx-5 mb-3 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3">
          <p className="text-[13px] font-semibold text-gray-800 mb-2">
            {t('group_detail.invite_banner', { name: group.name })}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => acceptInviteMutation.mutate()}
              disabled={acceptInviteMutation.isPending || declineInviteMutation.isPending}
              className="flex-1 rounded-xl bg-[#009688] py-2 text-[13px] font-bold text-white active:scale-95 transition-transform disabled:opacity-50"
            >
              {acceptInviteMutation.isPending ? t('group_detail.accepting') : t('group_detail.accept_invite')}
            </button>
            <button
              onClick={() => declineInviteMutation.mutate()}
              disabled={acceptInviteMutation.isPending || declineInviteMutation.isPending}
              className="flex-1 rounded-xl bg-gray-100 py-2 text-[13px] font-semibold text-gray-600 active:scale-95 transition-transform disabled:opacity-50"
            >
              {t('group_detail.decline_invite')}
            </button>
          </div>
        </div>
      )}

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
              currentUserId={userId}
            />
          )}
          {activeTab === 'matches' && (
            <MatchesTab
              upcoming={upcomingMatches ?? []}
              past={pastMatches ?? []}
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
          {activeTab === 'settings' && isAdmin && (
            <SettingsTab
              group={group}
              members={members ?? []}
              isAdmin={isAdmin}
              currentUserId={userId}
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
