/**
 * Shared hook for discover_list — one definition of "near you" per noun.
 *
 * Every tile page calls this with its kind and the scope from the Discover tab
 * (lat, lng, radius passed via ?r= query param). No page may filter by
 * distance itself — discover_list is the only definition.
 */
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Json } from '@/lib/database.types'

export interface DiscoverListRow {
  id: string
  title: string
  subtitle: string | null
  distance_miles: number | null
  meta: Record<string, unknown>
}

/** Read the radius from the ?r= query param, falling back to 25. */
export function useDiscoverRadius(): number {
  const [params] = useSearchParams()
  const r = parseInt(params.get('r') ?? '', 10)
  return r > 0 ? r : 25
}

export function useDiscoverList(kind: string) {
  const { profile } = useAuth()
  const lat = profile?.latitude ?? null
  const lng = profile?.longitude ?? null
  const radius = useDiscoverRadius()

  return useQuery<DiscoverListRow[]>({
    queryKey: ['discover-list', kind, lat, lng, radius],
    staleTime: 60_000,
    queryFn: async () => {
      const args: Record<string, unknown> = {
        p_kind: kind,
        p_radius_miles: radius,
        p_limit: 200,
      }
      if (lat != null && lng != null) { args.p_lat = lat; args.p_lng = lng }
      const { data, error } = await supabase.rpc('discover_list', args as any)
      if (error) throw error
      return ((data ?? []) as Array<{ id: string; title: string; subtitle: string; distance_miles: number; meta: Json }>)
        .map(row => ({
          ...row,
          subtitle: row.subtitle ?? null,
          distance_miles: row.distance_miles ?? null,
          meta: (typeof row.meta === 'object' && row.meta !== null ? row.meta : {}) as Record<string, unknown>,
        }))
    },
  })
}
