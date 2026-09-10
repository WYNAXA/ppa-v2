import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Plus, Users, MapPin, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { formatDistance } from '@/lib/travelUtils'
import { useAuth } from '@/hooks/useAuth'
import { PlayerAvatar } from '@/components/shared/PlayerAvatar'
import { CreateGroupSheet } from '@/components/community/CreateGroupSheet'
import { DirectoryGrid } from '@/components/community/DirectoryGrid'
import { ClubThisWeek } from '@/components/community/ClubThisWeek'
import { ConnectionRequestCard } from '@/components/community/ConnectionRequestCard'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

interface GroupRow {
  id: string
  name: string
  description: string | null
  city: string | null
  visibility: string | null
  admin_id: string
  auto_approve: boolean | null
  banner_url: string | null
  allow_ringers: boolean | null
}

interface MyGroup extends GroupRow {
  memberCount: number
  hasActiveLeague: boolean
  recentMembers: Array<{ id: string; name: string; avatar_url?: string | null }>
  userRole: string
  memberStatus: string
}


interface ConnectionProfile {
  user_id: string
  name: string
  avatar_url?: string | null
  city?: string | null
  internal_ranking?: number | null
}

interface ConnectionsData {
  accepted: Set<string>
  acceptedProfiles: ConnectionProfile[]
  pendingOutgoing: Set<string>
  incomingRequests: ConnectionProfile[]
}

// ── My Groups query ───────────────────────────────────────────────────────────

function useMyGroups(userId: string) {
  return useQuery({
    queryKey: ['my-groups', userId],
    enabled: !!userId,
    queryFn: async (): Promise<MyGroup[]> => {
      const { data: memberships, error } = await supabase
        .from('group_members')
        .select('group_id, role, status, groups(id, name, description, city, visibility, admin_id)')
        .eq('user_id', userId)
        .in('status', ['approved', 'ringer'])

      if (error) throw error
      if (!memberships || memberships.length === 0) return []

      const groups = memberships.map((m) => ({
        ...(Array.isArray(m.groups) ? m.groups[0] : m.groups) as GroupRow,
        userRole: m.role as string,
        memberStatus: m.status as string,
      }))
      const groupIds = groups.map((g) => g.id)

      const { data: memberRows } = await supabase
        .from('group_members')
        .select('group_id, user_id')
        .in('group_id', groupIds)
        .eq('status', 'approved')

      const allUserIds = [...new Set((memberRows ?? []).map((m) => m.user_id))]
      const { data: profileRows } = await supabase
        .from('profiles')
        .select('id, name, avatar_url')
        .in('id', allUserIds)

      const profileMap = Object.fromEntries((profileRows ?? []).map((p) => [p.id, p]))

      const membersByGroup: Record<string, Array<{ id: string; name: string; avatar_url?: string | null }>> = {}
      for (const m of memberRows ?? []) {
        if (!membersByGroup[m.group_id]) membersByGroup[m.group_id] = []
        const p = profileMap[m.user_id]
        if (p) membersByGroup[m.group_id].push(p)
      }

      const { data: activeLeagues } = await supabase
        .from('leagues')
        .select('linked_group_ids')
        .eq('status', 'active')

      const activeGroupIds = new Set<string>()
      for (const l of activeLeagues ?? []) {
        for (const gid of (l.linked_group_ids ?? []) as string[]) {
          activeGroupIds.add(gid)
        }
      }

      return groups.map((g) => ({
        ...g,
        memberCount:     (membersByGroup[g.id] ?? []).length,
        hasActiveLeague: activeGroupIds.has(g.id),
        recentMembers:   (membersByGroup[g.id] ?? []).slice(0, 5),
      }))
    },
  })
}

// ── Pending requests query ────────────────────────────────────────────────────

interface PendingRequest {
  id: string
  group_id: string
  groupName: string
  groupCity: string | null
}

function usePendingRequests(userId: string) {
  return useQuery({
    queryKey: ['pending-requests', userId],
    enabled: !!userId,
    queryFn: async (): Promise<PendingRequest[]> => {
      const { data, error } = await supabase
        .from('group_members')
        .select('id, group_id, groups(id, name, city)')
        .eq('user_id', userId)
        .eq('status', 'pending')
      if (error) throw error
      return (data ?? []).map((row: any) => {
        const g = Array.isArray(row.groups) ? row.groups[0] : row.groups
        return { id: row.id, group_id: row.group_id, groupName: g?.name ?? 'Unknown group', groupCity: g?.city ?? null }
      })
    },
  })
}

// ── Discover Groups query ─────────────────────────────────────────────────────


// ── Bidirectional Connections query ───────────────────────────────────────────

function useMyConnections(userId: string) {
  return useQuery<ConnectionsData>({
    queryKey: ['my-connections', userId],
    enabled: !!userId,
    queryFn: async (): Promise<ConnectionsData> => {
      const [{ data: outgoing }, { data: incoming }] = await Promise.all([
        supabase.from('player_connections').select('connected_user_id, status').eq('user_id', userId),
        supabase.from('player_connections').select('user_id, status').eq('connected_user_id', userId),
      ])

      const accepted = new Set<string>()
      const pendingOutgoing = new Set<string>()
      const incomingPendingIds: string[] = []

      for (const row of outgoing ?? []) {
        if (row.status === 'accepted') accepted.add(row.connected_user_id)
        else if (row.status === 'pending') pendingOutgoing.add(row.connected_user_id)
      }
      for (const row of incoming ?? []) {
        if (row.status === 'accepted') accepted.add(row.user_id)
        else if (row.status === 'pending') incomingPendingIds.push(row.user_id)
      }

      // Fetch profiles for accepted connections and incoming requests
      const allProfileIds = [...accepted, ...incomingPendingIds]
      let profiles: any[] = []
      if (allProfileIds.length > 0) {
        const { data } = await supabase
          .from('profiles')
          .select('id, name, avatar_url, city, internal_ranking')
          .in('id', allProfileIds)
        profiles = data ?? []
      }

      const profileMap = new Map(profiles.map((p: any) => [p.id, p]))

      const acceptedProfiles: ConnectionProfile[] = [...accepted]
        .map((id) => profileMap.get(id))
        .filter(Boolean)
        .map((p: any) => ({ user_id: p.id, name: p.name, avatar_url: p.avatar_url, city: p.city, internal_ranking: p.internal_ranking }))

      const incomingRequests: ConnectionProfile[] = incomingPendingIds
        .map((id) => profileMap.get(id))
        .filter(Boolean)
        .map((p: any) => ({ user_id: p.id, name: p.name, avatar_url: p.avatar_url, city: p.city, internal_ranking: p.internal_ranking }))

      return { accepted, acceptedProfiles, pendingOutgoing, incomingRequests }
    },
  })
}

// ── Find Players query ────────────────────────────────────────────────────────


// ── My Group Card ─────────────────────────────────────────────────────────────

function MyGroupCard({ group, index, badge }: { group: MyGroup; index: number; badge?: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  return (
    <motion.button
      onClick={() => navigate(`/community/groups/${group.id}`)}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      whileTap={{ scale: 0.985 }}
      className="w-full text-left bg-white rounded-2xl border border-hairline overflow-hidden hover:border-court-100 transition-colors relative"
    >
      <div className="flex">
        <div className="w-1 bg-court flex-shrink-0" />
        <div className="flex-1 px-4 py-3.5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-[15px] font-bold text-ink truncate">{group.name}</h3>
                {group.hasActiveLeague && (
                  <span className="inline-flex items-center rounded-full bg-court-50 border border-court-100 px-2 py-0.5 text-[11px] font-semibold text-court">
                    {t('community.active_league')}
                  </span>
                )}
                {badge && (
                  <span className={cn(
                    'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold',
                    badge === t('community.badge_ringer') ? 'bg-warn text-white' : 'bg-warn text-white'
                  )}>
                    {badge}
                  </span>
                )}
              </div>
              {group.city && (
                <div className="flex items-center gap-1 mt-0.5">
                  <MapPin className="h-3 w-3 text-ink-2" />
                  <p className="text-[12px] text-ink-2">{group.city}</p>
                </div>
              )}
            </div>
            <ChevronRight className="h-4 w-4 text-ink-3 flex-shrink-0 mt-1" />
          </div>

          <div className="flex items-center gap-2 mt-3">
            <div className="flex -space-x-1.5">
              {group.recentMembers.map((m) => (
                <PlayerAvatar key={m.id} name={m.name} avatarUrl={m.avatar_url} size="sm" />
              ))}
            </div>
            <span className="text-[12px] text-ink-2">
              {group.memberCount === 1 ? t('community.member', { count: 1 }) : t('community.members', { count: group.memberCount })}
            </span>
          </div>
        </div>
      </div>
    </motion.button>
  )
}

// ── Group Preview Sheet ──────────────────────────────────────────────────────





// ── Nearby Venues ────────────────────────────────────────────────────────────

// Leaflet is heavy — keep it out of the main bundle until the map view is opened.
const VenueMap = lazy(() => import('@/components/VenueMap'))

interface NearbyVenue {
  venue_id: string
  venue_name: string
  city: string | null
  country_code?: string | null
  indoor_courts?: number | null
  outdoor_courts?: number | null
  covered_courts?: number | null
  ppa_bookable?: boolean | null
  rating?: number | null
  photos?: unknown
  distance_miles?: number | null
  latitude?: number | null
  longitude?: number | null
}

type GeoState = 'idle' | 'locating' | 'denied' | 'unavailable'

function firstPhoto(photos: unknown): string | null {
  if (Array.isArray(photos) && typeof photos[0] === 'string') return photos[0]
  return null
}

function NearbyVenuesSection({
  profile,
}: {
  profile?: { city?: string | null; latitude?: number | null; longitude?: number | null } | null
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [geoState, setGeoState] = useState<GeoState>('idle')
  const [filters, setFilters] = useState({ indoor: false, outdoor: false, bookable: false })
  const toggleFilter = (k: keyof typeof filters) => setFilters(f => ({ ...f, [k]: !f[k] }))
  const [view, setView] = useState<'list' | 'map'>('list')

  const requestLocation = (fromButton: boolean) => {
    if (!('geolocation' in navigator)) { setGeoState('unavailable'); return }
    if (fromButton) setGeoState('locating')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setCoords(c)
        setGeoState('idle')
        try { sessionStorage.setItem('ppa_user_coords', JSON.stringify(c)) } catch { /* ignore */ }
      },
      (err) => setGeoState(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable'),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60 * 1000 },
    )
  }

  // Seed from last-known coords (this session), else the profile's stored coords.
  useEffect(() => {
    const cached = sessionStorage.getItem('ppa_user_coords')
    if (cached) { try { setCoords(JSON.parse(cached)); return } catch { /* ignore */ } }
    if (profile?.latitude != null && profile?.longitude != null) {
      setCoords({ lat: profile.latitude, lng: profile.longitude })
    }
  }, [profile?.latitude, profile?.longitude])

  // If the user already granted location, silently upgrade to their live position.
  useEffect(() => {
    if (!('geolocation' in navigator) || !navigator.permissions) return
    navigator.permissions.query({ name: 'geolocation' as PermissionName })
      .then((res) => { if (res.state === 'granted') requestLocation(false) })
      .catch(() => { /* Permissions API unsupported — rely on the button */ })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { data: venues = [] } = useQuery<NearbyVenue[]>({
    queryKey: ['nearby-venues-community', coords?.lat, coords?.lng, profile?.city],
    queryFn: async () => {
      if (coords) {
        const { data, error } = await supabase.rpc('venues_near', {
          p_lat: coords.lat, p_lng: coords.lng, p_radius_miles: 100, p_limit: 30,
        })
        if (!error && data) return data as NearbyVenue[]
      }
      // Fallback only when we have no coordinates at all: legacy city text match.
      if (profile?.city) {
        const { data } = await supabase
          .from('padel_venues')
          .select('venue_id, venue_name, city, country_code, indoor_courts, outdoor_courts, covered_courts, ppa_bookable, rating, photos')
          .eq('status', 'active')
          .ilike('city', `%${profile.city}%`)
          .limit(8)
        return (data ?? []) as NearbyVenue[]
      }
      return []
    },
  })

  const canAskLocation = geoState !== 'denied' && geoState !== 'unavailable'

  // Client-side discovery filters. All fields used here are already returned by
  // venues_near (indoor/outdoor/covered counts + ppa_bookable), so no RPC change.
  const anyFilter = filters.indoor || filters.outdoor || filters.bookable
  const visibleVenues = venues.filter((v) => {
    if (filters.bookable && !v.ppa_bookable) return false
    if (filters.indoor || filters.outdoor) {
      const hasIndoor = (v.indoor_courts ?? 0) > 0 || (v.covered_courts ?? 0) > 0
      const hasOutdoor = (v.outdoor_courts ?? 0) > 0
      if (!((filters.indoor && hasIndoor) || (filters.outdoor && hasOutdoor))) return false
    }
    return true
  })

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[16px] font-bold text-ink">{t('community.padel_courts_near')}</h2>
        <div className="flex items-center gap-3">
          {coords && venues.length > 0 && (
            <div className="flex rounded-full bg-hairline p-0.5">
              {(['list', 'map'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors ${
                    view === v ? 'bg-white text-ink shadow-sm' : 'text-ink-2'
                  }`}
                >
                  {v === 'list' ? t('community.courts_view_list') : t('community.courts_view_map')}
                </button>
              ))}
            </div>
          )}
          {canAskLocation && (
            <button
              onClick={() => requestLocation(true)}
              className="flex items-center gap-1 text-[12px] font-semibold text-court-700 active:scale-95 transition-transform"
            >
              <MapPin size={13} />
              {geoState === 'locating' ? t('community.courts_near_locating') : t('community.courts_near_use_location')}
            </button>
          )}
        </div>
      </div>

      {venues.length > 0 && (
        <div className="flex items-center gap-2 mb-3 overflow-x-auto no-scrollbar">
          {([
            { key: 'indoor', label: t('community.courts_filter_indoor') },
            { key: 'outdoor', label: t('community.courts_filter_outdoor') },
            { key: 'bookable', label: t('community.courts_filter_bookable') },
          ] as const).map(({ key, label }) => {
            const on = filters[key]
            return (
              <button
                key={key}
                onClick={() => toggleFilter(key)}
                className={cn(
                  'flex-shrink-0 rounded-full border px-3 py-1 text-[12px] font-semibold transition-colors active:scale-95',
                  on
                    ? 'border-court bg-court text-white'
                    : 'border-hairline bg-white text-ink-2',
                )}
              >
                {label}
              </button>
            )
          })}
        </div>
      )}

      {venues.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-hairline bg-surface px-4 py-6 text-center">
          <p className="text-[13px] font-semibold text-ink-2">{t('community.courts_near_empty_title')}</p>
          <p className="text-[12px] text-ink-2 mt-1 max-w-[280px] mx-auto">
            {geoState === 'denied' ? t('community.courts_near_denied_sub') : t('community.courts_near_empty_sub')}
          </p>
          {canAskLocation && (
            <button
              onClick={() => requestLocation(true)}
              className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-court text-white text-[13px] font-semibold px-4 py-2 active:scale-95 transition-transform"
            >
              <MapPin size={14} />
              {geoState === 'locating' ? t('community.courts_near_locating') : t('community.courts_near_use_location')}
            </button>
          )}
        </div>
      ) : visibleVenues.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-hairline bg-surface px-4 py-6 text-center">
          <p className="text-[13px] font-semibold text-ink-2">{t('community.courts_filter_none_match')}</p>
          {anyFilter && (
            <button
              onClick={() => setFilters({ indoor: false, outdoor: false, bookable: false })}
              className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-court text-white text-[13px] font-semibold px-4 py-2 active:scale-95 transition-transform"
            >
              {t('community.courts_filter_clear')}
            </button>
          )}
        </div>
      ) : view === 'map' && coords ? (
        <Suspense fallback={<div className="h-[360px] w-full rounded-2xl bg-surface border border-hairline flex items-center justify-center"><div className="h-6 w-6 rounded-full border-2 border-court border-t-transparent animate-spin" /></div>}>
          <VenueMap
            venues={visibleVenues}
            center={coords}
            onSelect={(id) => navigate(`/venues/${id}`)}
          />
        </Suspense>
      ) : (
      <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
        {visibleVenues.map((v) => {
          const courts = (v.indoor_courts ?? 0) + (v.outdoor_courts ?? 0) + (v.covered_courts ?? 0)
          const hero = firstPhoto(v.photos)
          const distance = typeof v.distance_miles === 'number' ? v.distance_miles : null
          return (
            <button
              key={v.venue_id}
              onClick={() => navigate(`/venues/${v.venue_id}`)}
              className="flex-shrink-0 w-48 rounded-2xl border border-hairline bg-white overflow-hidden text-left active:scale-[0.97] transition-transform"
            >
              <div className="h-20 relative">
                {hero ? (
                  <img src={hero} alt={v.venue_name} className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full bg-gradient-to-br from-court to-court flex items-center justify-center">
                    <span className="text-3xl">🎾</span>
                  </div>
                )}
                {distance != null && (
                  <span className="absolute top-1.5 right-1.5 text-[11px] font-semibold text-white bg-scrim backdrop-blur rounded-full px-1.5 py-0.5">
                    {t('community.courts_near_away', { distance: formatDistance(distance) })}
                  </span>
                )}
              </div>
              <div className="px-3 py-2.5">
                <p className="text-[13px] font-bold text-ink truncate">{v.venue_name}</p>
                <p className="text-[11px] text-ink-2 mt-0.5">{v.city}{courts > 0 ? ` \u00B7 ${courts} courts` : ''}</p>
                <div className="flex items-center gap-1.5 mt-1.5">
                  {v.ppa_bookable && (
                    <span className="text-[11px] font-bold text-court-700 bg-court-50 rounded-full px-1.5 py-0.5">PPA</span>
                  )}
                  {(v.rating as number) > 0 && (
                    <span className="text-[11px] text-ink-2">{'\u2B50'} {Number(v.rating).toFixed(1)}</span>
                  )}
                </div>
              </div>
            </button>
          )
        })}
      </div>
      )}
    </section>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function CommunityPage() {
  const { profile } = useAuth()
  const navigate     = useNavigate()
  const location     = useLocation()
  const queryClient  = useQueryClient()
  const { t }        = useTranslation()
  const [showCreateSheet, setShowCreateSheet] = useState(false)


  const userId = profile?.id ?? ''

  // Section refs for QuickLinks + hash scroll
  const groupsRef = useRef<HTMLElement>(null)
  const venuesRef = useRef<HTMLElement>(null)
  const connectionsRef = useRef<HTMLElement>(null)

  // Queries
  const { data: connectionsData } = useMyConnections(userId)
  const connections = connectionsData ?? { accepted: new Set<string>(), acceptedProfiles: [], pendingOutgoing: new Set<string>(), incomingRequests: [] }
  const { data: allMyGroups = [], isLoading: loadingMine } = useMyGroups(userId)
  const { data: pendingRequests = [] } = usePendingRequests(userId)
  const myGroups = allMyGroups.filter(g => g.memberStatus === 'approved')
  const ringerGroups = allMyGroups.filter(g => g.memberStatus === 'ringer')



  // Quick links config
  const { data: playerCount = 0 } = useQuery<number>({
    queryKey: ['community-player-count'],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { count } = await supabase
        .from('profiles').select('id', { count: 'exact', head: true })
      return count ?? 0
    },
  })

  const { data: venueCount = 0 } = useQuery<number>({
    queryKey: ['community-venue-count'],
    staleTime: 24 * 60 * 60_000,
    queryFn: async () => {
      const { count } = await supabase
        .from('padel_venues')
        .select('venue_id', { count: 'exact', head: true })
      return count ?? 0
    },
  })

  // Hash scroll for notification deep links (/community#connections)
  useEffect(() => {
    if (location.hash !== '#connections') return
    if (!connectionsData) return
    const timer = setTimeout(() => {
      connectionsRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, 150)
    return () => clearTimeout(timer)
  }, [location.hash, connectionsData])

  // ── Mutations ──────────────────────────────────────────────────────────────



  const cancelRequestMutation = useMutation({
    mutationFn: async (groupId: string) => {
      const { error } = await supabase.from('group_members').delete()
        .eq('group_id', groupId).eq('user_id', userId).eq('status', 'pending')
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-requests', userId] })
      queryClient.invalidateQueries({ queryKey: ['all-groups'] })
    },
  })



  // Merged groups list: approved + ringer (with badge)
  const mergedGroups = [
    ...myGroups.map(g => ({ ...g, badge: undefined as string | undefined })),
    ...ringerGroups.map(g => ({ ...g, badge: t('community.badge_ringer') as string | undefined })),
  ]



  return (
    <div className="min-h-full bg-surface pb-32">
      <div className="px-5 pb-2 pt-14">
        <ClubThisWeek
          groups={allMyGroups.map((g) => ({ id: g.id, name: g.name }))}
          userId={userId}
        />
      </div>

      <div className="px-5 space-y-6 pt-4">
        {/* Directory — the five things you come here to find. */}
        <DirectoryGrid
          counts={{
            groups: allMyGroups.length || undefined,
            players: playerCount || undefined,
            venues: venueCount || undefined,
          }}
        />

        {/* Open Matches link.
            It used to sit on `warn-50` behind a 🎾 emoji. Two things wrong with
            that: `warn` means *something needs your attention*, and an open
            match is an invitation, not a warning; and the emoji renders in a
            different palette on every platform — blue on Android, green on iOS —
            so it was the one genuinely off-brand element on the page. Open
            Matches and My Connections are the same kind of thing — two doors to
            finding people to play with — so they are now a matched pair, told
            apart by their words and their glyphs rather than by hue. The ring
            glyph is the one the Play sheet already uses for open matches. */}
        <button
          onClick={() => navigate('/open-matches')}
          className="w-full flex items-center gap-3 rounded-2xl border border-court-100 bg-court-50/50 px-4 py-3 text-left active:scale-[0.98] transition-transform"
        >
          <div className="h-9 w-9 rounded-xl bg-court-100 flex items-center justify-center flex-shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-court)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 1 0 18" /><path d="M12 3a9 9 0 0 0 0 18" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-bold text-ink">{t('community.open_matches')}</p>
            <p className="text-[11px] text-ink-2">{t('community.open_matches_subtitle')}</p>
          </div>
          <ChevronRight className="h-4 w-4 text-ink-3 flex-shrink-0" />
        </button>

        {/* My Connections link */}
        <button
          onClick={() => navigate('/community/connections')}
          className="w-full flex items-center gap-3 rounded-2xl border border-court-100 bg-court-50/50 px-4 py-3 text-left active:scale-[0.98] transition-transform"
        >
          <div className="h-9 w-9 rounded-xl bg-court-100 flex items-center justify-center flex-shrink-0">
            <Users className="h-4.5 w-4.5 text-court" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-bold text-ink">{t('community.my_connections')}</p>
            <p className="text-[11px] text-ink-2">{t('community.my_connections_subtitle')}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {connections.accepted.size > 0 && (
              <span className="text-[12px] font-semibold text-court">{connections.accepted.size}</span>
            )}
            <ChevronRight className="h-4 w-4 text-ink-3" />
          </div>
        </button>

        {/* ── Connection requests ──
            What was a full "Connections" section here duplicated the My
            Connections row directly above: same four faces, same "show all",
            same destination. The one part that was not a duplicate is this —
            somebody is waiting on a yes or no. A task belongs near the top and
            should disappear when there is nothing to do, so it is now a
            conditional strip rather than a permanent heading with an empty
            state under it. */}
        {connections.incomingRequests.length > 0 && (
          <section ref={connectionsRef} id="connections">
            <p className="mb-2 text-[11px] font-bold uppercase leading-[14px] tracking-[0.06em] text-ink-2">
              {t('community.connection_requests', { count: connections.incomingRequests.length })}
            </p>
            <div className="space-y-2">
              {connections.incomingRequests.map((req) => (
                <ConnectionRequestCard key={req.user_id} request={req} />
              ))}
            </div>
          </section>
        )}

        {/* ── Padel courts near you ──
            UAT: "Padel courts near you should likely be more prominent too. as
            its a great little feature." It was the last section on the page,
            below My Groups, Find Groups, Connections, Find Players, Events and
            Coaches — five of which are lists of the same five things the
            directory grid at the top already links to. This is the only section
            on the page carrying live local content rather than a second copy of
            the navigation, so it now sits directly under the directory. */}
        <section ref={venuesRef as React.RefObject<HTMLElement>} id="venues" style={{ scrollMarginTop: '120px' }}>
          <NearbyVenuesSection profile={profile} />
        </section>

        {/* ── My Groups (merged: approved + ringer + pending) ── */}
        <section ref={groupsRef} id="groups" style={{ scrollMarginTop: '120px' }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[16px] font-bold text-ink">{t('community.my_groups')}</h2>
            {mergedGroups.length > 0 && (
              <span className="text-[12px] text-ink-2">
                {mergedGroups.length} group{mergedGroups.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {loadingMine ? (
            <div className="space-y-3">
              {[0, 1].map((i) => (
                <div key={i} className="h-20 rounded-2xl bg-hairline animate-pulse" />
              ))}
            </div>
          ) : mergedGroups.length === 0 && pendingRequests.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-hairline p-6 text-center">
              <div className="h-10 w-10 rounded-2xl bg-hairline flex items-center justify-center mx-auto mb-3">
                <Users className="h-5 w-5 text-ink-2" />
              </div>
              <p className="text-[14px] font-semibold text-ink-2 mb-1">{t('community.no_groups')}</p>
              <p className="text-[12px] text-ink-2 mb-4">{t('community.no_groups_sub')}</p>
              <button
                onClick={() => setShowCreateSheet(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-court px-4 py-2.5 text-[13px] font-bold text-white"
              >
                <Plus className="h-3.5 w-3.5" />
                {t('community.create_group')}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {mergedGroups.map((group, i) => (
                <MyGroupCard key={group.id} group={group} index={i} badge={group.badge} />
              ))}
              {/* Pending group requests inline */}
              {pendingRequests.map((req) => (
                <div key={req.id} className="flex items-center justify-between gap-3 rounded-2xl border border-warn-100 bg-warn-50 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold text-ink truncate">{req.groupName}</p>
                    {req.groupCity && <p className="text-[11px] text-ink-2">{req.groupCity}</p>}
                    <span className="inline-flex items-center mt-1 rounded-full bg-warn-100 px-2 py-0.5 text-[11px] font-semibold text-warn">
                      {t('community.pending_approval')}
                    </span>
                  </div>
                  <button
                    onClick={() => cancelRequestMutation.mutate(req.group_id)}
                    disabled={cancelRequestMutation.isPending}
                    className="flex-shrink-0 rounded-xl border border-alert/40 px-3 py-1.5 text-[11px] font-bold text-alert active:scale-95 transition-transform"
                  >
                    {t('community.cancel')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>






      </div>

      {/* Floating + button */}
      <motion.button
        onClick={() => setShowCreateSheet(true)}
        whileTap={{ scale: 0.9 }}
        className="fixed bottom-[calc(80px+env(safe-area-inset-bottom)+16px)] right-5 z-40 h-14 w-14 rounded-full bg-court shadow-lg flex items-center justify-center"
      >
        <Plus className="h-6 w-6 text-white" />
      </motion.button>

      <CreateGroupSheet
        open={showCreateSheet}
        onClose={() => {
          setShowCreateSheet(false)
          queryClient.invalidateQueries({ queryKey: ['my-groups', userId] })
        }}
      />



    </div>
  )
}
