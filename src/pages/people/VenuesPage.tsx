import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { useMyPlayedVenues } from '@/hooks/useSocial'
import { CourtsHome } from '@/components/play/CourtsHome'

export function VenuesPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const userId = profile?.id ?? ''

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(() => {
    // Restore from session so a second visit doesn't re-prompt.
    try {
      const s = sessionStorage.getItem('ppa_user_coords')
      return s ? JSON.parse(s) : null
    } catch { return null }
  })
  const lat = coords?.lat ?? profile?.latitude ?? null
  const lng = coords?.lng ?? profile?.longitude ?? null

  const [query, setQuery] = useState('')
  const [radius, setRadius] = useState(60)
  const [locating, setLocating] = useState(false)
  const { data: recentlyPlayed = [] } = useMyPlayedVenues(userId)

  const requestLocation = useCallback(() => {
    if (!('geolocation' in navigator)) { toast.error(t('common.error')); return }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setCoords(c)
        sessionStorage.setItem('ppa_user_coords', JSON.stringify(c))
        setLocating(false)
      },
      () => { setLocating(false); toast.error(t('common.error')) },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
    )
  }, [t])

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
        {/* Recently played — compact horizontal strip */}
        {recentlyPlayed.length > 0 && (
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
            {recentlyPlayed.map((v) => (
              <button
                key={v.venue_id}
                onClick={() => navigate(`/venues/${v.venue_id}`)}
                className="flex-shrink-0 rounded-pill border border-hairline bg-card px-3 py-1.5 text-[12px] font-semibold text-ink-2"
              >
                {v.venue_name}
              </button>
            ))}
          </div>
        )}

        {/* Browse — the main content. Booking is why people open this page. */}
        <CourtsHome
          lat={lat}
          lng={lng}
          query={query}
          onQueryChange={setQuery}
          onUseLocation={requestLocation}
          locating={locating}
          onPickVenue={(id) => navigate(`/venues/${id}`)}
          radiusMiles={radius}
          onRadiusChange={setRadius}
        />
      </div>
    </div>
  )
}
