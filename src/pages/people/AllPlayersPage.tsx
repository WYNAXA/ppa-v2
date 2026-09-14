import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { ChevronLeft, Search, UserPlus, Check, Clock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { sendNotification } from '@/lib/notifications'
import { useAuth } from '@/hooks/useAuth'
import { useMyConnections } from '@/hooks/useSocial'
import { useDiscoverList, useDiscoverRadius } from '@/hooks/useDiscoverList'
import { PlayerAvatar } from '@/components/shared/PlayerAvatar'
import { ConnectionRequestCard } from '@/components/people/ConnectionRequestCard'
import { goBack } from '@/lib/navigation'

/**
 * §3.2 Players — tile's number, rendered.
 *
 * Fix class (a) for §0.1: meta.rating replaces meta.internal_ranking.
 * The key didn't exist; the data was always there.
 */

type Sort = 'level' | 'nearest'

export function AllPlayersPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const userId = profile?.id ?? ''
  const myElo = profile?.internal_ranking ?? null
  const radius = useDiscoverRadius()
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<Sort>('level')

  const { data: nearYouRaw = [], isLoading } = useDiscoverList('players')

  // Connection status for action buttons.
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

  // Waiting on you — incoming requests.
  const { data: myConns } = useMyConnections(userId)
  const incomingRequests = myConns?.incomingRequests ?? []
  const acceptedProfiles = myConns?.acceptedProfiles ?? []

  // Outside-radius strip: connections not in the counted list.
  const nearYouIds = useMemo(() => new Set(nearYouRaw.map(p => p.id)), [nearYouRaw])
  const connectionsElsewhere = useMemo(
    () => acceptedProfiles.filter(p => !nearYouIds.has(p.user_id)),
    [acceptedProfiles, nearYouIds],
  )

  function getState(pid: string) {
    if (conns.accepted.has(pid)) return 'accepted'
    if (conns.pendingOut.has(pid)) return 'pending_out'
    if (conns.pendingIn.has(pid)) return 'pending_in'
    return 'none'
  }

  // Search + sort.
  const processed = useMemo(() => {
    let rows = nearYouRaw
    const q = search.trim().toLowerCase()
    if (q) rows = rows.filter(p => p.title.toLowerCase().includes(q))
    // Sort: not-connected before connected, then by ELO delta or distance.
    return [...rows].sort((a, b) => {
      const aConn = conns.accepted.has(a.id) ? 1 : 0
      const bConn = conns.accepted.has(b.id) ? 1 : 0
      if (aConn !== bConn) return aConn - bConn
      if (sort === 'level' && myElo != null) {
        const aR = a.meta.rating as number | null
        const bR = b.meta.rating as number | null
        const aDelta = aR != null ? Math.abs(aR - myElo) : Infinity
        const bDelta = bR != null ? Math.abs(bR - myElo) : Infinity
        return aDelta - bDelta
      }
      return (a.distance_miles ?? Infinity) - (b.distance_miles ?? Infinity)
    })
  }, [nearYouRaw, search, sort, myElo, conns.accepted])

  // Hero — fallback chain per §3.2.
  const hero = useMemo(() => {
    const candidates = processed.filter(p => getState(p.id) === 'none')
    if (candidates.length === 0 && processed.length > 0) {
      // Branch 3: everyone connected.
      return { type: 'cta' as const, row: null }
    }
    const best = candidates[0] // already sorted by level or distance
    if (!best) return null
    const rating = best.meta.rating as number | null
    const delta = myElo != null && rating != null ? Math.abs(rating - myElo) : null
    const closeLevel = delta != null && delta <= 150
    return {
      type: 'player' as const,
      row: best,
      eyebrow: closeLevel ? t('discover.hero_closest_level') : t('discover.hero_nearest_player'),
      deltaLine: closeLevel && delta != null ? t('discover.hero_elo_delta', { rating, delta }) : null,
    }
  }, [processed, myElo, t])

  const heroId = hero?.type === 'player' ? hero.row?.id : null
  const listRows = processed.filter(p => p.id !== heroId)

  const connectMutation = useMutation({
    mutationFn: async (targetId: string) => {
      const { error } = await supabase.from('player_connections').insert({ user_id: userId, connected_user_id: targetId, status: 'pending' })
      if (error) throw error
      sendNotification({
        user_id: targetId, type: 'connection_request', title: t('people.notif_connection_request'),
        message: `${profile?.name ?? 'A player'} wants to connect with you.`, related_id: userId,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-connections-status', userId] })
      toast.success(t('people.toast_connection_sent'))
    },
    onError: () => toast.error(t('people.toast_connection_failed')),
  })

  const acceptMutation = useMutation({
    mutationFn: async (requesterId: string) => {
      const { error } = await supabase.rpc('accept_connection_request', { p_requester_id: requesterId })
      if (error) throw error
      sendNotification({
        user_id: requesterId, type: 'connection_accepted', title: t('people.notif_connection_accepted'),
        message: `${profile?.name ?? 'A player'} accepted your connection request.`, related_id: userId,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-connections-status', userId] })
      toast.success(t('people.toast_connection_accepted'))
    },
    onError: () => toast.error(t('people.toast_connection_failed')),
  })

  function ActionButton({ pid }: { pid: string }) {
    const state = getState(pid)
    if (state === 'none') return (
      <button onClick={() => connectMutation.mutate(pid)} disabled={connectMutation.isPending}
        aria-label={t('people.connect')}
        className="flex-shrink-0 flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold bg-court text-white">
        <UserPlus className="h-3 w-3" /> {t('people.connect')}
      </button>
    )
    if (state === 'pending_out') return (
      <span className="flex-shrink-0 flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold bg-hairline text-ink-2">
        <Clock className="h-3 w-3" /> {t('people.pending')}
      </span>
    )
    if (state === 'pending_in') return (
      <button onClick={() => acceptMutation.mutate(pid)} disabled={acceptMutation.isPending}
        aria-label={t('people.accept')}
        className="flex-shrink-0 flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold bg-court text-white">
        <Check className="h-3 w-3" /> {t('people.accept')}
      </button>
    )
    return (
      <span className="flex-shrink-0 flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold bg-hairline text-ink-2">
        <Check className="h-3 w-3" /> {t('people.connected')}
      </span>
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
            <h1 className="text-xl font-bold text-ink">{t('discover.tile_players')}</h1>
            <p className="text-[13px] text-ink-2">{t('discover.players_within', { count: nearYouRaw.length, radius })}</p>
          </div>
        </div>
      </div>

      <div className="px-5 pt-4 space-y-4">
        {/* Waiting on you */}
        {incomingRequests.length > 0 && (
          <section id="connections" style={{ scrollMarginTop: '80px' }}>
            <p className="mb-2 text-[11px] font-bold uppercase leading-[14px] tracking-[0.06em] text-ink-2">
              {t('people.connection_requests', { count: incomingRequests.length })}
            </p>
            <div className="space-y-2">
              {incomingRequests.map(req => <ConnectionRequestCard key={req.user_id} request={req} />)}
            </div>
          </section>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-2" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder={t('people.search_players')} style={{ fontSize: '16px' }}
            className="w-full rounded-xl border border-hairline pl-9 pr-4 py-2.5 outline-none focus:border-court focus:ring-2 focus:ring-court/20" />
        </div>

        {/* Sort chips */}
        <div className="flex gap-2">
          {([
            { id: 'level' as Sort, label: t('discover.sort_closest_level') },
            { id: 'nearest' as Sort, label: t('discover.sort_nearest') },
          ]).map(c => (
            <button key={c.id} onClick={() => setSort(c.id)}
              className={`rounded-pill border px-3 py-1.5 text-[12px] font-semibold transition-colors ${sort === c.id ? 'bg-court text-white border-court' : 'bg-card text-ink-2 border-hairline'}`}>
              {c.label}
            </button>
          ))}
        </div>

        {/* Outside-radius strip */}
        {connectionsElsewhere.length > 0 && (
          <div>
            <p className="mb-1.5 text-[11px] font-bold uppercase leading-[14px] tracking-[0.06em] text-ink-3">{t('people.my_connections')}</p>
            <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
              {connectionsElsewhere.map(p => (
                <button key={p.user_id} onClick={() => navigate(`/players/${p.user_id}`)} className="flex-shrink-0">
                  <PlayerAvatar name={p.name} avatarUrl={p.avatar_url} size="sm" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Loading skeleton */}
        {isLoading && (
          <div className="space-y-2">
            {[0,1,2].map(i => <div key={i} className="h-16 rounded-xl bg-hairline animate-pulse" />)}
          </div>
        )}

        {/* Hero */}
        {!isLoading && hero && hero.type === 'player' && hero.row && (
          <div className="rounded-panel bg-ink p-4">
            <span className="rounded-pill bg-court-50 px-2 py-[3px] text-[11px] font-bold leading-[14px] tracking-[0.05em] text-court-700">
              {hero.eyebrow}
            </span>
            <div className="flex items-center gap-3 mt-3">
              <PlayerAvatar name={hero.row.title} avatarUrl={hero.row.meta.avatar_url as string | null} size="lg" />
              <div className="flex-1 min-w-0">
                <p className="text-[20px] font-extrabold text-white truncate">{hero.row.title}</p>
                <p className="text-[13px] text-white/70">
                  {[hero.row.subtitle, hero.row.distance_miles != null ? `${hero.row.distance_miles.toFixed(1)} mi` : null].filter(Boolean).join(' · ')}
                </p>
                {hero.deltaLine && <p className="text-[13px] text-white/70 mt-0.5">{hero.deltaLine}</p>}
              </div>
              {(hero.row.meta.rating as number | null) != null && (
                <span className="flex-shrink-0 rounded-pill bg-ball px-2.5 py-1 text-[12px] font-extrabold text-ink">
                  {hero.row.meta.rating as number}
                </span>
              )}
            </div>
            <button
              onClick={() => connectMutation.mutate(hero.row!.id)}
              disabled={connectMutation.isPending}
              className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-control bg-ball text-[14px] font-extrabold leading-[18px] text-ink"
            >
              <UserPlus className="h-4 w-4" /> {t('people.connect')}
            </button>
          </div>
        )}

        {/* CTA hero — everyone connected */}
        {!isLoading && hero?.type === 'cta' && (
          <div className="rounded-panel bg-ink p-4">
            <p className="text-[24px] font-extrabold leading-[26px] text-white">{t('discover.hero_all_connected_title')}</p>
            <p className="mt-1 text-[13px] leading-[18px] text-[#8C9A95]">
              {t('discover.hero_all_connected_body', { count: nearYouRaw.length, radius })}
            </p>
            <button
              onClick={() => navigate(`/discover?r=100`)}
              className="mt-3 flex h-11 w-full items-center justify-center rounded-control bg-ball text-[14px] font-extrabold leading-[18px] text-ink"
            >
              {t('discover.radius_widen', { miles: 100 })}
            </button>
          </div>
        )}

        {/* List */}
        {!isLoading && listRows.length > 0 && (
          <div className="space-y-2">
            {listRows.map(p => {
              const rating = p.meta.rating as number | null
              const avatarUrl = p.meta.avatar_url as string | null
              return (
                <div key={p.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-surface">
                  <button onClick={() => navigate(`/players/${p.id}`)} aria-label={p.title}
                    className="flex items-center gap-3 flex-1 min-w-0 text-left">
                    <PlayerAvatar name={p.title} avatarUrl={avatarUrl} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-ink truncate">{p.title}</p>
                      <p className="text-[11px] text-ink-2">
                        {[p.subtitle, p.distance_miles != null ? `${p.distance_miles.toFixed(1)} mi` : null].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                  </button>
                  {rating != null && (
                    <span className="text-[11px] font-bold text-court-700 bg-court-50 border border-court-100 rounded-full px-2 py-0.5 flex-shrink-0">{rating} ELO</span>
                  )}
                  <ActionButton pid={p.id} />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
