/**
 * Set the viewer's location on their profile — geolocation or manual city.
 *
 * Extracted from Onboarding.tsx:117-153 so Discover's no-location hero and
 * Onboarding both use one implementation. The hook does NOT navigate — it
 * writes the profile and invalidates the queries that depend on it.
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
  | { status: 'done' }
  | { status: 'error'; message: string }

export function useSetMyLocation() {
  const { user, refreshProfile } = useAuth()
  const queryClient = useQueryClient()
  const [state, setState] = useState<LocationState>({ status: 'idle' })

  /** Browser geolocation → reverse geocode → profile write. */
  const detectLocation = useCallback(async () => {
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
          await supabase.from('profiles').update({
            city: geo.city,
            latitude,
            longitude,
          }).eq('id', user.id)
          await refreshProfile()
          queryClient.invalidateQueries({ queryKey: ['discover-counts'] })
          queryClient.invalidateQueries({ queryKey: ['discover-feed'] })
          setState({ status: 'done' })
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
  }, [user, queryClient, refreshProfile])

  /** Manual city string → forward geocode → profile write. */
  const setFromCity = useCallback(async (city: string) => {
    if (!user) return
    setState({ status: 'pending' })
    try {
      const result = await forwardGeocode(city)
      await supabase.from('profiles').update({
        city: result?.displayName ?? city.trim(),
        latitude: result?.lat ?? null,
        longitude: result?.lng ?? null,
      }).eq('id', user.id)
      await refreshProfile()
      queryClient.invalidateQueries({ queryKey: ['discover-counts'] })
      queryClient.invalidateQueries({ queryKey: ['discover-feed'] })
      setState({ status: 'done' })
    } catch {
      setState({ status: 'error', message: 'Failed to save location' })
    }
  }, [user, queryClient, refreshProfile])

  return { state, detectLocation, setFromCity }
}
