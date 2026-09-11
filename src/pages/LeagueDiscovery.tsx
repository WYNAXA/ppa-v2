import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import { ChevronLeft, Search, Trophy, ChevronRight, Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { money } from '@/lib/money'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import { goBack } from '@/lib/navigation'

// ── Types ────────────────────────────────────────────────────────────────────

interface MyLeague {
  id: string
  name: string
  match_type: string | null
  format: string | null
  status: string
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

interface OpenLeague {
  id: string
  name: string
  match_type: string | null
  format: string | null
  status: string
  is_open_registration: boolean | null
  entry_fee_pence: number | null
  currency: string | null
  max_participants: number | null
  is_official: boolean | null
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
// guess dressed up as a fact.
function formatFee(minor: number | null | undefined, currency: string | null | undefined): string | null {
  if (!minor) return null
  return money(minor, currency)
}

// ── Component ────────────────────────────────────────────────────────────────

export function LeagueDiscoveryPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  const userId = profile?.id ?? ''

  const [searchQuery, setSearchQuery] = useState('')

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
      const ids = memberships.map(m => m.league_id)
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
      toast.error(err.message || 'Failed to join league')
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

  const [leagueFilter, setLeagueFilter] = useState('all')
  const userCity = profile?.city?.split(',')[0]?.trim() ?? ''

  const LEAGUE_FILTERS = [
    { id: 'all', label: 'All' },
    { id: 'open', label: 'Open to join' },
    { id: 'near_me', label: 'Near me' },
    { id: 'competitive', label: 'Competitive' },
    { id: 'friendly', label: 'Friendly' },
    { id: 'mexicano', label: 'Mexicano' },
    { id: 'round_robin', label: 'Round Robin' },
    { id: 'free', label: 'Free entry' },
  ]

  const { data: openLeagues = [] } = useQuery<OpenLeague[]>({
    queryKey: ['open-leagues', searchQuery, leagueFilter],
    queryFn: async () => {
      let q = supabase
        .from('leagues')
        .select('id, name, match_type, format, status, is_open_registration, entry_fee_pence, currency, max_participants, is_official, city')
        .eq('status', 'active')
        .or('is_open_registration.eq.true,visibility.eq.public')
        .order('created_at', { ascending: false })
        .limit(30)
      if (searchQuery.trim()) q = q.ilike('name', `%${searchQuery.trim()}%`)
      if (leagueFilter === 'open') q = q.eq('is_open_registration', true)
      if (leagueFilter === 'near_me' && userCity) q = q.ilike('city', `%${userCity}%`)
      if (leagueFilter === 'competitive') q = q.eq('match_type', 'competitive')
      if (leagueFilter === 'friendly') q = q.eq('match_type', 'friendly')
      if (leagueFilter === 'mexicano') q = q.eq('format', 'mexicano')
      if (leagueFilter === 'round_robin') q = q.eq('format', 'round_robin')
      if (leagueFilter === 'free') q = q.or('entry_fee_pence.eq.0,entry_fee_pence.is.null')
      const { data } = await q
      const myIds = new Set(myLeagues.map(l => l.id))
      return (data ?? []).filter(l => !myIds.has(l.id))
    },
  })

  const joinMutation = useMutation({
    mutationFn: async (leagueId: string) => {
      const { error } = await supabase.rpc('join_league', {
        p_league_id: leagueId,
        p_user_id: userId,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-leagues-discovery'] })
      queryClient.invalidateQueries({ queryKey: ['open-leagues'] })
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to join league')
    },
  })

  // ── Derived ──────────────────────────────────────────────────────────────

  const officialTournaments = openLeagues.filter(l => l.is_official)
  const communityLeagues = openLeagues.filter(l => !l.is_official)

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col min-h-full bg-surface">
      {/* Header */}
      <div className="bg-card border-b border-hairline px-4 pt-12 pb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => goBack(navigate, '/compete')}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-hairline -ml-1"
          >
            <ChevronLeft className="w-5 h-5 text-ink-2" />
          </button>
          <h1 className="text-xl font-bold text-ink flex-1">Leagues & Tournaments</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-32">
        {/* ── My Leagues ─────────────────────────────────────────────────── */}
        {myLeagues.length > 0 && (
          <section className="px-4 pt-5">
            <h2 className="text-sm font-semibold text-ink-2 uppercase tracking-wide mb-3">My Leagues</h2>
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
                      <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded-full', STATUS_COLORS[league.status] ?? 'bg-hairline text-ink-2')}>
                        {league.status}
                      </span>
                      {league.role === 'admin' && (
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-warn-50 text-warn">Admin</span>
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
            <h2 className="text-sm font-semibold text-ink-2 uppercase tracking-wide mb-3">Pending Invitations</h2>
            <div className="space-y-2">
              {invitations.map(inv => (
                <div key={inv.id} className="rounded-2xl bg-card p-4 shadow-sm border border-hairline">
                  <p className="text-[14px] font-semibold text-ink">{inv.leagues?.name ?? 'League'}</p>
                  <p className="text-[12px] text-ink-2 mt-0.5">Invited by a team member</p>
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

        {/* ── Official Tournaments ───────────────────────────────────────── */}
        {officialTournaments.length > 0 && (
          <section className="px-4 pt-5">
            <h2 className="text-sm font-semibold text-ink-2 uppercase tracking-wide mb-3">Official Tournaments</h2>
            <div className="space-y-2">
              {officialTournaments.map(league => (
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
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-court-50 text-court">Official</span>
                      {league.format && (
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-hairline text-ink-2 capitalize">
                          {league.format}
                        </span>
                      )}
                      {formatFee(league.entry_fee_pence, league.currency) && (
                        <span className="text-[11px] text-ink-2">{formatFee(league.entry_fee_pence, league.currency)}</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={e => {
                      e.stopPropagation()
                      joinMutation.mutate(league.id)
                    }}
                    disabled={joinMutation.isPending}
                    className="shrink-0 rounded-xl bg-court px-4 py-1.5 text-[12px] font-bold text-white disabled:opacity-50"
                  >
                    Join
                  </button>
                </motion.button>
              ))}
            </div>
          </section>
        )}

        {/* ── Open Leagues ───────────────────────────────────────────────── */}
        <section className="px-4 pt-5">
          <h2 className="text-sm font-semibold text-ink-2 uppercase tracking-wide mb-3">Open Leagues</h2>

          {/* Filter chips */}
          <div className="flex gap-2 overflow-x-auto scrollbar-none mb-3 pb-0.5">
            {LEAGUE_FILTERS.map(f => (
              <button
                key={f.id}
                onClick={() => setLeagueFilter(f.id)}
                className={cn(
                  'flex-shrink-0 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors',
                  leagueFilter === f.id ? 'bg-court border-court text-white' : 'border-hairline text-ink-2 bg-card'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search leagues..."
              className="w-full rounded-xl border border-hairline bg-card py-2.5 pl-9 pr-4 text-[14px] text-ink placeholder:text-ink-2 focus:outline-none focus:ring-2 focus:ring-court/30 focus:border-court"
            />
          </div>

          {communityLeagues.length === 0 ? (
            <p className="text-center text-[13px] text-ink-2 py-8">No open leagues found</p>
          ) : (
            <div className="space-y-2">
              {communityLeagues.map(league => (
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
                    <p className="text-[14px] font-semibold text-ink truncate">{league.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {league.format && (
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-hairline text-ink-2 capitalize">
                          {league.format}
                        </span>
                      )}
                      {formatFee(league.entry_fee_pence, league.currency) && (
                        <span className="text-[11px] text-ink-2">{formatFee(league.entry_fee_pence, league.currency)}</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => joinMutation.mutate(league.id)}
                    disabled={joinMutation.isPending}
                    className="shrink-0 rounded-xl bg-court px-4 py-1.5 text-[12px] font-bold text-white disabled:opacity-50"
                  >
                    Join
                  </button>
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
            <h3 className="text-[15px] font-bold text-ink">Start your own league</h3>
            <p className="text-[13px] text-ink-2 mt-1">Create a league for your group and track standings automatically.</p>
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
