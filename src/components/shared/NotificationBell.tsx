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
      className="relative h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0"
    >
      <Bell className="h-5 w-5 text-gray-600" />
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full bg-[#009688] text-[9px] font-bold text-white flex items-center justify-center">
          {count > 9 ? '9+' : count}
        </span>
      )}
    </button>
  )
}
