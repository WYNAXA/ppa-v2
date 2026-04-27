import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { ChevronLeft, Bell, Trophy, Users, Calendar, Star, CheckCheck, Activity, BookOpen } from 'lucide-react'

interface Notification {
  id: string
  user_id: string
  type: string
  title: string
  message: string
  read: boolean
  read_at?: string | null
  created_at: string
  related_id: string | null
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1)  return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function getNavTarget(n: Notification): string | null {
  if (!n.related_id) return null
  switch (n.type) {
    case 'match_created':
    case 'match_result':
    case 'match_suggested':
    case 'result_verify':
      return `/matches/${n.related_id}`
    case 'poll_created':
      return `/play/availability/${n.related_id}`
    case 'league_invite':
      return `/compete/leagues/${n.related_id}`
    case 'achievement':
      return '/you'
    default:
      break
  }
  if (n.type.includes('match'))  return `/matches/${n.related_id}`
  if (n.type.includes('league')) return `/compete/leagues/${n.related_id}`
  if (n.type.includes('group'))  return `/community/groups/${n.related_id}`
  if (n.type.includes('poll'))   return `/play/availability/${n.related_id}`
  return null
}

function NotifIcon({ type }: { type: string }) {
  const base = 'w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0'
  switch (type) {
    case 'match_created':
    case 'match_scheduled':
    case 'match_suggested':
      return <div className={`${base} bg-teal-50`}><Calendar className="w-4 h-4 text-[#009688]" /></div>
    case 'match_result':
    case 'result_verify':
      return <div className={`${base} bg-teal-50`}><Trophy className="w-4 h-4 text-[#009688]" /></div>
    case 'poll_created':
      return <div className={`${base} bg-teal-50`}><Activity className="w-4 h-4 text-[#009688]" /></div>
    case 'league_update':
    case 'league_invite':
      return <div className={`${base} bg-amber-50`}><Trophy className="w-4 h-4 text-amber-500" /></div>
    case 'group_invite':
    case 'group_update':
      return <div className={`${base} bg-blue-50`}><Users className="w-4 h-4 text-blue-500" /></div>
    case 'achievement':
      return <div className={`${base} bg-purple-50`}><Star className="w-4 h-4 text-purple-500" /></div>
    case 'court_booked':
      return <div className={`${base} bg-green-50`}><BookOpen className="w-4 h-4 text-green-500" /></div>
    default:
      return <div className={`${base} bg-gray-100`}><Bell className="w-4 h-4 text-gray-500" /></div>
  }
}

export function NotificationsPage() {
  const { session } = useAuth()
  const userId = session?.user.id
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [markingAll, setMarkingAll] = useState(false)

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['notifications', userId],
    queryFn: async () => {
      if (!userId) return []
      const { data, error } = await supabase
        .from('notifications')
        .select('id, user_id, type, title, message, read, read_at, created_at, related_id')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) return []
      return (data ?? []) as Notification[]
    },
    enabled: !!userId,
  })

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      await supabase
        .from('notifications')
        .update({ read: true, read_at: new Date().toISOString() })
        .eq('id', id)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications', userId] })
      qc.invalidateQueries({ queryKey: ['unread-count', userId] })
    },
  })

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      if (!userId) return
      await supabase
        .from('notifications')
        .update({ read: true, read_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('read', false)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications', userId] })
      qc.invalidateQueries({ queryKey: ['unread-count', userId] })
      setMarkingAll(false)
    },
  })

  const unreadCount = notifications.filter((n) => !n.read).length

  function handleTap(n: Notification) {
    if (!n.read) markReadMutation.mutate(n.id)
    const target = getNavTarget(n)
    if (target) navigate(target)
  }

  function handleMarkAll() {
    setMarkingAll(true)
    markAllReadMutation.mutate()
  }

  return (
    <div className="flex flex-col min-h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 pt-12 pb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 -ml-1"
          >
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="text-xl font-bold text-gray-900 flex-1">Notifications</h1>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAll}
              disabled={markingAll}
              className="flex items-center gap-1.5 text-sm font-medium text-[#009688] disabled:opacity-50"
            >
              <CheckCheck className="w-4 h-4" />
              Mark all read
            </button>
          )}
        </div>
        {unreadCount > 0 && (
          <p className="text-xs text-gray-400 mt-1 ml-10">{unreadCount} unread</p>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 px-4 py-3">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#009688] border-t-transparent" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <Bell className="w-7 h-7 text-gray-300" />
            </div>
            <p className="text-gray-500 font-medium">No notifications yet</p>
            <p className="text-gray-400 text-sm mt-1">We'll let you know when something happens</p>
          </div>
        ) : (
          <div className="space-y-1">
            {notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => handleTap(n)}
                className={`w-full flex items-start gap-3 p-3 rounded-xl text-left transition-colors ${
                  n.read ? 'bg-white' : 'bg-teal-50/60'
                }`}
              >
                <NotifIcon type={n.type} />
                <div className="flex-1 min-w-0">
                  {n.title && (
                    <p className="text-[12px] font-bold text-gray-500 mb-0.5">{n.title}</p>
                  )}
                  <p className={`text-sm leading-snug ${n.read ? 'text-gray-700' : 'text-gray-900 font-medium'}`}>
                    {n.message}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">{timeAgo(n.created_at)}</p>
                </div>
                {!n.read && (
                  <div className="w-2 h-2 rounded-full bg-[#009688] flex-shrink-0 mt-1.5" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
