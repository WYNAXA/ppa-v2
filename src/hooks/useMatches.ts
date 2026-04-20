import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from './useAuth'

export function useMatches() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['matches', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('matches')
        .select('*')
        .contains('player_ids', [user!.id])
        .order('match_date', { ascending: false })
        .limit(50)

      if (error) throw error
      return data ?? []
    },
  })
}
