interface ForwardGeocodeResult {
  lat: number
  lng: number
  displayName: string
  country: string | null
  countryCode: string | null
}

/**
 * Forward geocode a place name via Nominatim search.
 *
 * Used by the manual city field so typing a city writes a point, not just a
 * string. Without this, Onboarding's manual path produces profiles with city
 * but no coordinates — the root cause of 34 of 46 null-coordinate profiles.
 */
export async function forwardGeocode(
  query: string,
): Promise<ForwardGeocodeResult | null> {
  try {
    const q = query.trim()
    if (q.length < 2) return null
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1&addressdetails=1`,
      { headers: { 'Accept-Language': 'en' } },
    )
    if (!response.ok) return null
    const data = await response.json()
    if (!Array.isArray(data) || data.length === 0) return null
    const hit = data[0]
    return {
      lat: parseFloat(hit.lat),
      lng: parseFloat(hit.lon),
      displayName: hit.address?.city ?? hit.address?.town ?? hit.address?.village ?? hit.display_name?.split(',')[0] ?? q,
      country: hit.address?.country ?? null,
      countryCode: hit.address?.country_code ? (hit.address.country_code as string).toUpperCase() : null,
    }
  } catch (err) {
    console.warn('[geocode] forward geocode failed:', err)
    return null
  }
}

interface ReverseGeocodeResult {
  city: string | null
  postcode: string | null
  country: string | null
  /** ISO 3166-1 alpha-2, lowercase from Nominatim — uppercase before writing. */
  countryCode: string | null
  raw: any
}

export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<ReverseGeocodeResult> {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14&addressdetails=1`,
      { headers: { 'Accept-Language': 'en' } },
    )

    if (!response.ok) {
      throw new Error(`Nominatim returned ${response.status}`)
    }

    const data = await response.json()
    const address = data.address ?? {}

    const city =
      address.city ??
      address.town ??
      address.village ??
      address.suburb ??
      address.county ??
      null

    return {
      city,
      postcode: address.postcode ?? null,
      country: address.country ?? null,
      countryCode: address.country_code ? (address.country_code as string).toUpperCase() : null,
      raw: data,
    }
  } catch (err) {
    console.warn('[geocode] reverse geocode failed:', err)
    return { city: null, postcode: null, country: null, countryCode: null, raw: null }
  }
}
