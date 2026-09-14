import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { CourtsHome } from '@/components/play/CourtsHome'

/**
 * Venues tile page — Mine (recently played) → Browse (CourtsHome).
 *
 * "Recently played" is venues from the player's own matches, identified by
 * padel_venue_id. The browse list reuses CourtsHome's directory component.
 */

interface PlayedVenue {
  venue_id: string
  venue_name: string
  city: string | null
}

export function VenuesPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const userId = profile?.id ?? ''

  const lat = profile?.latitude ?? null
  const lng = profile?.longitude ?? null

  const [query, setQuery] = useState('')

  const { data: recentlyPlayed = [] } = useQuery<PlayedVenue[]>({
    queryKey: ['my-played-venues', userId],
    enabled: !!userId,
    queryFn: async () => {
      // Distinct venues from matches the player is in, most recent first.
      const { data: matches } = await supabase
        .from('matches')
        .select('padel_venue_id')
        .contains('player_ids', [userId])
        .not('padel_venue_id', 'is', null)
        .order('match_date', { ascending: false })
        .limit(50)

      const venueIds = [...new Set((matches ?? []).map(m => m.padel_venue_id).filter(Boolean) as string[])]
      if (venueIds.length === 0) return []

      const { data: venues } = await supabase
        .from('padel_venues')
        .select('venue_id, venue_name, city')
        .in('venue_id', venueIds)

      // Preserve order from matches (most recently played first).
      const map = new Map((venues ?? []).map(v => [v.venue_id, v]))
      return venueIds.map(id => map.get(id)).filter(Boolean) as PlayedVenue[]
    },
  })

  return (
    <div className="min-h-full bg-surface pb-32">
      <div className="px-4 pt-12 pb-4 bg-card border-b border-hairline">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/discover')} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-hairline -ml-1">
            <ChevronLeft className="w-5 h-5 text-ink-2" />
          </button>
          <h1 className="text-xl font-bold text-ink">{t('people.nav_venues')}</h1>
        </div>
      </div>

      <div className="px-5 pt-4 space-y-4">
        {/* Mine — recently played */}
        {recentlyPlayed.length > 0 && (
          <section>
            <h2 className="text-[11px] font-bold uppercase leading-[14px] tracking-[0.06em] text-ink-2 mb-2">
              {t('discover.recently_played')}
            </h2>
            <div className="space-y-2">
              {recentlyPlayed.map((v) => (
                <button
                  key={v.venue_id}
                  onClick={() => navigate(`/venues/${v.venue_id}`)}
                  className="flex w-full items-center gap-3 rounded-card border border-hairline bg-card p-3 text-left"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-ink truncate">{v.venue_name}</p>
                    {v.city && <p className="text-[11px] text-ink-2">{v.city}</p>}
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Browse — reuse CourtsHome */}
        <section>
          <h2 className="text-[11px] font-bold uppercase leading-[14px] tracking-[0.06em] text-ink-2 mb-2">
            {t('discover.browse_venues')}
          </h2>
          <CourtsHome
            lat={lat}
            lng={lng}
            query={query}
            onQueryChange={setQuery}
            onUseLocation={() => {}}
            onPickVenue={(id) => navigate(`/venues/${id}`)}
          />
        </section>
      </div>
    </div>
  )
}
