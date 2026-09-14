import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, Search, Users, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useMyGroups } from '@/hooks/useSocial'
import { useDiscoverList, useDiscoverRadius } from '@/hooks/useDiscoverList'
import { CreateGroupSheet } from '@/components/people/CreateGroupSheet'
import { goBack } from '@/lib/navigation'
import { formatDistance } from '@/lib/travelUtils'

/**
 * §3.4 Groups — tile's number, rendered.
 *
 * Fix class (a) for §0.3: join action is on the row and on GroupDetail.
 * Not (b) — the modal was unreachable, not mis-implemented.
 * Fix class (a) for §0.4: dead chips deleted (never touched filteredGroups).
 * Fix class (a) for §0.7: My Groups is an outside-radius strip, not a
 * duplicate section.
 */

type Filter = 'all' | 'joinable' | 'ringers' | 'most_members'

export function AllGroupsPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const userId = profile?.id ?? ''
  const radius = useDiscoverRadius()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [showCreateGroup, setShowCreateGroup] = useState(false)

  const { data: nearYouGroups = [], isLoading } = useDiscoverList('groups')
  const { data: myGroupsList = [] } = useMyGroups(userId)

  // IDs in the counted list.
  const nearYouIds = useMemo(() => new Set(nearYouGroups.map(g => g.id)), [nearYouGroups])

  // Outside-radius strip: my groups not in the counted list.
  const myGroupsElsewhere = useMemo(
    () => myGroupsList.filter(g => g.memberStatus === 'approved' && !nearYouIds.has(g.id)),
    [myGroupsList, nearYouIds],
  )

  // Filter + search.
  const filtered = useMemo(() => {
    let rows = nearYouGroups
    if (filter === 'joinable') rows = rows.filter(g => g.meta.my_status == null && g.meta.join_mode !== 'closed')
    if (filter === 'ringers') rows = rows.filter(g => g.meta.allow_ringers === true)
    if (filter === 'most_members') rows = [...rows].sort((a, b) => ((b.meta.member_count as number) ?? 0) - ((a.meta.member_count as number) ?? 0))
    const q = search.trim().toLowerCase()
    if (q) rows = rows.filter(g => g.title.toLowerCase().includes(q) || (g.subtitle ?? '').toLowerCase().includes(q))
    return rows
  }, [nearYouGroups, filter, search])

  // Sort: joinable first, then member, then closed; distance within each.
  const sorted = useMemo(() => {
    if (filter === 'most_members') return filtered // already sorted
    return [...filtered].sort((a, b) => {
      const rank = (g: typeof a) => {
        if (g.meta.my_status == null && g.meta.join_mode !== 'closed') return 0
        if (g.meta.my_status != null) return 1
        return 2
      }
      const ra = rank(a), rb = rank(b)
      if (ra !== rb) return ra - rb
      return (a.distance_miles ?? Infinity) - (b.distance_miles ?? Infinity)
    })
  }, [filtered, filter])

  // Hero — fallback chain per §3.4.
  const hero = useMemo(() => {
    const joinable = sorted.find(g => g.meta.my_status == null && g.meta.join_mode !== 'closed')
    if (joinable) {
      const autoApprove = joinable.meta.auto_approve === true || joinable.meta.join_mode === 'open'
      return {
        type: 'joinable' as const,
        row: joinable,
        eyebrow: t('people.filter_open_to_join'),
        cta: autoApprove ? t('people.join_btn') : t('people.request_to_join'),
        autoApprove,
      }
    }
    // CTA hero — nothing open.
    return {
      type: 'cta' as const,
      row: null,
    }
  }, [sorted, t])

  const heroId = hero.type === 'joinable' ? hero.row?.id : null
  const listRows = sorted.filter(g => g.id !== heroId)

  const joinMutation = useMutation({
    mutationFn: async ({ groupId, autoApprove }: { groupId: string; autoApprove: boolean }) => {
      const { error } = await supabase.from('group_members').insert({
        group_id: groupId, user_id: userId, role: 'member',
        status: autoApprove ? 'approved' : 'pending',
      })
      if (error) {
        if (error.code === '23505') {
          // Row already exists — read what it says and tell the truth.
          const { data: existing } = await supabase
            .from('group_members').select('status')
            .eq('group_id', groupId).eq('user_id', userId).maybeSingle()
          const s = existing?.status as string | null
          if (s === 'pending') toast(t('people.requested'))
          else if (s === 'pending_ringer') toast(t('people.ringer_offer_pending'))
          else if (s === 'approved') toast.success(t('people.already_member'))
          else if (s === 'ringer') toast.success(t('people.already_ringer'))
          else toast.error(t('people.join_declined_contact_admin'))
          queryClient.invalidateQueries({ queryKey: ['discover-list', 'groups'] })
          return null
        }
        throw error
      }
      const group = nearYouGroups.find(g => g.id === groupId)
      return { autoApprove, groupName: group?.title }
    },
    onSuccess: (data) => {
      if (!data) return // 23505 already toasted
      toast.success(data.autoApprove
        ? t('people.joined_group_name', { name: data.groupName ?? '' })
        : t('people.request_sent'))
      queryClient.invalidateQueries({ queryKey: ['discover-list', 'groups'] })
      queryClient.invalidateQueries({ queryKey: ['my-groups'] })
    },
    onError: (err: Error) => {
      toast.error(err.message || t('people.join_error'))
    },
  })

  function statusBadge(g: typeof nearYouGroups[0]) {
    const s = g.meta.my_status as string | null
    if (s === 'approved') return <span className="text-[11px] font-bold text-court">{t('people.member_btn')}</span>
    if (s === 'ringer') return <span className="text-[11px] font-bold text-warn">{t('people.badge_ringer')}</span>
    if (s === 'pending') return <span className="text-[11px] font-semibold text-ink-2">{t('people.requested')}</span>
    if (s === 'pending_ringer') return <span className="text-[11px] font-semibold text-ink-2">{t('people.ringer_offer_pending')}</span>
    if (g.meta.join_mode === 'closed') return <span className="text-[11px] font-semibold text-ink-3">{t('people.group_closed')}</span>
    return null
  }

  function actionButton(g: typeof nearYouGroups[0]) {
    const s = g.meta.my_status as string | null
    if (s != null) return null // already in or pending — row opens
    if (g.meta.join_mode === 'closed') return null
    const auto = g.meta.auto_approve === true || g.meta.join_mode === 'open'
    return (
      <button
        onClick={e => { e.stopPropagation(); joinMutation.mutate({ groupId: g.id, autoApprove: auto }) }}
        disabled={joinMutation.isPending}
        aria-label={auto ? t('people.join_btn') : t('people.request_to_join')}
        className="flex-shrink-0 rounded-lg bg-court px-3 py-1.5 text-[11px] font-bold text-white"
      >
        {auto ? t('people.join_btn') : t('people.request_to_join')}
      </button>
    )
  }

  return (
    <div className="min-h-full bg-card pb-32">
      {/* Header */}
      <div className="px-4 pt-12 pb-4 bg-card border-b border-hairline">
        <div className="flex items-center gap-3">
          <button onClick={() => goBack(navigate, '/discover')} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-hairline -ml-1">
            <ChevronLeft className="w-5 h-5 text-ink-2" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-ink">{t('discover.tile_groups')}</h1>
            <p className="text-[13px] text-ink-2">{t('discover.groups_within', { count: nearYouGroups.length, radius })}</p>
          </div>
          <button onClick={() => setShowCreateGroup(true)}
            className="h-8 w-8 rounded-full bg-court flex items-center justify-center flex-shrink-0">
            <Plus className="h-4 w-4 text-white" />
          </button>
        </div>
      </div>

      <div className="px-5 pt-4 space-y-4">
        {/* Outside-radius strip */}
        {myGroupsElsewhere.length > 0 && (
          <div>
            <p className="mb-1.5 text-[11px] font-bold uppercase leading-[14px] tracking-[0.06em] text-ink-3">
              {t('discover.your_groups_elsewhere')}
            </p>
            <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
              {myGroupsElsewhere.map(g => (
                <button key={g.id} onClick={() => navigate(`/discover/groups/${g.id}`)}
                  className="flex-shrink-0 rounded-pill border border-hairline bg-card px-3 py-1.5 text-[12px] font-semibold text-ink-2">
                  {g.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-2" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder={t('discover.search_groups_placeholder')} style={{ fontSize: '16px' }}
            className="w-full rounded-xl border border-hairline pl-9 pr-4 py-2.5 outline-none focus:border-court focus:ring-2 focus:ring-court/20" />
        </div>

        {/* Chips */}
        <div className="flex gap-2 flex-wrap">
          {([
            { id: 'all' as Filter, label: t('discover.filter_all') },
            { id: 'joinable' as Filter, label: t('people.filter_open_to_join') },
            { id: 'ringers' as Filter, label: t('people.filter_welcomes_ringers') },
            { id: 'most_members' as Filter, label: t('people.filter_most_members') },
          ]).map(c => (
            <button key={c.id} onClick={() => setFilter(c.id)}
              className={`rounded-pill border px-3 py-1.5 text-[12px] font-semibold transition-colors ${filter === c.id ? 'bg-court text-white border-court' : 'bg-card text-ink-2 border-hairline'}`}>
              {c.label}
            </button>
          ))}
        </div>

        {/* Loading skeleton */}
        {isLoading && (
          <div className="space-y-2">
            {[0,1,2].map(i => <div key={i} className="h-16 rounded-2xl bg-hairline animate-pulse" />)}
          </div>
        )}

        {/* Hero */}
        {!isLoading && hero.type === 'joinable' && hero.row && (
          <div className="rounded-panel bg-ink p-4">
            <span className="rounded-pill bg-court-50 px-2 py-[3px] text-[11px] font-bold leading-[14px] tracking-[0.05em] text-court-700">
              {hero.eyebrow}
            </span>
            <p className="mt-2 text-[24px] font-extrabold leading-[26px] text-white">{hero.row.title}</p>
            <p className="num mt-1 text-[13px] leading-[18px] text-white/70">
              {[hero.row.subtitle, hero.row.distance_miles != null ? formatDistance(hero.row.distance_miles) : null, t('people.members', { count: (hero.row.meta.member_count as number) ?? 0 })].filter(Boolean).join(' · ')}
            </p>
            <button
              onClick={() => joinMutation.mutate({ groupId: hero.row!.id, autoApprove: hero.autoApprove })}
              disabled={joinMutation.isPending}
              className="mt-3 flex h-11 w-full items-center justify-center rounded-control bg-ball text-[14px] font-extrabold leading-[18px] text-ink"
            >
              {hero.cta}
            </button>
          </div>
        )}

        {/* CTA hero — nothing open */}
        {!isLoading && hero.type === 'cta' && (
          <div className="rounded-panel bg-ink p-4">
            <p className="text-[24px] font-extrabold leading-[26px] text-white">{t('discover.hero_no_groups_open_title')}</p>
            <p className="mt-1 text-[13px] leading-[18px] text-[#8C9A95]">
              {t('discover.hero_no_groups_open_body', { count: nearYouGroups.length, radius })}
            </p>
            <button
              onClick={() => setShowCreateGroup(true)}
              className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-control bg-ball text-[14px] font-extrabold leading-[18px] text-ink"
            >
              <Plus className="h-4 w-4" /> {t('people.create_group')}
            </button>
          </div>
        )}

        {/* List */}
        {!isLoading && listRows.length > 0 && (
          <div className="space-y-2">
            {listRows.map(g => {
              const memberCount = (g.meta.member_count as number) ?? 0
              return (
                <div key={g.id} className="flex items-center gap-3 rounded-2xl border border-hairline bg-card p-3.5">
                  <button onClick={() => navigate(`/discover/groups/${g.id}`)}
                    aria-label={g.title}
                    className="flex items-center gap-3 flex-1 min-w-0 text-left">
                    <div className="h-10 w-10 rounded-full bg-court-50 flex items-center justify-center flex-shrink-0">
                      <Users className="h-5 w-5 text-court" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-semibold text-ink truncate">{g.title}</p>
                      <p className="text-[12px] text-ink-2 truncate">
                        {[g.subtitle, g.distance_miles != null ? formatDistance(g.distance_miles) : null, t('people.members', { count: memberCount })].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                  </button>
                  {statusBadge(g)}
                  {actionButton(g)}
                </div>
              )
            })}
          </div>
        )}

        {!isLoading && nearYouGroups.length === 0 && (
          <div className="rounded-2xl border border-dashed border-hairline p-6 text-center">
            <p className="text-[13px] font-semibold text-ink-2">{t('people.no_groups_found')}</p>
          </div>
        )}
      </div>

      <CreateGroupSheet open={showCreateGroup} onClose={() => setShowCreateGroup(false)} />
    </div>
  )
}
