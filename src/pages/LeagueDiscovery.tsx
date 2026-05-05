import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { ChevronLeft, Search, Trophy, ChevronRight, Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'

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
  max_participants: number | null
  is_official: boolean | null
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  active:    'bg-green-50 text-green-700',
  upcoming:  'bg-blue-50 text-blue-700',
  completed: 'bg-gray-100 text-gray-500',
  draft:     'bg-yellow-50 text-yellow-700',
}

function formatFee(pence: number | null | undefined): string | null {
  if (!pence) return null
  return `£${(pence / 100).toFixed(2)}`
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
      await supabase.from('league_members').insert({
        league_id: inv.league_id,
        user_id: userId,
        role: 'member',
        status: 'active',
      })
      await supabase.from('league_standings').insert({
        league_id: inv.league_id,
        user_id: userId,
        rank: 0,
        played: 0,
        won: 0,
        lost: 0,
        drawn: 0,
        points: 0,
      })
      await supabase
        .from('league_invitations')
        .update({ status: 'accepted' })
        .eq('id', inv.id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-leagues-discovery'] })
      queryClient.invalidateQueries({ queryKey: ['league-invitations-discovery'] })
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

  const { data: openLeagues = [] } = useQuery<OpenLeague[]>({
    queryKey: ['open-leagues', searchQuery],
    queryFn: async () => {
      let q = supabase
        .from('leagues')
        .select('id, name, match_type, format, status, is_open_registration, entry_fee_pence, max_participants, is_official')
        .eq('status', 'active')
        .or('is_open_registration.eq.true,visibility.eq.public')
        .order('created_at', { ascending: false })
        .limit(20)
      if (searchQuery.trim()) q = q.ilike('name', `%${searchQuery.trim()}%`)
      const { data } = await q
      const myIds = new Set(myLeagues.map(l => l.id))
      return (data ?? []).filter(l => !myIds.has(l.id))
    },
  })

  const joinMutation = useMutation({
    mutationFn: async (leagueId: string) => {
      await supabase.from('league_members').insert({
        league_id: leagueId,
        user_id: userId,
        role: 'member',
        status: 'active',
      })
      await supabase.from('league_standings').insert({
        league_id: leagueId,
        user_id: userId,
        rank: 0,
        played: 0,
        won: 0,
        lost: 0,
        drawn: 0,
        points: 0,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-leagues-discovery'] })
      queryClient.invalidateQueries({ queryKey: ['open-leagues'] })
    },
  })

  // ── Derived ──────────────────────────────────────────────────────────────

  const officialTournaments = openLeagues.filter(l => l.is_official)
  const communityLeagues = openLeagues.filter(l => !l.is_official)

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col min-h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 pt-12 pb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 -ml-1"
          >
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="text-xl font-bold text-gray-900 flex-1">Leagues & Tournaments</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-32">
        {/* ── My Leagues ─────────────────────────────────────────────────── */}
        {myLeagues.length > 0 && (
          <section className="px-4 pt-5">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">My Leagues</h2>
            <div className="space-y-2">
              {myLeagues.map(league => (
                <motion.button
                  key={league.id}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => navigate(`/compete/leagues/${league.id}`)}
                  className="w-full flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm border border-gray-100 text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center shrink-0">
                    <Trophy className="w-5 h-5 text-[#009688]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold text-gray-900 truncate">{league.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {league.format && (
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 capitalize">
                          {league.format}
                        </span>
                      )}
                      <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded-full', STATUS_COLORS[league.status] ?? 'bg-gray-100 text-gray-500')}>
                        {league.status}
                      </span>
                      {league.role === 'admin' && (
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">Admin</span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                </motion.button>
              ))}
            </div>
          </section>
        )}

        {/* ── Pending Invitations ────────────────────────────────────────── */}
        {invitations.length > 0 && (
          <section className="px-4 pt-5">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Pending Invitations</h2>
            <div className="space-y-2">
              {invitations.map(inv => (
                <div key={inv.id} className="rounded-2xl bg-white p-4 shadow-sm border border-gray-100">
                  <p className="text-[14px] font-semibold text-gray-900">{inv.leagues?.name ?? 'League'}</p>
                  <p className="text-[12px] text-gray-500 mt-0.5">Invited by a team member</p>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => acceptMutation.mutate(inv)}
                      disabled={acceptMutation.isPending}
                      className="flex-1 rounded-xl bg-[#009688] py-2 text-[13px] font-bold text-white disabled:opacity-50"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => declineMutation.mutate(inv)}
                      disabled={declineMutation.isPending}
                      className="flex-1 rounded-xl bg-gray-100 py-2 text-[13px] font-bold text-gray-600 disabled:opacity-50"
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
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Official Tournaments</h2>
            <div className="space-y-2">
              {officialTournaments.map(league => (
                <motion.button
                  key={league.id}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => navigate(`/compete/leagues/${league.id}`)}
                  className="w-full flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm border border-gray-100 text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center shrink-0">
                    <Trophy className="w-5 h-5 text-purple-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold text-gray-900 truncate">{league.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-purple-50 text-purple-700">Official</span>
                      {league.format && (
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 capitalize">
                          {league.format}
                        </span>
                      )}
                      {formatFee(league.entry_fee_pence) && (
                        <span className="text-[11px] text-gray-400">{formatFee(league.entry_fee_pence)}</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={e => {
                      e.stopPropagation()
                      joinMutation.mutate(league.id)
                    }}
                    disabled={joinMutation.isPending}
                    className="shrink-0 rounded-xl bg-[#009688] px-4 py-1.5 text-[12px] font-bold text-white disabled:opacity-50"
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
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Open Leagues</h2>

          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search leagues..."
              className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-4 text-[14px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#009688]/30 focus:border-[#009688]"
            />
          </div>

          {communityLeagues.length === 0 ? (
            <p className="text-center text-[13px] text-gray-400 py-8">No open leagues found</p>
          ) : (
            <div className="space-y-2">
              {communityLeagues.map(league => (
                <motion.div
                  key={league.id}
                  whileTap={{ scale: 0.98 }}
                  className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm border border-gray-100"
                >
                  <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center shrink-0">
                    <Trophy className="w-5 h-5 text-[#009688]" />
                  </div>
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => navigate(`/compete/leagues/${league.id}`)}
                  >
                    <p className="text-[14px] font-semibold text-gray-900 truncate">{league.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {league.format && (
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 capitalize">
                          {league.format}
                        </span>
                      )}
                      {formatFee(league.entry_fee_pence) && (
                        <span className="text-[11px] text-gray-400">{formatFee(league.entry_fee_pence)}</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => joinMutation.mutate(league.id)}
                    disabled={joinMutation.isPending}
                    className="shrink-0 rounded-xl bg-[#009688] px-4 py-1.5 text-[12px] font-bold text-white disabled:opacity-50"
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
          <div className="rounded-2xl bg-white p-5 shadow-sm border border-gray-100 text-center">
            <div className="w-12 h-12 rounded-full bg-teal-50 flex items-center justify-center mx-auto mb-3">
              <Plus className="w-6 h-6 text-[#009688]" />
            </div>
            <h3 className="text-[15px] font-bold text-gray-900">Start your own league</h3>
            <p className="text-[13px] text-gray-500 mt-1">Create a league for your group and track standings automatically.</p>
            <button
              onClick={() => navigate('/compete?createLeague=true')}
              className="mt-4 w-full rounded-2xl bg-[#009688] py-3 text-[14px] font-bold text-white"
            >
              Create League
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
