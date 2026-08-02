import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

export interface MapVenue {
  venue_id: string
  venue_name: string
  city?: string | null
  latitude?: number | null
  longitude?: number | null
  distance_miles?: number | null
}

// Teal drop pin (matches ContactMap / brand).
const venueIcon = L.divIcon({
  className: '',
  iconSize: [26, 38],
  iconAnchor: [13, 38],
  html: `<svg width="26" height="38" viewBox="0 0 28 40" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 26 14 26s14-15.5 14-26C28 6.27 21.73 0 14 0z" fill="#009688"/>
    <circle cx="14" cy="14" r="6" fill="white"/>
  </svg>`,
})

// "You are here" pulsing blue dot.
const youIcon = L.divIcon({
  className: '',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
  html: `<div style="width:14px;height:14px;border-radius:50%;background:#2563eb;border:3px solid white;box-shadow:0 0 0 2px rgba(37,99,235,0.35)"></div>`,
})

interface VenueMapProps {
  venues: MapVenue[]
  center: { lat: number; lng: number }
  onSelect: (venueId: string) => void
}

export default function VenueMap({ venues, center, onSelect }: VenueMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  // Init map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = L.map(containerRef.current, {
      center: [center.lat, center.lng],
      zoom: 11,
      scrollWheelZoom: false,
      attributionControl: true,
    })
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map)
    layerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map
    return () => { map.remove(); mapRef.current = null; layerRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Redraw markers when the venues or centre change.
  useEffect(() => {
    const map = mapRef.current
    const layer = layerRef.current
    if (!map || !layer) return
    layer.clearLayers()

    L.marker([center.lat, center.lng], { icon: youIcon, interactive: false }).addTo(layer)
    const points: [number, number][] = [[center.lat, center.lng]]

    for (const v of venues) {
      if (v.latitude == null || v.longitude == null) continue
      const marker = L.marker([v.latitude, v.longitude], { icon: venueIcon }).addTo(layer)
      const dist = typeof v.distance_miles === 'number' ? ` · ${v.distance_miles.toFixed(1)} mi` : ''
      marker.bindTooltip(`${v.venue_name}${dist}`, { direction: 'top', offset: [0, -34], opacity: 1 })
      marker.on('click', () => onSelectRef.current(v.venue_id))
      points.push([v.latitude, v.longitude])
    }

    if (points.length > 1) {
      map.fitBounds(L.latLngBounds(points), { padding: [32, 32], maxZoom: 14 })
    } else {
      map.setView([center.lat, center.lng], 12)
    }
  }, [venues, center.lat, center.lng])

  return <div ref={containerRef} className="h-[360px] w-full rounded-2xl overflow-hidden border border-gray-100 z-0" />
}
