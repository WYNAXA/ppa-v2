import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

export function NotificationBell() {
  const navigate     = useNavigate()
  const { session }  = useAuth()
  const userId       = session?.user.id
  const queryClient  = useQueryClient()

  const { data: count = 0 } = useQuery<number>({
    queryKey: ['unread-count', userId],
    queryFn: async () => {
      if (!userId) return 0
      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('read', false)
      if (error) return 0
      return count ?? 0
    },
    enabled: !!userId,
  })

  // Realtime updates for unread count
  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel(`notif-bell-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['unread-count', userId] })
          queryClient.invalidateQueries({ queryKey: ['notifications', userId] })
          queryClient.invalidateQueries({ queryKey: ['home-activity', userId] })
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId, queryClient])

  return (
    <button
      onClick={() => navigate('/notifications')}
      aria-label={count > 0 ? `${count} unread` : 'Notifications'}
      className="relative flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-pill border border-hairline bg-card"
    >
      <Bell className="h-5 w-5 text-ink-2" strokeWidth={2} />
      {/* A dot, not a count. The number was never actionable and the board
          uses the dot so the two header controls stay the same silhouette. */}
      {count > 0 && (
        <span className="absolute right-[9px] top-2 h-2 w-2 rounded-pill border-2 border-card bg-alert" />
      )}
    </button>
  )
}
