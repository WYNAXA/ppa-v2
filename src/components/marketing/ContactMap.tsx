import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const DUBLIN_LAT = 53.337
const DUBLIN_LNG = -6.249
const ZOOM = 14

// Custom teal SVG marker
const tealIcon = L.divIcon({
  className: '',
  iconSize: [28, 40],
  iconAnchor: [14, 40],
  html: `<svg width="28" height="40" viewBox="0 0 28 40" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 26 14 26s14-15.5 14-26C28 6.27 21.73 0 14 0z" fill="#009688"/>
    <circle cx="14" cy="14" r="6" fill="white"/>
  </svg>`,
})

export default function ContactMap() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, {
      center: [DUBLIN_LAT, DUBLIN_LNG],
      zoom: ZOOM,
      scrollWheelZoom: false,
      attributionControl: true,
    })

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map)

    L.marker([DUBLIN_LAT, DUBLIN_LNG], { icon: tealIcon })
      .addTo(map)
      .bindPopup('<strong>Padel Players</strong><br/>26 Fitzwilliam Square West<br/>Dublin D02 HX82')

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  return <div ref={containerRef} className="h-[280px] w-full" />
}
