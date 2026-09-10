import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useNotificationsSubscription } from '@/hooks/useRealtimeSubscription'
import { EmptyState } from '@/components/shared/EmptyState'
import { ChevronLeft, Bell, Trophy, Users, Calendar, Star, CheckCheck, Activity, BookOpen } from 'lucide-react'

interface Notification {
  id: string
  user_id: string
  type: string
  title: string
  message: string
  read: boolean
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
    case 'household_link_request':
    case 'household_link_accepted':
    case 'household_link_declined':
      return '/you'
    case 'connection_request':
    case 'connection_accepted':
      return '/people#connections'
    case 'result_pending_verification':
    case 'result_verified':
    case 'result_disputed':
    case 'match_result_prompt':
    case 'match_deadline_approaching':
    case 'match_auto_cancelled':
    case 'lift_requested':
    case 'lift_accepted':
    case 'lift_declined':
      return `/matches/${n.related_id}`
    default:
      break
  }
  if (n.type === 'ringer_offer' || n.type === 'ringer_approved' || n.type === 'ringer_declined') return `/people/groups/${n.related_id}`
  if (n.type.startsWith('ringer_'))     return `/matches/${n.related_id}`
  if (n.type.startsWith('open_match_')) return `/matches/${n.related_id}`
  if (n.type.startsWith('invitation_') || n.type.startsWith('invitee_') || n.type === 'match_invitation') return `/matches/${n.related_id}`
  if (n.type.includes('match'))  return `/matches/${n.related_id}`
  if (n.type.includes('league')) return `/compete/leagues/${n.related_id}`
  if (n.type.includes('group'))  return `/people/groups/${n.related_id}`
  if (n.type.includes('poll'))   return `/play/availability/${n.related_id}`
  return null
}

function NotifIcon({ type }: { type: string }) {
  const base = 'w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0'
  switch (type) {
    case 'match_created':
    case 'match_scheduled':
    case 'match_suggested':
      return <div className={`${base} bg-court-50`}><Calendar className="w-4 h-4 text-court" /></div>
    case 'match_result':
    case 'result_verify':
      return <div className={`${base} bg-court-50`}><Trophy className="w-4 h-4 text-court" /></div>
    case 'poll_created':
      return <div className={`${base} bg-court-50`}><Activity className="w-4 h-4 text-court" /></div>
    case 'league_update':
    case 'league_invite':
      return <div className={`${base} bg-warn-50`}><Trophy className="w-4 h-4 text-warn" /></div>
    case 'group_invite':
    case 'group_update':
    case 'group_join_request':
      return <div className={`${base} bg-surface`}><Users className="w-4 h-4 text-ink-2" /></div>
    case 'connection_request':
    case 'connection_accepted':
      return <div className={`${base} bg-court-50`}><Users className="w-4 h-4 text-court" /></div>
    case 'result_pending_verification':
    case 'result_verified':
      return <div className={`${base} bg-court-50`}><CheckCheck className="w-4 h-4 text-court" /></div>
    case 'result_disputed':
      return <div className={`${base} bg-alert-50`}><Trophy className="w-4 h-4 text-alert" /></div>
    case 'achievement':
      return <div className={`${base} bg-court-50`}><Star className="w-4 h-4 text-court" /></div>
    case 'court_booked':
      return <div className={`${base} bg-court-50`}><BookOpen className="w-4 h-4 text-court" /></div>
    default:
      return <div className={`${base} bg-hairline`}><Bell className="w-4 h-4 text-ink-2" /></div>
  }
}

export function NotificationsPage() {
  const { session } = useAuth()
  const userId = session?.user.id
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { t } = useTranslation()

  // Realtime: auto-refresh when notifications change
  useNotificationsSubscription(userId ?? null)
  const [markingAll, setMarkingAll] = useState(false)

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['notifications', userId],
    queryFn: async () => {
      if (!userId) return []
      const { data, error } = await supabase
        .from('notifications')
        .select('id, user_id, type, title, message, read, created_at, related_id')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) return []
      return (data ?? []) as Notification[]
    },
    enabled: !!userId,
    staleTime: 60_000,
  })

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      await supabase
        .from('notifications')
        .update({ read: true })
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
        .update({ read: true })
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

  // Group notifications by recency
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterdayStart = todayStart - 86_400_000
  const weekStart = todayStart - 6 * 86_400_000

  const groups: { label: string; items: Notification[] }[] = []
  const today: Notification[] = []
  const yesterday: Notification[] = []
  const thisWeek: Notification[] = []
  const earlier: Notification[] = []

  for (const n of notifications) {
    const ts = new Date(n.created_at).getTime()
    if (ts >= todayStart) today.push(n)
    else if (ts >= yesterdayStart) yesterday.push(n)
    else if (ts >= weekStart) thisWeek.push(n)
    else earlier.push(n)
  }

  if (today.length)     groups.push({ label: t('notifications.today'),     items: today })
  if (yesterday.length) groups.push({ label: t('notifications.yesterday'), items: yesterday })
  if (thisWeek.length)  groups.push({ label: t('notifications.this_week'), items: thisWeek })
  if (earlier.length)   groups.push({ label: t('notifications.earlier'),   items: earlier })

  return (
    <div className="flex flex-col min-h-full bg-surface">
      {/* Header */}
      <div className="bg-card border-b border-hairline px-4 pt-12 pb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-hairline -ml-1"
          >
            <ChevronLeft className="w-5 h-5 text-ink-2" />
          </button>
          <h1 className="text-xl font-bold text-ink flex-1">{t('notifications.title')}</h1>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAll}
              disabled={markingAll}
              className="flex items-center gap-1.5 text-sm font-medium text-court disabled:opacity-50"
            >
              <CheckCheck className="w-4 h-4" />
              {t('notifications.mark_all_read')}
            </button>
          )}
        </div>
        {unreadCount > 0 && (
          <p className="text-xs text-ink-2 mt-1 ml-10">{t('notifications.unread', { count: unreadCount })}</p>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 px-4 py-3">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-court border-t-transparent" />
          </div>
        ) : notifications.length === 0 ? (
          <EmptyState
            icon={<Bell className="h-8 w-8" />}
            title={t('notifications.empty')}
            subtitle={t('notifications.empty_sub')}
          />
        ) : (
          <div className="space-y-4">
            {groups.map((group) => (
              <div key={group.label}>
                <p className="text-[11px] font-bold text-ink-2 uppercase tracking-wide mb-2 px-1">
                  {group.label}
                </p>
                <div className="space-y-1">
                  {group.items.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => handleTap(n)}
                      className={`w-full flex items-start gap-3 p-3 rounded-xl text-left transition-colors ${
                        n.read ? 'bg-card' : 'bg-court-50/60'
                      }`}
                    >
                      <NotifIcon type={n.type} />
                      <div className="flex-1 min-w-0">
                        {n.title && (
                          <p className="text-[12px] font-bold text-ink-2 mb-0.5">{n.title}</p>
                        )}
                        <p className={`text-sm leading-snug ${n.read ? 'text-ink-2' : 'text-ink font-medium'}`}>
                          {n.message}
                        </p>
                        <p className="text-xs text-ink-2 mt-0.5">{timeAgo(n.created_at)}</p>
                      </div>
                      {!n.read && (
                        <div className="w-2 h-2 rounded-full bg-court flex-shrink-0 mt-1.5" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
