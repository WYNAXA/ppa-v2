import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useDiscoverList, useDiscoverRadius } from '@/hooks/useDiscoverList'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import { ChevronLeft, Trophy, ChevronRight, Plus, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import { goBack } from '@/lib/navigation'

// ── Types ────────────────────────────────────────────────────────────────────

interface MyLeague {
  id: string
  name: string
  match_type: string | null
  format: string | null
  /**
   * `leagues.status` is nullable in the database — it defaults to 'draft' but
   * carries no NOT NULL. Declaring it `string` here made the useQuery overload
   * fail, which degraded `data` to `never[]` and broke every `.map` / `.filter`
   * downstream. Most of this page's type errors came from this one line.
   */
  status: string | null
  season_start: string | null
  season_end: string | null
  role: string
}

interface Invitation {
  id: string
  league_id: string
  invited_by: string
  status: string
  leagues: { id: string; name: string; match_type: string | null; format: string | null } | null
}


// ── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  active:    'bg-court-50 text-court',
  upcoming:  'bg-surface text-ink-2',
  completed: 'bg-hairline text-ink-2',
  draft:     'bg-warn-50 text-warn',
}

// Entry fees carry their own currency (leagues.currency). An amount with no
// currency renders as a dash — printing it with a pound sign, as this did, is a

// ── Component ────────────────────────────────────────────────────────────────

export function LeagueDiscoveryPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const { profile } = useAuth()
  const userId = profile?.id ?? ''

  const { data: nearYouLeagues = [], isLoading: loadingNearYou } = useDiscoverList('leagues')
  const discoverRadius = useDiscoverRadius()
  const [searchQuery, setSearchQuery] = useState('')

  const filteredNearYou = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return nearYouLeagues
    return nearYouLeagues.filter(l => l.title.toLowerCase().includes(q) || (l.subtitle ?? '').toLowerCase().includes(q))
  }, [nearYouLeagues, searchQuery])


  // ── My Leagues ───────────────────────────────────────────────────────────

  const { data: myLeagues = [] } = useQuery<MyLeague[]>({
    queryKey: ['my-leagues-discovery', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data: memberships } = await supabase
        .from('league_members')
        .select('league_id, role')
        .eq('user_id', userId)
        .eq('status', 'active')
      if (!memberships || memberships.length === 0) return []
      // league_members.league_id is nullable, and PostgREST's .in() takes
      // string[] — a null in the list would be sent as the literal "null".
      const ids = memberships.map(m => m.league_id).filter((x): x is string => !!x)
      if (ids.length === 0) return []
      const { data: leagues } = await supabase
        .from('leagues')
        .select('id, name, match_type, format, status, season_start, season_end')
        .in('id', ids)
        .order('created_at', { ascending: false })
      return (leagues ?? []).map(l => ({
        ...l,
        role: memberships.find(m => m.league_id === l.id)?.role ?? 'member',
      }))
    },
  })

  // ── Pending Invitations ──────────────────────────────────────────────────

  const { data: invitations = [] } = useQuery<Invitation[]>({
    queryKey: ['league-invitations-discovery', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from('league_invitations')
        .select('id, league_id, invited_by, status, leagues:league_id(id, name, match_type, format)')
        .eq('invited_user_id', userId)
        .eq('status', 'pending')
      return (data as Invitation[] | null) ?? []
    },
  })

  const acceptMutation = useMutation({
    mutationFn: async (inv: Invitation) => {
      const { error: joinErr } = await supabase.rpc('join_league', {
        p_league_id: inv.league_id,
        p_user_id: userId,
      })
      if (joinErr) throw new Error(joinErr.message)
      await supabase
        .from('league_invitations')
        .update({ status: 'accepted' })
        .eq('id', inv.id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-leagues-discovery'] })
      queryClient.invalidateQueries({ queryKey: ['league-invitations-discovery'] })
    },
    onError: (err: Error) => {
      toast.error(err.message || t('discover.join_league_failed'))
    },
  })

  const declineMutation = useMutation({
    mutationFn: async (inv: Invitation) => {
      await supabase
        .from('league_invitations')
        .update({ status: 'declined' })
        .eq('id', inv.id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['league-invitations-discovery'] })
    },
  })

  // ── Open Leagues ─────────────────────────────────────────────────────────



  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col min-h-full bg-surface">
      {/* Header */}
      <div className="bg-card border-b border-hairline px-4 pt-12 pb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => goBack(navigate, '/discover')}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-hairline -ml-1"
          >
            <ChevronLeft className="w-5 h-5 text-ink-2" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-ink">{t('discover.leagues_title')}</h1>
            <p className="text-[13px] text-ink-2">{t('discover.leagues_within', { count: nearYouLeagues.length, radius: discoverRadius })}</p>
          </div>
          <button
            onClick={() => navigate('/compete?createLeague=true')}
            className="h-8 w-8 rounded-full bg-court flex items-center justify-center flex-shrink-0"
          >
            <Plus className="h-4 w-4 text-white" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-32">
        {/* ── Mine ─────────────────────────────────────────────────────── */}
        {myLeagues.length > 0 && (
          <section className="px-4 pt-5">
            <h2 className="text-sm font-semibold text-ink-2 uppercase tracking-wide mb-3">{t('discover.mine')}</h2>
            <div className="space-y-2">
              {myLeagues.map(league => (
                <motion.button
                  key={league.id}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => navigate(`/compete/leagues/${league.id}`)}
                  className="w-full flex items-center gap-3 rounded-2xl bg-card p-4 shadow-sm border border-hairline text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-court-50 flex items-center justify-center shrink-0">
                    <Trophy className="w-5 h-5 text-court" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold text-ink truncate">{league.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {league.format && (
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-hairline text-ink-2 capitalize">
                          {league.format}
                        </span>
                      )}
                      <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded-full', STATUS_COLORS[league.status ?? 'draft'] ?? 'bg-hairline text-ink-2')}>
                        {league.status ?? 'draft'}
                      </span>
                      {league.role === 'admin' && (
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-warn-50 text-warn">{t('discover.badge_admin')}</span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-ink-3 shrink-0" />
                </motion.button>
              ))}
            </div>
          </section>
        )}

        {/* ── Pending Invitations ────────────────────────────────────────── */}
        {invitations.length > 0 && (
          <section className="px-4 pt-5">
            <h2 className="text-sm font-semibold text-ink-2 uppercase tracking-wide mb-3">{t('discover.pending_invitations')}</h2>
            <div className="space-y-2">
              {invitations.map(inv => (
                <div key={inv.id} className="rounded-2xl bg-card p-4 shadow-sm border border-hairline">
                  <p className="text-[14px] font-semibold text-ink">{inv.leagues?.name ?? 'League'}</p>
                  <p className="text-[12px] text-ink-2 mt-0.5">{t('discover.invited_by_team')}</p>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => acceptMutation.mutate(inv)}
                      disabled={acceptMutation.isPending}
                      className="flex-1 rounded-xl bg-court py-2 text-[13px] font-bold text-white disabled:opacity-50"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => declineMutation.mutate(inv)}
                      disabled={declineMutation.isPending}
                      className="flex-1 rounded-xl bg-hairline py-2 text-[13px] font-bold text-ink-2 disabled:opacity-50"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Near you — from discover_list ───────────────────────────── */}
        <section className="px-4 pt-5">

          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={t('discover.search_placeholder')}
              className="w-full rounded-xl border border-hairline bg-card py-2.5 pl-9 pr-4 text-[14px] text-ink placeholder:text-ink-2 focus:outline-none focus:ring-2 focus:ring-court/30 focus:border-court"
            />
          </div>

          {loadingNearYou ? (
            <div className="h-16 rounded-2xl bg-hairline animate-pulse" />
          ) : filteredNearYou.length === 0 ? (
            <p className="text-center text-[13px] text-ink-2 py-8">{t('discover.empty_subtitle')}</p>
          ) : (
            <div className="space-y-2">
              {filteredNearYou.map(league => (
                <motion.div
                  key={league.id}
                  whileTap={{ scale: 0.98 }}
                  className="flex items-center gap-3 rounded-2xl bg-card p-4 shadow-sm border border-hairline"
                >
                  <div className="w-10 h-10 rounded-xl bg-court-50 flex items-center justify-center shrink-0">
                    <Trophy className="w-5 h-5 text-court" />
                  </div>
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => navigate(`/compete/leagues/${league.id}`)}
                  >
                    <p className="text-[14px] font-semibold text-ink truncate">{league.title}</p>
                    <p className="text-[12px] text-ink-2 truncate">
                      {[league.subtitle, league.distance_miles != null ? `${league.distance_miles < 10 ? league.distance_miles.toFixed(1) : Math.round(league.distance_miles)} mi` : null].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-ink-3 flex-shrink-0" />
                </motion.div>
              ))}
            </div>
          )}
        </section>

        {/* ── Create League CTA ──────────────────────────────────────────── */}
        <section className="px-4 pt-6 pb-4">
          <div className="rounded-2xl bg-card p-5 shadow-sm border border-hairline text-center">
            <div className="w-12 h-12 rounded-full bg-court-50 flex items-center justify-center mx-auto mb-3">
              <Plus className="w-6 h-6 text-court" />
            </div>
            <h3 className="text-[15px] font-bold text-ink">{t('discover.start_your_league')}</h3>
            <p className="text-[13px] text-ink-2 mt-1">{t('discover.start_league_desc')}</p>
            <button
              onClick={() => navigate('/compete?createLeague=true')}
              className="mt-4 w-full rounded-2xl bg-court py-3 text-[14px] font-bold text-white"
            >
              Create League
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
