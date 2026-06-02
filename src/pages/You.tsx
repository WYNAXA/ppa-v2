import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ChevronLeft, Edit2, LogOut, ChevronRight, Home, Search, Link, Unlink } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { useDateLocale } from '@/lib/dateLocale'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import imageCompression from 'browser-image-compression'
import * as Sentry from '@sentry/react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PlayerAvatar } from '@/components/shared/PlayerAvatar'
import { BADGE_DEFINITIONS, PEER_VOTE_CATEGORIES } from '@/lib/achievements'
import { setLanguage, SUPPORTED_LANGUAGES } from '@/i18n'
import { cn } from '@/lib/utils'
import { RewardsCard } from '@/components/rewards/RewardsCard'
import { subscribeToPush, unsubscribeFromPush } from '@/lib/push'
import { EloHistoryChart } from '@/components/compete/EloHistoryChart'

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
  show_email: boolean | null
  show_location: boolean | null
  public_history: boolean | null
  account_type: string | null
  is_verified: boolean | null
  push_token: string | null
  is_provisional: boolean | null
  matches_played: number | null
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
        .select('id, name, email, city, postal_code, country, avatar_url, internal_ranking, ranking_points, household_partner_id, is_provisional, matches_played, show_email, show_location, public_history, account_type, is_verified, push_token')
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

function useVerifiedVoteCounts(userId: string) {
  return useQuery<{ category: string; vote_count: number }[]>({
    queryKey: ['peer-vote-totals', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_verified_peer_vote_counts', { p_user_id: userId })
      if (error) return []
      return (data ?? []).map((r: Record<string, unknown>) => ({
        category: r.category as string,
        vote_count: Number(r.vote_count),
      }))
    },
  })
}

function useEntertainerTitles(userId: string) {
  return useQuery<number>({
    queryKey: ['entertainer-titles', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { count } = await supabase
        .from('entertainer_jersey_history')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
      return count ?? 0
    },
  })
}

function useCurrentEntertainer(userId: string) {
  return useQuery<boolean>({
    queryKey: ['current-entertainer', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { count } = await supabase
        .from('league_jerseys')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('jersey_color', 'blue')
      return (count ?? 0) > 0
    },
  })
}

// ── Admin groups hook ─────────────────────────────────────────────────────────

function useAdminGroups(userId: string) {
  return useQuery({
    queryKey: ['admin-groups', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from('group_members')
        .select('group_id, groups:group_id(id, name)')
        .eq('user_id', userId)
        .eq('role', 'admin')
        .eq('status', 'approved')
      return (data ?? []) as unknown as Array<{ group_id: string; groups: { id: string; name: string } | null }>
    },
  })
}

// ── My Rewards hook ───────────────────────────────────────────────────────────

interface MyRewardsVenue {
  venueId: string
  venueName: string
  stampCount: number
  lifetimeStamps: number
}

function useMyRewards(userId: string) {
  return useQuery<MyRewardsVenue[]>({
    queryKey: ['my-rewards-venues', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data: wallets } = await supabase
        .from('user_venue_stamps')
        .select('venue_id, stamp_count, lifetime_stamps')
        .eq('user_id', userId)
        .gt('stamp_count', 0)

      if (!wallets || wallets.length === 0) return []

      const venueIds = wallets.map((w) => w.venue_id as string)
      const { data: venues } = await supabase
        .from('padel_venues')
        .select('venue_id, venue_name')
        .in('venue_id', venueIds)

      const venueMap = Object.fromEntries(
        (venues ?? []).map((v) => [v.venue_id, v])
      )

      return wallets.map((w) => ({
        venueId:        w.venue_id as string,
        venueName:      venueMap[w.venue_id as string]?.venue_name ?? 'Unknown venue',
        stampCount:     w.stamp_count as number,
        lifetimeStamps: w.lifetime_stamps as number,
      }))
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
  const { t } = useTranslation()
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
      // Link both directions
      const { error: e1 } = await supabase.from('profiles')
        .update({ household_partner_id: partnerId }).eq('id', currentUserId)
      if (e1) throw e1
      await supabase.from('profiles')
        .update({ household_partner_id: currentUserId }).eq('id', partnerId)
      // Notify partner
      await supabase.from('notifications').insert({
        user_id:    partnerId,
        type:       'household_link',
        title:      t('you.notif_household_request_title'),
        message:    t('you.notif_household_request_msg'),
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
              <h2 className="text-[15px] font-bold text-gray-900">{t('you.link_household_title')}</h2>
              <div className="w-9" />
            </div>
            <div className="px-5 pb-6" style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}>
              <p className="text-[13px] text-gray-500 mb-4">
                {t('you.link_household_search_help')}
              </p>
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setSelected(null) }}
                  placeholder={t('you.search_by_name')}
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
                        <span className="ml-auto text-[11px] font-bold text-teal-600">{t('you.search_selected')}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
              {linkMutation.isError && (
                <p className="text-[12px] text-red-500 text-center mb-3">{t('you.link_failed')}</p>
              )}
              <button
                onClick={() => selected && linkMutation.mutate(selected.id)}
                disabled={!selected || linkMutation.isPending}
                className="w-full rounded-2xl bg-[#009688] py-3.5 text-[14px] font-bold text-white disabled:opacity-40"
              >
                {linkMutation.isPending ? t('you.linking') : t('you.link_partner_btn')}
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
  const { t } = useTranslation()
  const [name, setName]             = useState(profile?.name ?? '')
  const [city, setCity]             = useState(profile?.city ?? '')
  const [postalCode, setPostalCode] = useState(profile?.postal_code ?? '')
  const [country, setCountry]       = useState(profile?.country ?? '')
  const [canDrive, setCanDrive]     = useState<boolean>(!!(profile as any)?.can_drive)
  const [maxPassengers, setMaxPassengers] = useState<number>((profile as any)?.max_passengers ?? 3)
  const [travelRadius, setTravelRadius]   = useState<number>((profile as any)?.travel_radius_miles ?? 5)
  const [locating, setLocating]     = useState(false)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [uploading, setUploading]   = useState(false)
  const fileInputRef                = useRef<HTMLInputElement>(null)

  // Sync form when profile loads asynchronously
  useEffect(() => {
    if (!profile) return
    setName(profile.name ?? '')
    setCity(profile.city ?? '')
    setPostalCode(profile.postal_code ?? '')
    setCountry(profile.country ?? '')
    setCanDrive(!!(profile as any).can_drive)
    setMaxPassengers((profile as any).max_passengers ?? 3)
    setTravelRadius((profile as any).travel_radius_miles ?? 5)
  }, [profile?.id])

  const COUNTRIES = ['UK', 'Ireland', 'Spain', 'Portugal', 'Italy', 'France', 'Germany', 'Netherlands', 'Belgium', 'Other']

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !user) return
    if (!file.type.startsWith('image/')) {
      toast.error(t('you.avatar_invalid_type'))
      return
    }
    const preview = URL.createObjectURL(file)
    setAvatarPreview(preview)
    setUploading(true)
    try {
      const compressed = await imageCompression(file, {
        maxSizeMB: 1,
        maxWidthOrHeight: 800,
        useWebWorker: true,
        fileType: 'image/jpeg',
      })
      const path = `${user.id}/avatar.jpg`
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, compressed, { upsert: true, contentType: 'image/jpeg' })
      if (uploadError) throw uploadError
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
      await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', user.id)
      queryClient.invalidateQueries({ queryKey: ['full-profile', user.id] })
      toast.success(t('you.avatar_uploaded'))
    } catch (err) {
      console.error('[Avatar] upload error:', err)
      setAvatarPreview(null)
      toast.error(t('you.avatar_upload_failed'))
    } finally {
      setUploading(false)
    }
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error(t('you.not_authenticated'))
      const { error } = await supabase
        .from('profiles')
        .update({
          name:                name.trim(),
          city:                city.trim() || null,
          postal_code:         postalCode.trim() || null,
          country:             country || null,
          can_drive:           canDrive,
          max_passengers:      maxPassengers,
          travel_radius_miles: travelRadius,
        })
        .eq('id', user.id)
      console.log('[Profile save] user.id:', user.id, 'error:', error)
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
              <button onClick={onClose} className="flex items-center gap-1.5 text-[13px] font-semibold text-gray-600">
                <ChevronLeft className="h-4 w-4" />
                Back
              </button>
              <h2 className="text-[15px] font-bold text-gray-900">{t('you.edit_profile_title')}</h2>
              <div className="w-14" />
            </div>

            <div className="px-5 pb-6 space-y-4" style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}>
              {/* Avatar picker */}
              <div className="flex flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="relative"
                  disabled={uploading}
                >
                  {avatarPreview || profile?.avatar_url ? (
                    <img
                      src={avatarPreview ?? profile!.avatar_url!}
                      alt="avatar"
                      className="h-20 w-20 rounded-full object-cover border-2 border-gray-200"
                    />
                  ) : (
                    <div className="h-20 w-20 rounded-full bg-gray-200 flex items-center justify-center text-[28px] font-bold text-gray-500">
                      {(profile?.name ?? '?')[0].toUpperCase()}
                    </div>
                  )}
                  <span className="absolute bottom-0 right-0 h-6 w-6 rounded-full bg-[#009688] border-2 border-white flex items-center justify-center">
                    <Edit2 className="h-3 w-3 text-white" />
                  </span>
                </button>
                <p className="text-[11px] text-gray-400">{uploading ? t('you.uploading') : t('you.tap_change_photo')}</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
              </div>

              <div>
                <label className="block text-[13px] font-medium text-gray-700 mb-1.5">{t('you.name_label')}</label>
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
                  {t('you.city_label')}
                </label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder={t('you.city_placeholder')}
                  style={{ fontSize: '16px', width: '100%', boxSizing: 'border-box' }}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
                />
              </div>
              <div>
                <label className="block text-[13px] font-medium text-gray-700 mb-1.5">
                  {t('you.postal_code_label')}
                </label>
                <input
                  type="text"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  placeholder={t('you.postal_code_placeholder')}
                  style={{ fontSize: '16px', width: '100%', boxSizing: 'border-box' }}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
                />
              </div>
              <div>
                <label className="block text-[13px] font-medium text-gray-700 mb-1.5">
                  {t('you.country_label')}
                </label>
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  style={{ fontSize: '16px', width: '100%', boxSizing: 'border-box' }}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 bg-white"
                >
                  <option value="">{t('you.country_placeholder')}</option>
                  {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* Travel preferences */}
              <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 space-y-3">
                <p className="text-[12px] font-bold text-gray-500 uppercase tracking-wide">{t('you.travel_preferences')}</p>

                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-gray-700">{t('you.i_have_a_car')}</span>
                  <button
                    type="button"
                    onClick={() => setCanDrive((v) => !v)}
                    className={cn('relative inline-flex h-6 w-11 items-center rounded-full transition-colors', canDrive ? 'bg-[#009688]' : 'bg-gray-200')}
                  >
                    <span className={cn('inline-block h-4 w-4 rounded-full bg-white shadow transition-transform', canDrive ? 'translate-x-6' : 'translate-x-1')} />
                  </button>
                </div>

                {canDrive && (
                  <>
                    <div>
                      <label className="text-[12px] text-gray-500 block mb-1.5">Max passengers: {maxPassengers}</label>
                      <input
                        type="range"
                        min={1}
                        max={4}
                        value={maxPassengers}
                        onChange={(e) => setMaxPassengers(Number(e.target.value))}
                        className="w-full accent-[#009688]"
                      />
                      <div className="flex justify-between text-[10px] text-gray-300">
                        <span>1</span><span>2</span><span>3</span><span>4</span>
                      </div>
                    </div>

                    <div>
                      <label className="text-[12px] text-gray-500 block mb-1.5">Pick-up radius: {travelRadius} miles</label>
                      <input
                        type="range"
                        min={1}
                        max={20}
                        value={travelRadius}
                        onChange={(e) => setTravelRadius(Number(e.target.value))}
                        className="w-full accent-[#009688]"
                      />
                      <div className="flex justify-between text-[10px] text-gray-300">
                        <span>1 mi</span><span>20 mi</span>
                      </div>
                    </div>
                  </>
                )}

                <button
                  type="button"
                  disabled={locating}
                  onClick={() => {
                    if (!navigator.geolocation || !user) return
                    setLocating(true)
                    navigator.geolocation.getCurrentPosition(
                      async (pos) => {
                        await supabase.from('profiles').update({
                          latitude:  pos.coords.latitude,
                          longitude: pos.coords.longitude,
                        }).eq('id', user.id)
                        setLocating(false)
                        queryClient.invalidateQueries({ queryKey: ['full-profile', user.id] })
                      },
                      () => setLocating(false),
                    )
                  }}
                  className="w-full rounded-xl border border-gray-200 bg-white py-2 text-[12px] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors"
                >
                  {locating ? t('you.getting_location') : t('you.use_current_location')}
                </button>
              </div>

              {saveMutation.isError && (
                <p className="text-[12px] text-red-500 text-center">{t('you.save_failed')}</p>
              )}

              <button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="w-full rounded-2xl bg-[#009688] py-3.5 text-[14px] font-bold text-white disabled:opacity-40"
              >
                {saveMutation.isPending ? t('you.saving') : t('you.save_changes')}
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
  const navigate = useNavigate()
  const userId = authProfile?.id ?? ''

  const locale = useDateLocale()
  const [historyFilter, setHistoryFilter]   = useState<'all' | 'wins' | 'losses'>('all')
  const [historyLimit, setHistoryLimit]     = useState(10)
  const [showEdit, setShowEdit]             = useState(false)
  const [notifEnabled, setNotifEnabled]     = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1)
  const [deleteTyped, setDeleteTyped] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [iosHint, setIosHint] = useState(false)
  const [resetSent, setResetSent]           = useState(false)

  const [showLinkPartner, setShowLinkPartner] = useState(false)
  const queryClient = useQueryClient()

  // Section refs for nav chips + hero tiles
  const statsRef = useRef<HTMLElement>(null)
  const ratingRef = useRef<HTMLElement>(null)
  const householdRef = useRef<HTMLElement>(null)
  const matchHistoryRef = useRef<HTMLElement>(null)
  const achievementsRef = useRef<HTMLElement>(null)
  const settingsRef = useRef<HTMLElement>(null)
  const favPartnersRef = useRef<HTMLElement>(null)

  const { data: fullProfile }           = useFullProfile(userId)

  // Persist push notification toggle from actual state
  useEffect(() => {
    if (!fullProfile) return
    const hasBrowserPermission = typeof Notification !== 'undefined' && Notification.permission === 'granted'
    const hasToken = !!fullProfile.push_token
    setNotifEnabled(hasBrowserPermission && hasToken)
  }, [fullProfile])
  const { data: stats, isLoading: loadingStats } = useYouStats(userId)
  const { data: history = [], isLoading: loadingHistory } = useMatchHistory(userId, historyLimit)
  const { data: achievements = [] }     = useAchievements(userId)
  const { data: voteCounts = [] }       = useVerifiedVoteCounts(userId)
  const { data: entertainerTitles = 0 } = useEntertainerTitles(userId)
  const { data: isCurrentEntertainer = false } = useCurrentEntertainer(userId)
  const { data: householdPartner }      = useHouseholdPartner(fullProfile?.household_partner_id)
  const { data: adminGroups = [] }      = useAdminGroups(userId)
  const { data: myRewards = [] }        = useMyRewards(userId)
  const { t, i18n }                     = useTranslation()

  const profile = fullProfile ?? authProfile

  // Hero derived data
  const achievementsCount = achievements.length
  const topAchievements = achievements.slice(0, 3).map((a) => a.badge_key)
  const favPartner = stats?.favouritePartnerName ? { name: stats.favouritePartnerName, avatar_url: null as string | null } : null

  const filteredHistory = history.filter((m) => {
    if (historyFilter === 'wins')   return m.result_type === 'win'
    if (historyFilter === 'losses') return m.result_type === 'loss'
    return true
  })

  return (
    <div className="min-h-full bg-white pb-32">
      {/* Header */}
      <div className="px-5 pt-14 pb-4 sticky top-0 bg-white/95 backdrop-blur-sm z-10 border-b border-gray-50">
        <h1 className="text-[22px] font-bold text-gray-900">{t('you.title')}</h1>
      </div>

      <div className="px-5 space-y-6">

        {/* ── Hero Card — navy gradient, identity-focused ── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-3xl shadow-lg"
          style={{ background: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 50%, #3b82f6 100%)' }}
        >
          <div className="absolute -top-12 -right-12 h-40 w-40 rounded-full opacity-20" style={{ background: 'radial-gradient(circle, white 0%, transparent 70%)' }} />

          <button
            onClick={() => setShowEdit(true)}
            className="absolute top-4 right-4 z-10 h-9 w-9 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center hover:bg-white/25 transition-colors"
            aria-label={t('you.edit_profile_aria')}
          >
            <Edit2 className="h-3.5 w-3.5 text-white" />
          </button>

          <div className="px-5 pt-6 pb-5">
            <div className="flex items-start gap-4">
              <PlayerAvatar
                name={profile?.name}
                avatarUrl={fullProfile?.avatar_url ?? authProfile?.avatar_url}
                size="lg"
              />
              <div className="flex-1 min-w-0 pt-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-[20px] font-bold text-white truncate">
                    {profile?.name || authProfile?.email?.split('@')[0] || '—'}
                  </h2>
                  {fullProfile?.account_type === 'coach' && (
                    <span className="rounded-full bg-white/20 backdrop-blur-sm px-2 py-0.5 text-[10px] font-bold text-white">🎾 Coach</span>
                  )}
                  {fullProfile?.account_type === 'venue_manager' && (
                    <span className="rounded-full bg-white/20 backdrop-blur-sm px-2 py-0.5 text-[10px] font-bold text-white">🏟️ Venue</span>
                  )}
                  {fullProfile?.account_type === 'organiser' && (
                    <span className="rounded-full bg-white/20 backdrop-blur-sm px-2 py-0.5 text-[10px] font-bold text-white">🏆 Organiser</span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  {fullProfile?.city && (
                    <span className="text-[12px] text-white/70">{fullProfile.city}</span>
                  )}
                  {(fullProfile?.internal_ranking ?? authProfile?.internal_ranking) != null && (
                    <span className="inline-flex items-center rounded-full bg-white/15 backdrop-blur-sm px-2 py-0.5 text-[11px] font-bold text-white">
                      {(fullProfile?.internal_ranking ?? authProfile?.internal_ranking)?.toLocaleString()} ELO
                      {fullProfile?.is_provisional && (
                        <span className="ml-1 text-white/60 font-normal">(provisional)</span>
                      )}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Identity grid — 3 tiles */}
            <div className="grid grid-cols-3 gap-2 mt-5">
              <button
                onClick={() => achievementsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className="rounded-2xl bg-white/10 backdrop-blur-sm px-3 py-3 hover:bg-white/15 transition-colors text-left"
              >
                <div className="flex items-center gap-1 mb-1">
                  {topAchievements.length > 0
                    ? topAchievements.map((badgeKey, i) => (
                        <span key={i} className="text-[15px]">{BADGE_DEFINITIONS[badgeKey]?.emoji ?? '🏅'}</span>
                      ))
                    : <span className="text-[15px] opacity-50">🏅</span>
                  }
                </div>
                <p className="text-[18px] font-bold text-white leading-tight">{achievementsCount}</p>
                <p className="text-[10px] text-white/60 leading-tight mt-0.5">{t('you.achievements_count_label')}</p>
              </button>

              <button
                onClick={() => favPartnersRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className="rounded-2xl bg-white/10 backdrop-blur-sm px-3 py-3 hover:bg-white/15 transition-colors text-left"
              >
                <div className="mb-1 h-[15px]">
                  {favPartner
                    ? <div className="h-[15px] w-[15px] rounded-full bg-white/20 flex items-center justify-center"><span className="text-[9px] font-bold text-white">{favPartner.name?.charAt(0)?.toUpperCase() ?? '?'}</span></div>
                    : <span className="text-[15px] opacity-50">👥</span>
                  }
                </div>
                <p className="text-[13px] font-bold text-white leading-tight truncate">
                  {favPartner?.name?.split(' ')[0] ?? '—'}
                </p>
                <p className="text-[10px] text-white/60 leading-tight mt-0.5">{t('you.fav_partner_label')}</p>
              </button>

              <button
                onClick={() => householdRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className="rounded-2xl bg-white/10 backdrop-blur-sm px-3 py-3 hover:bg-white/15 transition-colors text-left"
              >
                <div className="mb-1 h-[15px]">
                  {householdPartner
                    ? <Link className="h-[15px] w-[15px] text-white" />
                    : <Unlink className="h-[15px] w-[15px] text-white/50" />
                  }
                </div>
                <p className="text-[13px] font-bold text-white leading-tight truncate">
                  {householdPartner?.name?.split(' ')[0] ?? t('you.link_partner_short')}
                </p>
                <p className="text-[10px] text-white/60 leading-tight mt-0.5">{t('you.household_label')}</p>
              </button>
            </div>
          </div>
        </motion.div>

        {/* Section nav chips */}
        <div className="-mx-5 px-5 overflow-x-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}>
          <div className="flex gap-2 pb-1">
            {[
              { key: 'stats', label: t('you.stats'), ref: statsRef },
              { key: 'rating', label: t('you.rating_history'), ref: ratingRef },
              { key: 'household', label: t('you.household'), ref: householdRef },
              { key: 'matches', label: t('you.match_history'), ref: matchHistoryRef },
              { key: 'achievements', label: t('you.achievements'), ref: achievementsRef },
              { key: 'settings', label: t('you.settings'), ref: settingsRef },
            ].map(({ key, label, ref }) => (
              <button
                key={key}
                onClick={() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className="rounded-full bg-gray-100 border border-gray-200 px-4 py-2 text-[12px] font-semibold text-gray-700 whitespace-nowrap hover:bg-gray-200 transition-colors"
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Stats Summary ── */}
        <section ref={statsRef} style={{ scrollMarginTop: '80px' }}>
          <h2 className="text-[16px] font-bold text-gray-900 mb-3">{t('you.stats')}</h2>
          {loadingStats ? (
            <div className="grid grid-cols-2 gap-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-16 rounded-xl bg-gray-100 animate-pulse" />
              ))}
            </div>
          ) : stats ? (
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: t('you.matches_played'), value: stats.totalMatches },
                { label: t('you.win_rate'),        value: `${stats.winRate}%` },
                { label: t('you.ranking'),         value: `#${stats.rankPosition}` },
                { label: t('you.best_streak'),     value: `${stats.bestStreak}W` },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-3">
                  <p className="text-[20px] font-black text-gray-900">{value}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{label}</p>
                </div>
              ))}
              {stats.favouritePartnerName && (
                <div ref={favPartnersRef as React.RefObject<HTMLDivElement>} className="col-span-2 rounded-xl bg-teal-50 border border-teal-100 px-4 py-3" style={{ scrollMarginTop: '80px' }}>
                  <p className="text-[13px] font-bold text-teal-800 truncate">{stats.favouritePartnerName}</p>
                  <p className="text-[11px] text-teal-600 mt-0.5">{t('you.favourite_partner')}</p>
                </div>
              )}
            </div>
          ) : null}
        </section>

        {/* ── Rating History ── */}
        {userId && (
          <section ref={ratingRef} className="pb-2" style={{ scrollMarginTop: '80px' }}>
            <h2 className="text-[16px] font-bold text-gray-900 mb-3">{t('you.rating_history')}</h2>
            <EloHistoryChart userId={userId} />
          </section>
        )}

        {/* ── My Rewards ── */}
        {myRewards.length > 0 && (
          <section className="pb-2">
            <h2 className="text-[16px] font-bold text-gray-900 mb-3">{t('you.my_rewards')}</h2>
            <div className="space-y-3">
              {myRewards.map((venue) => (
                <RewardsCard
                  key={venue.venueId}
                  venueId={venue.venueId}
                  venueName={venue.venueName}
                  userId={userId}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── Household ── */}
        <section ref={householdRef} style={{ scrollMarginTop: '80px' }}>
          <h2 className="text-[16px] font-bold text-gray-900 mb-1">
            <span className="inline-flex items-center gap-2">
              <Home className="h-4 w-4 text-gray-500" />
              {t('you.household')}
            </span>
          </h2>
          <p className="text-[12px] text-gray-400 mb-3 leading-relaxed">{t('you.household_description')}</p>
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
                  if (householdPartner?.id) {
                    await supabase.from('profiles').update({ household_partner_id: null }).eq('id', householdPartner.id)
                  }
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
              <p className="text-[14px] font-semibold text-gray-700 mb-1">{t('you.link_partner')}</p>
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
        <section ref={matchHistoryRef} style={{ scrollMarginTop: '80px' }}>
          <h2 className="text-[16px] font-bold text-gray-900 mb-3">{t('you.match_history')}</h2>

          {/* Filter tabs */}
          <div className="flex bg-gray-100 rounded-xl p-1 gap-1 mb-3">
            {([
              ['all',    t('you.history_all')],
              ['wins',   t('you.wins')],
              ['losses', t('you.history_losses')],
            ] as const).map(([f, label]) => (
              <button
                key={f}
                onClick={() => setHistoryFilter(f)}
                className={cn(
                  'flex-1 rounded-lg py-2 text-[12px] font-semibold capitalize transition-colors',
                  historyFilter === f ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                )}
              >
                {label}
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
              <p className="text-[13px] font-semibold text-gray-500">{t('you.no_matches_found')}</p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {filteredHistory.map((m) => {
                  const dateStr = (() => {
                    try { return format(parseISO(m.match_date), 'd MMM yyyy', { locale }) } catch { return m.match_date }
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
                  {t('you.load_more')}
                </button>
              )}
            </>
          )}
        </section>

        {/* ── Achievements ── */}
        {achievements.length > 0 && (
          <section ref={achievementsRef} style={{ scrollMarginTop: '80px' }}>
            <h2 className="text-[16px] font-bold text-gray-900 mb-3">{t('you.achievements')}</h2>
            <div className="grid grid-cols-3 gap-2">
              {achievements.map((a) => {
                const meta = {
                  label: t(`achievements.${a.badge_key}`, { defaultValue: BADGE_DEFINITIONS[a.badge_key]?.label ?? a.badge_key }),
                  emoji: BADGE_DEFINITIONS[a.badge_key]?.emoji ?? '🏅',
                }
                return (
                  <div key={a.id} className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-center">
                    <p className="text-[24px] leading-none mb-1">{meta.emoji}</p>
                    <p className="text-[11px] font-semibold text-gray-700 leading-tight">{meta.label}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {(() => { try { return format(parseISO(a.earned_at), 'd MMM', { locale }) } catch { return '' } })()}
                    </p>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* ── Peer vote totals ── */}
        {voteCounts.length > 0 && (
          <section>
            <h2 className="text-[16px] font-bold text-gray-900 mb-3">Peer votes received</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {PEER_VOTE_CATEGORIES.map((cat) => {
                const count = voteCounts.find(v => v.category === cat.id)?.vote_count ?? 0
                if (count === 0) return null
                const tier = count >= 40 ? 'gold' : count >= 15 ? 'silver' : count >= 5 ? 'bronze' : null
                const tierColors: Record<string, string> = {
                  gold: 'border-amber-200 bg-amber-50',
                  silver: 'border-gray-200 bg-gray-50',
                  bronze: 'border-orange-200 bg-orange-50',
                }
                const tierLabel: Record<string, string> = { gold: 'Gold', silver: 'Silver', bronze: 'Bronze' }
                return (
                  <div key={cat.id} className={`rounded-xl border p-3 text-center ${tier ? tierColors[tier] : 'border-gray-100 bg-gray-50'}`}>
                    <p className="text-[20px] leading-none mb-1">{cat.emoji}</p>
                    <p className="text-[18px] font-extrabold text-gray-800">{count}</p>
                    <p className="text-[10px] font-semibold text-gray-500 leading-tight mt-0.5">{cat.name}</p>
                    {tier && (
                      <p className={`text-[9px] font-bold mt-1 uppercase tracking-wide ${
                        tier === 'gold' ? 'text-amber-600' : tier === 'silver' ? 'text-gray-500' : 'text-orange-600'
                      }`}>{tierLabel[tier]}</p>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* ── Entertainer jersey ── */}
        {(isCurrentEntertainer || entertainerTitles > 0) && (
          <section>
            <h2 className="text-[16px] font-bold text-gray-900 mb-3">Entertainer</h2>
            <div className="rounded-xl border border-blue-100 bg-blue-50/40 px-4 py-3 flex items-center gap-3">
              <span className="text-[22px]">🔵</span>
              <div className="flex-1 min-w-0">
                {isCurrentEntertainer ? (
                  <p className="text-[13px] font-bold text-blue-700">Current holder</p>
                ) : (
                  <p className="text-[13px] font-semibold text-gray-600">Previously held</p>
                )}
                <p className="text-[11px] text-gray-500">
                  {entertainerTitles} {entertainerTitles === 1 ? 'title' : 'titles'} won
                </p>
              </div>
            </div>
          </section>
        )}

        {/* ── Settings ── */}
        <section ref={settingsRef} style={{ scrollMarginTop: '80px' }}>
          <h2 className="text-[16px] font-bold text-gray-900 mb-3">{t('you.settings')}</h2>
          <div className="rounded-2xl border border-gray-100 overflow-hidden divide-y divide-gray-50">

            {/* Push notifications toggle */}
            <div className="flex items-center justify-between px-4 py-3.5">
              <span className="text-[13px] font-medium text-gray-700">{t('you.push_notifications')}</span>
              <button
                onClick={async () => {
                  if (notifEnabled) {
                    await unsubscribeFromPush(userId)
                    setNotifEnabled(false)
                    return
                  }
                  const result = await subscribeToPush(userId)
                  if (result.success) {
                    setNotifEnabled(true)
                  } else if (result.reason === 'ios-non-pwa') {
                    setIosHint(true)
                    setTimeout(() => setIosHint(false), 6000)
                  } else if (result.reason === 'denied') {
                    // User declined — do nothing, toggle stays off
                  } else {
                    toast.error(result.message)
                  }
                }}
                className={cn(
                  'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                  notifEnabled ? 'bg-[#009688]' : 'bg-gray-200'
                )}
                aria-label={t('you.toggle_notifications_aria')}
              >
                <span className={cn(
                  'inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
                  notifEnabled ? 'translate-x-6' : 'translate-x-1'
                )} />
              </button>
            </div>
            {iosHint && (
              <div className="px-4 pb-3">
                <p className="text-[12px] text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                  To enable notifications on iPhone, first add this app to your home screen: tap the Share button → Add to Home Screen.
                </p>
              </div>
            )}

            {/* Language */}
            <div className="px-4 py-3.5">
              <span className="text-[13px] font-medium text-gray-700 block mb-2">{t('you.language')}</span>
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={async () => {
                      await supabase.from('profiles').update({ preferred_language: lang.code }).eq('id', userId)
                      setLanguage(lang.code)
                      window.location.reload()
                    }}
                    className={cn(
                      'flex-shrink-0 rounded-lg px-3 py-1.5 text-[12px] font-semibold border transition-colors',
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

            {/* Privacy settings */}
            {[
              { key: 'show_email',     tKey: 'you.show_email' },
              { key: 'show_location',  tKey: 'you.show_location' },
              { key: 'public_history', tKey: 'you.public_history' },
            ].map(({ key, tKey }) => {
              const label = t(tKey)
              const currentVal = !!(fullProfile as any)?.[key]
              return (
                <div key={key} className="flex items-center justify-between px-4 py-3.5">
                  <span className="text-[13px] font-medium text-gray-700">{label}</span>
                  <button
                    onClick={async () => {
                      await supabase.from('profiles').update({ [key]: !currentVal }).eq('id', userId)
                      queryClient.invalidateQueries({ queryKey: ['full-profile', userId] })
                    }}
                    className={cn(
                      'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                      currentVal ? 'bg-[#009688]' : 'bg-gray-200'
                    )}
                    aria-label={label}
                  >
                    <span className={cn(
                      'inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
                      currentVal ? 'translate-x-6' : 'translate-x-1'
                    )} />
                  </button>
                </div>
              )
            })}

            {/* Password reset */}
            <button
              onClick={async () => {
                const email = authProfile?.email
                if (!email) return
                if (!window.confirm(`Send a password reset email to ${email}?`)) return
                await supabase.auth.resetPasswordForEmail(email)
                setResetSent(true)
                setTimeout(() => setResetSent(false), 4000)
              }}
              className="w-full flex items-center justify-between px-4 py-3.5"
            >
              <span className="text-[13px] font-medium text-gray-700">
                {resetSent ? t('you.reset_sent') : t('you.reset_password')}
              </span>
              <ChevronRight className="h-4 w-4 text-gray-400" />
            </button>

            {/* Privacy Policy */}
            <button
              onClick={() => navigate('/privacy')}
              className="w-full flex items-center justify-between px-4 py-3.5"
            >
              <span className="text-[13px] font-medium text-gray-700">{t('you.privacy_policy')}</span>
              <ChevronRight className="h-4 w-4 text-gray-400" />
            </button>

            {/* Terms of Service */}
            <button
              onClick={() => navigate('/terms')}
              className="w-full flex items-center justify-between px-4 py-3.5"
            >
              <span className="text-[13px] font-medium text-gray-700">{t('you.terms')}</span>
              <ChevronRight className="h-4 w-4 text-gray-400" />
            </button>

            {/* Help & Support */}
            <button
              onClick={() => navigate('/support')}
              className="w-full flex items-center justify-between px-4 py-3.5"
            >
              <span className="text-[13px] font-medium text-gray-700">{t('you.support_link')}</span>
              <ChevronRight className="h-4 w-4 text-gray-400" />
            </button>

            {/* Delete account */}
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full flex items-center justify-between px-4 py-3.5"
            >
              <span className="text-[13px] font-medium text-red-500">{t('you.delete_account')}</span>
              <ChevronRight className="h-4 w-4 text-red-300" />
            </button>
          </div>

          {/* App version */}
          <p className="text-[11px] text-gray-300 text-center mt-3">{`PPA v${__APP_VERSION__}`}</p>

          {/* Sign out */}
          <button
            onClick={async () => {
              try { await signOut() } catch { /* proceed */ }
              localStorage.clear()
              window.location.href = '/auth'
            }}
            className="mt-4 w-full flex items-center justify-center gap-2 rounded-2xl border border-red-100 py-3.5 text-[14px] font-semibold text-red-500 hover:bg-red-50 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            {t('you.sign_out')}
          </button>
        </section>

        {/* Delete account confirmation dialog — two-step */}
        <AnimatePresence>
          {showDeleteConfirm && (
            <>
              <motion.div
                className="fixed inset-0 z-[55] bg-black/50"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => { if (!deleting) { setShowDeleteConfirm(false); setDeleteStep(1); setDeleteTyped('') } }}
              />
              <motion.div
                className="fixed inset-x-5 top-1/2 -translate-y-1/2 z-[60] bg-white rounded-2xl p-6 shadow-xl"
                initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              >
                {deleteStep === 1 ? (
                  <>
                    <h3 className="text-[17px] font-bold text-gray-900 text-center mb-2">{t('you.delete_account_confirm')}</h3>
                    <p className="text-[13px] text-gray-500 text-center mb-5">
                      This will permanently delete your account, all matches, results, ELO history, and you cannot recover this. Are you sure?
                    </p>
                    <div className="flex gap-3">
                      <button
                        onClick={() => { setShowDeleteConfirm(false); setDeleteStep(1); setDeleteTyped('') }}
                        className="flex-1 rounded-xl border border-gray-200 py-3 text-[13px] font-semibold text-gray-700"
                      >
                        {t('common.cancel')}
                      </button>
                      <button
                        onClick={() => setDeleteStep(2)}
                        className="flex-1 rounded-xl bg-red-500 py-3 text-[13px] font-bold text-white"
                      >
                        Continue
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <h3 className="text-[17px] font-bold text-red-600 text-center mb-2">Final confirmation</h3>
                    <p className="text-[13px] text-gray-500 text-center mb-3">
                      Type <span className="font-bold text-gray-900">DELETE</span> below to confirm.
                    </p>
                    <input
                      type="text"
                      value={deleteTyped}
                      onChange={(e) => setDeleteTyped(e.target.value)}
                      placeholder="Type DELETE"
                      autoFocus
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 text-center text-[14px] font-bold text-gray-900 focus:outline-none focus:border-red-400 mb-4"
                    />
                    <div className="flex gap-3">
                      <button
                        onClick={() => { setDeleteStep(1); setDeleteTyped('') }}
                        disabled={deleting}
                        className="flex-1 rounded-xl border border-gray-200 py-3 text-[13px] font-semibold text-gray-700 disabled:opacity-50"
                      >
                        Back
                      </button>
                      <button
                        disabled={deleting || deleteTyped !== 'DELETE'}
                        onClick={async () => {
                          setDeleting(true)
                          try {
                            const { error } = await supabase.rpc('delete_user')
                            if (error) throw error
                            setShowDeleteConfirm(false)
                            await signOut()
                            localStorage.clear()
                            toast.success('Your account has been deleted')
                            window.location.href = '/auth'
                          } catch (err: unknown) {
                            Sentry.captureException(err)
                            const msg = err instanceof Error ? err.message : 'Unknown error'
                            toast.error(`Account deletion failed: ${msg}. Please contact support.`)
                            setDeleting(false)
                          }
                        }}
                        className="flex-1 rounded-xl bg-red-500 py-3 text-[13px] font-bold text-white disabled:opacity-40"
                      >
                        {deleting ? 'Deleting…' : 'Delete my account'}
                      </button>
                    </div>
                    <p className="text-[11px] text-gray-400 text-center mt-4">
                      Having trouble?{' '}
                      <a href="mailto:support@padelplayersapp.com" className="underline">
                        support@padelplayersapp.com
                      </a>
                    </p>
                  </>
                )}
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      {/* ── Admin Section ── */}
      {adminGroups.length > 0 && (
        <section className="px-5 pb-4">
          <h2 className="text-[16px] font-bold text-gray-900 mb-3">{t('you.admin_section')}</h2>
          <div className="rounded-2xl border border-gray-100 overflow-hidden divide-y divide-gray-50">
            {adminGroups.map(({ group_id, groups }) => groups && (
              <button
                key={group_id}
                onClick={() => navigate(`/community/groups/${group_id}`)}
                className="w-full flex items-center justify-between px-4 py-3.5"
              >
                <span className="text-[13px] font-medium text-gray-700">{groups.name}</span>
                <ChevronRight className="h-4 w-4 text-gray-400" />
              </button>
            ))}
          </div>
        </section>
      )}

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
