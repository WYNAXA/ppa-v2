import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Edit2, LogOut, ChevronRight, Home, Search, Link, Unlink } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PlayerAvatar } from '@/components/shared/PlayerAvatar'
import { BADGE_DEFINITIONS } from '@/lib/badges'
import { setLanguage, SUPPORTED_LANGUAGES } from '@/i18n'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

interface FullProfile {
  id: string
  name: string
  email: string
  city: string | null
  postal_code: string | null
  country: string | null
  avatar_url: string | null
  internal_ranking: number | null
  ranking_points: number | null
  household_partner_id: string | null
}

interface MatchHistoryItem {
  id: string
  match_date: string
  result_type: 'win' | 'loss' | 'draw' | null
  score: string
  opponents: string
}

interface Achievement {
  id: string
  badge_key: string
  earned_at: string
}

interface MyYouStats {
  totalMatches: number
  wins: number
  losses: number
  draws: number
  winRate: number
  rankPosition: number
  bestStreak: number
  favouritePartnerName: string | null
}

// ── Data hooks ────────────────────────────────────────────────────────────────

function useFullProfile(userId: string) {
  return useQuery<FullProfile | null>({
    queryKey: ['full-profile', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, email, city, postal_code, country, avatar_url, internal_ranking, ranking_points, household_partner_id')
        .eq('id', userId)
        .single()
      if (error) return null
      return data
    },
  })
}

function useYouStats(userId: string) {
  return useQuery<MyYouStats>({
    queryKey: ['you-stats', userId],
    enabled: !!userId,
    queryFn: async () => {
      const [resultsData, rankData] = await Promise.all([
        supabase
          .from('match_results')
          .select('result_type, team1_players, team2_players')
          .or(`team1_players.cs.{${userId}},team2_players.cs.{${userId}}`)
          .order('created_at', { ascending: true }),
        supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .gt('internal_ranking', 0),
      ])

      const results = resultsData.data ?? []
      let wins = 0, losses = 0, draws = 0
      let streak = 0, bestStreak = 0
      const partnerWins: Record<string, number> = {}

      for (const r of results) {
        const inTeam1  = (r.team1_players as string[]).includes(userId)
        const teammates = inTeam1 ? (r.team1_players as string[]) : (r.team2_players as string[])

        if (r.result_type === 'draw') {
          draws++; streak = 0
        } else if (
          (inTeam1 && r.result_type === 'team1_win') ||
          (!inTeam1 && r.result_type === 'team2_win')
        ) {
          wins++
          streak++
          if (streak > bestStreak) bestStreak = streak
          for (const pid of teammates) {
            if (pid !== userId) {
              partnerWins[pid] = (partnerWins[pid] ?? 0) + 1
            }
          }
        } else {
          losses++; streak = 0
        }
      }

      const total = results.length
      const winRate = total > 0 ? Math.round((wins / total) * 100) : 0

      // Rank position
      const topCount = rankData.count ?? 0

      // Favourite partner
      const topPartnerId = Object.entries(partnerWins).sort(([, a], [, b]) => b - a)[0]?.[0] ?? null
      let favouritePartnerName: string | null = null
      if (topPartnerId) {
        const { data: p } = await supabase
          .from('profiles')
          .select('name')
          .eq('id', topPartnerId)
          .single()
        favouritePartnerName = p?.name ?? null
      }

      return {
        totalMatches: total,
        wins,
        losses,
        draws,
        winRate,
        rankPosition: topCount + 1,
        bestStreak,
        favouritePartnerName,
      }
    },
  })
}

function useMatchHistory(userId: string, limit: number) {
  return useQuery<MatchHistoryItem[]>({
    queryKey: ['match-history', userId, limit],
    enabled: !!userId,
    queryFn: async () => {
      // Fetch matches where user is a player
      const { data: matches } = await supabase
        .from('matches')
        .select('id, match_date, player_ids')
        .contains('player_ids', [userId])
        .eq('status', 'completed')
        .order('match_date', { ascending: false })
        .limit(limit)

      if (!matches || matches.length === 0) return []

      const matchIds = matches.map((m) => m.id)
      const allPlayerIds = [...new Set(matches.flatMap((m) => m.player_ids ?? []))]

      const [{ data: resultRows }, { data: profiles }] = await Promise.all([
        supabase
          .from('match_results')
          .select('match_id, result_type, team1_players, team2_players, team1_score, team2_score')
          .in('match_id', matchIds),
        supabase
          .from('profiles')
          .select('id, name')
          .in('id', allPlayerIds),
      ])

      const resultMap = Object.fromEntries((resultRows ?? []).map((r) => [r.match_id, r]))
      const nameMap   = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.name]))

      return matches.map((m): MatchHistoryItem => {
        const r = resultMap[m.id]
        if (!r) {
          return { id: m.id, match_date: m.match_date, result_type: null, score: '—', opponents: '—' }
        }

        const inTeam1    = (r.team1_players as string[]).includes(userId)
        const opponents  = (inTeam1 ? (r.team2_players as string[]) : (r.team1_players as string[]))
          .map((pid: string) => nameMap[pid]?.split(' ')[0] ?? '?')
          .join(' & ')
        const score      = inTeam1
          ? `${r.team1_score} – ${r.team2_score}`
          : `${r.team2_score} – ${r.team1_score}`

        let resultType: 'win' | 'loss' | 'draw'
        if (r.result_type === 'draw') {
          resultType = 'draw'
        } else if (
          (inTeam1 && r.result_type === 'team1_win') ||
          (!inTeam1 && r.result_type === 'team2_win')
        ) {
          resultType = 'win'
        } else {
          resultType = 'loss'
        }

        return { id: m.id, match_date: m.match_date, result_type: resultType, score, opponents }
      })
    },
  })
}

function useAchievements(userId: string) {
  return useQuery<Achievement[]>({
    queryKey: ['achievements', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_badges')
        .select('id, badge_key, earned_at')
        .eq('user_id', userId)
        .order('earned_at', { ascending: false })
      if (error) return []
      return data ?? []
    },
  })
}

// ── Household hooks ───────────────────────────────────────────────────────────

function useHouseholdPartner(partnerId: string | null | undefined) {
  return useQuery({
    queryKey: ['household-partner', partnerId],
    enabled: !!partnerId,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, name, avatar_url')
        .eq('id', partnerId!)
        .single()
      return data as { id: string; name: string; avatar_url: string | null } | null
    },
  })
}

// ── Link Partner Sheet ────────────────────────────────────────────────────────

function LinkPartnerSheet({
  open,
  onClose,
  currentUserId,
}: {
  open: boolean
  onClose: () => void
  currentUserId: string
}) {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<{ id: string; name: string; avatar_url: string | null } | null>(null)

  const { data: results = [] } = useQuery({
    queryKey: ['profile-search', search],
    enabled: search.trim().length >= 2,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, name, avatar_url')
        .ilike('name', `%${search.trim()}%`)
        .neq('id', currentUserId)
        .limit(8)
      return (data ?? []) as { id: string; name: string; avatar_url: string | null }[]
    },
  })

  const linkMutation = useMutation({
    mutationFn: async (partnerId: string) => {
      const { error } = await supabase
        .from('profiles')
        .update({ household_partner_id: partnerId })
        .eq('id', currentUserId)
      if (error) throw error
      // Notify partner
      await supabase.from('notifications').insert({
        user_id:    partnerId,
        type:       'household_link',
        title:      'Household link request',
        message:    'Someone linked you as their household partner',
        related_id: currentUserId,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['full-profile', currentUserId] })
      setSearch('')
      setSelected(null)
      onClose()
    },
  })

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[55] bg-black/40"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-[60] bg-white rounded-t-3xl"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1 w-10 rounded-full bg-gray-200" />
            </div>
            <div className="flex items-center justify-between px-5 py-3">
              <button onClick={onClose} className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center">
                <X className="h-4 w-4 text-gray-600" />
              </button>
              <h2 className="text-[15px] font-bold text-gray-900">Link Household Partner</h2>
              <div className="w-9" />
            </div>
            <div className="px-5 pb-6" style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}>
              <p className="text-[13px] text-gray-500 mb-4">
                Search for the player you live with. They'll receive a notification.
              </p>
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setSelected(null) }}
                  placeholder="Search by name…"
                  style={{ fontSize: '16px', width: '100%', boxSizing: 'border-box' }}
                  className="w-full rounded-xl border border-gray-200 pl-9 pr-4 py-2.5 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
                />
              </div>
              {results.length > 0 && (
                <div className="space-y-1 mb-4">
                  {results.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setSelected(p)}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors',
                        selected?.id === p.id ? 'bg-teal-50 border border-teal-200' : 'bg-gray-50 border border-gray-100'
                      )}
                    >
                      <PlayerAvatar name={p.name} avatarUrl={p.avatar_url} size="sm" />
                      <span className="text-[14px] font-medium text-gray-800">{p.name}</span>
                      {selected?.id === p.id && (
                        <span className="ml-auto text-[11px] font-bold text-teal-600">Selected</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
              {linkMutation.isError && (
                <p className="text-[12px] text-red-500 text-center mb-3">Failed to link. Try again.</p>
              )}
              <button
                onClick={() => selected && linkMutation.mutate(selected.id)}
                disabled={!selected || linkMutation.isPending}
                className="w-full rounded-2xl bg-[#009688] py-3.5 text-[14px] font-bold text-white disabled:opacity-40"
              >
                {linkMutation.isPending ? 'Linking…' : 'Link Partner'}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// ── Edit Profile Sheet ────────────────────────────────────────────────────────

function EditProfileSheet({
  open,
  onClose,
  profile,
}: {
  open: boolean
  onClose: () => void
  profile: FullProfile | null
}) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [name, setName]             = useState(profile?.name ?? '')
  const [city, setCity]             = useState(profile?.city ?? '')
  const [postalCode, setPostalCode] = useState(profile?.postal_code ?? '')
  const [country, setCountry]       = useState(profile?.country ?? '')

  const COUNTRIES = ['UK', 'Ireland', 'Spain', 'Portugal', 'Italy', 'France', 'Germany', 'Netherlands', 'Belgium', 'Other']

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not authenticated')
      const { error } = await supabase
        .from('profiles')
        .update({
          name:        name.trim(),
          city:        city.trim() || null,
          postal_code: postalCode.trim() || null,
          country:     country || null,
        })
        .eq('id', user.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['full-profile', user?.id] })
      onClose()
    },
  })

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[55] bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-[60] bg-white rounded-t-3xl"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1 w-10 rounded-full bg-gray-200" />
            </div>
            <div className="flex items-center justify-between px-5 py-3">
              <button onClick={onClose} className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center">
                <X className="h-4 w-4 text-gray-600" />
              </button>
              <h2 className="text-[15px] font-bold text-gray-900">Edit Profile</h2>
              <div className="w-9" />
            </div>

            <div className="px-5 pb-6 space-y-4" style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}>
              <div>
                <label className="block text-[13px] font-medium text-gray-700 mb-1.5">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={{ fontSize: '16px', width: '100%', boxSizing: 'border-box' }}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
                />
              </div>
              <div>
                <label className="block text-[13px] font-medium text-gray-700 mb-1.5">
                  City <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="e.g. London"
                  style={{ fontSize: '16px', width: '100%', boxSizing: 'border-box' }}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
                />
              </div>
              <div>
                <label className="block text-[13px] font-medium text-gray-700 mb-1.5">
                  Postcode <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  placeholder="e.g. SW1A 1AA"
                  style={{ fontSize: '16px', width: '100%', boxSizing: 'border-box' }}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
                />
              </div>
              <div>
                <label className="block text-[13px] font-medium text-gray-700 mb-1.5">
                  Country <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  style={{ fontSize: '16px', width: '100%', boxSizing: 'border-box' }}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 bg-white"
                >
                  <option value="">Select country…</option>
                  {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {saveMutation.isError && (
                <p className="text-[12px] text-red-500 text-center">Failed to save. Try again.</p>
              )}

              <button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || !name.trim()}
                className="w-full rounded-2xl bg-[#009688] py-3.5 text-[14px] font-bold text-white disabled:opacity-40"
              >
                {saveMutation.isPending ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// ── Achievement badge labels ──────────────────────────────────────────────────

// BADGE_DEFINITIONS imported from @/lib/badges

// ── Page ──────────────────────────────────────────────────────────────────────

export function YouPage() {
  const { profile: authProfile, signOut } = useAuth()
  const userId = authProfile?.id ?? ''

  const [historyFilter, setHistoryFilter]   = useState<'all' | 'wins' | 'losses'>('all')
  const [historyLimit, setHistoryLimit]     = useState(10)
  const [showEdit, setShowEdit]             = useState(false)
  const [notifEnabled, setNotifEnabled]     = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [resetSent, setResetSent]           = useState(false)

  const [showLinkPartner, setShowLinkPartner] = useState(false)
  const queryClient = useQueryClient()

  const { data: fullProfile }           = useFullProfile(userId)
  const { data: stats, isLoading: loadingStats } = useYouStats(userId)
  const { data: history = [], isLoading: loadingHistory } = useMatchHistory(userId, historyLimit)
  const { data: achievements = [] }     = useAchievements(userId)
  const { data: householdPartner }      = useHouseholdPartner(fullProfile?.household_partner_id)
  const { t, i18n }                     = useTranslation()

  const profile = fullProfile ?? authProfile

  const filteredHistory = history.filter((m) => {
    if (historyFilter === 'wins')   return m.result_type === 'win'
    if (historyFilter === 'losses') return m.result_type === 'loss'
    return true
  })

  return (
    <div className="min-h-full bg-white pb-32">
      {/* Header */}
      <div className="px-5 pt-14 pb-4">
        <h1 className="text-[22px] font-bold text-gray-900">You</h1>
      </div>

      <div className="px-5 space-y-6">

        {/* ── Profile Card ── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-gray-100 bg-gray-50 p-4"
        >
          <div className="flex items-center gap-4">
            <PlayerAvatar
              name={profile?.name}
              avatarUrl={fullProfile?.avatar_url ?? authProfile?.avatar_url}
              size="lg"
            />
            <div className="flex-1 min-w-0">
              <h2 className="text-[18px] font-bold text-gray-900 truncate">{profile?.name ?? '—'}</h2>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {fullProfile?.city && (
                  <span className="text-[12px] text-gray-400">{fullProfile.city}</span>
                )}
                {(fullProfile?.internal_ranking ?? authProfile?.internal_ranking) != null && (
                  <span className="inline-flex items-center rounded-full bg-teal-50 border border-teal-100 px-2 py-0.5 text-[11px] font-bold text-teal-700">
                    {(fullProfile?.internal_ranking ?? authProfile?.internal_ranking)?.toLocaleString()} ELO
                  </span>
                )}
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5 truncate">{profile?.email}</p>
            </div>
          </div>
          <button
            onClick={() => setShowEdit(true)}
            className="mt-3 w-full flex items-center justify-center gap-2 rounded-xl border border-gray-200 py-2.5 text-[13px] font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <Edit2 className="h-3.5 w-3.5" />
            Edit profile
          </button>
        </motion.div>

        {/* ── Stats Summary ── */}
        <section>
          <h2 className="text-[16px] font-bold text-gray-900 mb-3">Stats</h2>
          {loadingStats ? (
            <div className="grid grid-cols-2 gap-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-16 rounded-xl bg-gray-100 animate-pulse" />
              ))}
            </div>
          ) : stats ? (
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Matches played', value: stats.totalMatches },
                { label: 'Win rate',       value: `${stats.winRate}%` },
                { label: 'Ranking',        value: `#${stats.rankPosition}` },
                { label: 'Best streak',    value: `${stats.bestStreak}W` },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-3">
                  <p className="text-[20px] font-black text-gray-900">{value}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{label}</p>
                </div>
              ))}
              {stats.favouritePartnerName && (
                <div className="col-span-2 rounded-xl bg-teal-50 border border-teal-100 px-4 py-3">
                  <p className="text-[13px] font-bold text-teal-800 truncate">{stats.favouritePartnerName}</p>
                  <p className="text-[11px] text-teal-600 mt-0.5">Favourite partner</p>
                </div>
              )}
            </div>
          ) : null}
        </section>

        {/* ── Household ── */}
        <section>
          <h2 className="text-[16px] font-bold text-gray-900 mb-3">
            <span className="inline-flex items-center gap-2">
              <Home className="h-4 w-4 text-gray-500" />
              {t('you.household')}
            </span>
          </h2>
          {householdPartner ? (
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
              <div className="flex items-center gap-3 mb-3">
                <PlayerAvatar name={householdPartner.name} avatarUrl={householdPartner.avatar_url} size="md" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-gray-400 uppercase tracking-wide mb-0.5">{t('you.household_partner')}</p>
                  <p className="text-[15px] font-bold text-gray-900 truncate">{householdPartner.name}</p>
                </div>
              </div>
              <button
                onClick={async () => {
                  await supabase.from('profiles').update({ household_partner_id: null }).eq('id', userId)
                  queryClient.invalidateQueries({ queryKey: ['full-profile', userId] })
                }}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-red-100 py-2.5 text-[13px] font-semibold text-red-500 hover:bg-red-50 transition-colors"
              >
                <Unlink className="h-4 w-4" />
                {t('you.remove_link')}
              </button>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-gray-200 p-5 text-center">
              <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                <Link className="h-5 w-5 text-gray-400" />
              </div>
              <p className="text-[14px] font-semibold text-gray-700 mb-1">Link your household partner</p>
              <p className="text-[12px] text-gray-400 mb-4">{t('you.link_partner_sub')}</p>
              <button
                onClick={() => setShowLinkPartner(true)}
                className="rounded-xl bg-[#009688] px-5 py-2.5 text-[13px] font-bold text-white"
              >
                {t('you.link_partner')}
              </button>
            </div>
          )}
        </section>

        {/* ── Match History ── */}
        <section>
          <h2 className="text-[16px] font-bold text-gray-900 mb-3">Match history</h2>

          {/* Filter tabs */}
          <div className="flex bg-gray-100 rounded-xl p-1 gap-1 mb-3">
            {(['all', 'wins', 'losses'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setHistoryFilter(f)}
                className={cn(
                  'flex-1 rounded-lg py-2 text-[12px] font-semibold capitalize transition-colors',
                  historyFilter === f ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                )}
              >
                {f}
              </button>
            ))}
          </div>

          {loadingHistory ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-14 rounded-xl bg-gray-100 animate-pulse" />
              ))}
            </div>
          ) : filteredHistory.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 p-6 text-center">
              <p className="text-[13px] font-semibold text-gray-500">No matches found</p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {filteredHistory.map((m) => {
                  const dateStr = (() => {
                    try { return format(parseISO(m.match_date), 'd MMM yyyy') } catch { return m.match_date }
                  })()
                  return (
                    <div key={m.id} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5">
                      <span className={cn(
                        'flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold capitalize',
                        m.result_type === 'win'  ? 'bg-green-50 text-green-700 border border-green-100' :
                        m.result_type === 'loss' ? 'bg-red-50 text-red-500 border border-red-100'       :
                                                   'bg-gray-100 text-gray-500 border border-gray-200'
                      )}>
                        {m.result_type ?? '—'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-semibold text-gray-800 truncate">vs {m.opponents}</p>
                        <p className="text-[11px] text-gray-400">{dateStr}</p>
                      </div>
                      <span className="text-[13px] font-bold text-gray-700 flex-shrink-0">{m.score}</span>
                    </div>
                  )
                })}
              </div>
              {history.length >= historyLimit && (
                <button
                  onClick={() => setHistoryLimit((l) => l + 10)}
                  className="mt-3 w-full rounded-xl border border-gray-200 py-2.5 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Load more
                </button>
              )}
            </>
          )}
        </section>

        {/* ── Achievements ── */}
        {achievements.length > 0 && (
          <section>
            <h2 className="text-[16px] font-bold text-gray-900 mb-3">Achievements</h2>
            <div className="grid grid-cols-3 gap-2">
              {achievements.map((a) => {
                const meta = BADGE_DEFINITIONS[a.badge_key] ?? { label: a.badge_key, emoji: '🏅' }
                return (
                  <div key={a.id} className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-center">
                    <p className="text-[24px] leading-none mb-1">{meta.emoji}</p>
                    <p className="text-[11px] font-semibold text-gray-700 leading-tight">{meta.label}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {(() => { try { return format(parseISO(a.earned_at), 'd MMM') } catch { return '' } })()}
                    </p>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* ── Settings ── */}
        <section>
          <h2 className="text-[16px] font-bold text-gray-900 mb-3">Settings</h2>
          <div className="rounded-2xl border border-gray-100 overflow-hidden divide-y divide-gray-50">

            {/* Push notifications toggle */}
            <div className="flex items-center justify-between px-4 py-3.5">
              <span className="text-[13px] font-medium text-gray-700">Push notifications</span>
              <button
                onClick={async () => {
                  if (!notifEnabled) {
                    if (typeof Notification !== 'undefined') {
                      const perm = await Notification.requestPermission()
                      if (perm === 'granted') setNotifEnabled(true)
                    }
                  } else {
                    setNotifEnabled(false)
                  }
                }}
                className={cn(
                  'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                  notifEnabled ? 'bg-[#009688]' : 'bg-gray-200'
                )}
                aria-label="Toggle notifications"
              >
                <span className={cn(
                  'inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
                  notifEnabled ? 'translate-x-6' : 'translate-x-1'
                )} />
              </button>
            </div>

            {/* Language */}
            <div className="px-4 py-3.5">
              <span className="text-[13px] font-medium text-gray-700 block mb-2">{t('you.language')}</span>
              <div className="flex gap-2">
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={async () => {
                      setLanguage(lang.code)
                      await supabase.from('profiles').update({ preferred_language: lang.code }).eq('id', userId)
                    }}
                    className={cn(
                      'flex-1 rounded-lg py-1.5 text-[12px] font-semibold border transition-colors',
                      i18n.language === lang.code
                        ? 'bg-[#009688] text-white border-[#009688]'
                        : 'bg-white text-gray-600 border-gray-200'
                    )}
                  >
                    {lang.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Password reset */}
            <button
              onClick={async () => {
                const email = authProfile?.email
                if (!email) return
                await supabase.auth.resetPasswordForEmail(email)
                setResetSent(true)
                setTimeout(() => setResetSent(false), 4000)
              }}
              className="w-full flex items-center justify-between px-4 py-3.5"
            >
              <span className="text-[13px] font-medium text-gray-700">
                {resetSent ? 'Reset email sent ✓' : 'Reset password'}
              </span>
              <ChevronRight className="h-4 w-4 text-gray-400" />
            </button>

            {/* Privacy Policy */}
            <button
              onClick={() => window.open('https://padelplayersapp.com/privacy', '_blank')}
              className="w-full flex items-center justify-between px-4 py-3.5"
            >
              <span className="text-[13px] font-medium text-gray-700">Privacy Policy</span>
              <ChevronRight className="h-4 w-4 text-gray-400" />
            </button>

            {/* Terms of Service */}
            <button
              onClick={() => window.open('https://padelplayersapp.com/terms', '_blank')}
              className="w-full flex items-center justify-between px-4 py-3.5"
            >
              <span className="text-[13px] font-medium text-gray-700">Terms of Service</span>
              <ChevronRight className="h-4 w-4 text-gray-400" />
            </button>

            {/* Delete account */}
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full flex items-center justify-between px-4 py-3.5"
            >
              <span className="text-[13px] font-medium text-red-500">Delete Account</span>
              <ChevronRight className="h-4 w-4 text-red-300" />
            </button>
          </div>

          {/* App version */}
          <p className="text-[11px] text-gray-300 text-center mt-3">PPA v2.0.0</p>

          {/* Sign out */}
          <button
            onClick={signOut}
            className="mt-4 w-full flex items-center justify-center gap-2 rounded-2xl border border-red-100 py-3.5 text-[14px] font-semibold text-red-500 hover:bg-red-50 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </section>

        {/* Delete account confirmation dialog */}
        <AnimatePresence>
          {showDeleteConfirm && (
            <>
              <motion.div
                className="fixed inset-0 z-[55] bg-black/50"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setShowDeleteConfirm(false)}
              />
              <motion.div
                className="fixed inset-x-5 top-1/2 -translate-y-1/2 z-[60] bg-white rounded-2xl p-6 shadow-xl"
                initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              >
                <h3 className="text-[17px] font-bold text-gray-900 text-center mb-2">Delete Account</h3>
                <p className="text-[13px] text-gray-500 text-center mb-5">
                  This will permanently delete your account and all your data. This cannot be undone.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="flex-1 rounded-xl border border-gray-200 py-3 text-[13px] font-semibold text-gray-700"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      setShowDeleteConfirm(false)
                      try {
                        const { error } = await supabase.rpc('delete_user')
                        if (error) throw error
                      } catch { /* proceed to sign out regardless */ }
                      await signOut()
                    }}
                    className="flex-1 rounded-xl bg-red-500 py-3 text-[13px] font-bold text-white"
                  >
                    Delete
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      <EditProfileSheet
        open={showEdit}
        onClose={() => setShowEdit(false)}
        profile={fullProfile ?? null}
      />

      <LinkPartnerSheet
        open={showLinkPartner}
        onClose={() => setShowLinkPartner(false)}
        currentUserId={userId}
      />
    </div>
  )
}
