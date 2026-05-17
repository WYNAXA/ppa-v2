interface ReverseGeocodeResult {
  city: string | null
  postcode: string | null
  country: string | null
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
      raw: data,
    }
  } catch (err) {
    console.warn('[geocode] reverse geocode failed:', err)
    return { city: null, postcode: null, country: null, raw: null }
  }
}
