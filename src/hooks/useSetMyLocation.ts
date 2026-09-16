/**
 * Set the viewer's location on their profile — geolocation or manual city.
 *
 * Extracted from Onboarding.tsx so Discover's no-location hero and Onboarding
 * both use one implementation.
 *
 * Two modes:
 *   - `deferWrite: false` (default): detect → geocode → write → invalidate.
 *     Used by Discover's hero, where the card should disappear immediately.
 *   - `deferWrite: true`: detect → geocode → hold in `result`. The caller
 *     reads `result`, lets the user edit, then calls `save()`. Used by
 *     Onboarding, which has an intermediate edit step before Continue.
 */
import { useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { reverseGeocode, forwardGeocode } from '@/lib/geocode'

export type LocationState =
  | { status: 'idle' }
  | { status: 'pending' }
  | { status: 'denied' }
  | { status: 'ready'; city: string | null; postcode: string | null; lat: number; lng: number }
  | { status: 'done' }
  | { status: 'error'; message: string }

export interface SetMyLocationOptions {
  /** When true, detectLocation holds the result instead of writing it. */
  deferWrite?: boolean
}

export function useSetMyLocation(opts?: SetMyLocationOptions) {
  const deferWrite = opts?.deferWrite ?? false
  const { user, refreshProfile } = useAuth()
  const queryClient = useQueryClient()
  const [state, setState] = useState<LocationState>({ status: 'idle' })

  async function writeProfile(
    city: string | null,
    lat: number | null,
    lng: number | null,
    country?: string | null,
    countryCode?: string | null,
  ) {
    if (!user) return
    const patch: Record<string, unknown> = { city, latitude: lat, longitude: lng }
    if (country !== undefined) patch.country = country
    if (countryCode !== undefined) patch.country_code = countryCode
    await supabase.from('profiles').update(patch as Record<string, never>).eq('id', user.id)
    await refreshProfile()
    queryClient.invalidateQueries({ queryKey: ['discover-counts'] })
    queryClient.invalidateQueries({ queryKey: ['discover-feed'] })
    setState({ status: 'done' })
  }

  /** Browser geolocation → reverse geocode → write or hold. */
  const detectLocation = useCallback(() => {
    if (!user) return
    if (!navigator.geolocation) {
      setState({ status: 'denied' })
      return
    }
    setState({ status: 'pending' })
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords
          const geo = await reverseGeocode(latitude, longitude)
          if (deferWrite) {
            setState({
              status: 'ready',
              city: geo.city,
              postcode: geo.postcode,
              lat: latitude,
              lng: longitude,
            })
          } else {
            await writeProfile(geo.city, latitude, longitude, geo.country, geo.countryCode)
          }
        } catch {
          setState({ status: 'error', message: 'Failed to save location' })
        }
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setState({ status: 'denied' })
        } else {
          setState({ status: 'error', message: 'Could not get your location' })
        }
      },
      { enableHighAccuracy: false, timeout: 10000 },
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, deferWrite])

  /** Manual city string → forward geocode → write or hold. */
  const setFromCity = useCallback(async (city: string) => {
    if (!user) return
    setState({ status: 'pending' })
    try {
      const result = await forwardGeocode(city)
      const resolvedCity = result?.displayName ?? city.trim()
      const lat = result?.lat ?? null
      const lng = result?.lng ?? null
      if (deferWrite) {
        setState({
          status: 'ready',
          city: resolvedCity,
          postcode: null,
          lat: lat ?? 0,
          lng: lng ?? 0,
        })
      } else {
        await writeProfile(resolvedCity, lat, lng, result?.country, result?.countryCode)
      }
    } catch {
      setState({ status: 'error', message: 'Failed to save location' })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, deferWrite])

  /**
   * Write the held result to the profile. Only meaningful when deferWrite is
   * true and state.status === 'ready'. Accepts overrides so the caller can
   * pass edited values (e.g. Onboarding's city field).
   */
  const save = useCallback(async (overrides?: { city?: string; postcode?: string }) => {
    if (!user) return
    if (state.status !== 'ready') return
    setState({ status: 'pending' })
    try {
      let { city, lat, lng } = state
      if (overrides?.city && overrides.city !== city) {
        // City was edited — re-geocode so coordinates match.
        const geo = await forwardGeocode(overrides.city)
        if (geo) { city = geo.displayName; lat = geo.lat; lng = geo.lng }
        else city = overrides.city
      }
      await writeProfile(city, lat, lng)
    } catch {
      setState({ status: 'error', message: 'Failed to save location' })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, state])

  return { state, detectLocation, setFromCity, save }
}
