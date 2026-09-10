import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { sendNotification } from '@/lib/notifications'
import { useAuth } from '@/hooks/useAuth'
import { ConnectionCard } from './ConnectionCard'

interface ConnectionRequestCardProps {
  request: { user_id: string; name: string; avatar_url?: string | null; city?: string | null; internal_ranking?: number | null }
}

export function ConnectionRequestCard({ request }: ConnectionRequestCardProps) {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const userId = profile?.id ?? ''

  const acceptMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('accept_connection_request', {
        p_requester_id: request.user_id,
      })
      if (error) throw error

      // Notify the requester
      sendNotification({
        user_id: request.user_id,
        type: 'connection_accepted',
        title: t('people.notif_connection_accepted'),
        message: `${profile?.name ?? 'A player'} accepted your connection request.`,
        related_id: userId,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-connections', userId] })
      toast.success(t('people.toast_connection_accepted'))
    },
  })

  const declineMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('player_connections')
        .delete()
        .eq('user_id', request.user_id)
        .eq('connected_user_id', userId)
        .eq('status', 'pending')
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-connections', userId] })
      toast.success(t('people.toast_connection_declined'))
    },
  })

  const busy = acceptMutation.isPending || declineMutation.isPending

  return (
    <ConnectionCard player={request}>
      <button
        onClick={() => acceptMutation.mutate()}
        disabled={busy}
        className="rounded-lg bg-court px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
      >
        {t('people.accept')}
      </button>
      <button
        onClick={() => declineMutation.mutate()}
        disabled={busy}
        className="rounded-lg border border-hairline px-3 py-1.5 text-[11px] font-bold text-ink-2 disabled:opacity-50"
      >
        {t('people.decline')}
      </button>
    </ConnectionCard>
  )
}
