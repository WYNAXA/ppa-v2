import { motion, AnimatePresence } from 'framer-motion'
import { X, Users } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { sendNotification } from '@/lib/notifications'
import { useAuth } from '@/hooks/useAuth'

interface InviteToGroupSheetProps {
  open: boolean
  onClose: () => void
  playerId: string
  playerName: string
}

export function InviteToGroupSheet({ open, onClose, playerId, playerName }: InviteToGroupSheetProps) {
  const { profile } = useAuth()
  const userId = profile?.id ?? ''
  const queryClient = useQueryClient()
  const { t } = useTranslation()

  const { data: adminGroups = [], isLoading } = useQuery({
    queryKey: ['admin-groups-for-invite', userId],
    enabled: open && !!userId,
    queryFn: async () => {
      // Get groups where I'm admin (via role)
      const { data: memberships } = await supabase
        .from('group_members')
        .select('group_id, groups(id, name, city)')
        .eq('user_id', userId)
        .eq('role', 'admin')
        .eq('status', 'approved')

      // Also check legacy admin_id
      const { data: legacyGroups } = await supabase
        .from('groups')
        .select('id, name, city')
        .eq('admin_id', userId)

      const groupMap = new Map<string, { id: string; name: string; city: string | null }>()
      for (const m of memberships ?? []) {
        const g = Array.isArray(m.groups) ? m.groups[0] : m.groups
        if (g) groupMap.set(g.id, g as any)
      }
      for (const g of legacyGroups ?? []) {
        groupMap.set(g.id, g)
      }
      return Array.from(groupMap.values())
    },
  })

  const inviteMutation = useMutation({
    mutationFn: async (group: { id: string; name: string }) => {
      await sendNotification({
        user_id: playerId,
        type: 'group_invite',
        title: 'Group invitation',
        message: `${profile?.name ?? 'A player'} invited you to join ${group.name}`,
        related_id: group.id,
      })
    },
    onSuccess: (_data, group) => {
      toast.success(t('community.invite_sent', { player: playerName.split(' ')[0], group: group.name }))
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      onClose()
    },
    onError: () => {
      toast.error(t('community.invite_failed'))
    },
  })

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[55] bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-[60] bg-white rounded-t-3xl"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1 w-10 rounded-full bg-gray-200" />
            </div>
            <div className="flex items-center justify-between px-5 py-3">
              <button onClick={onClose} className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center">
                <X className="h-4 w-4 text-gray-600" />
              </button>
              <h2 className="text-[15px] font-bold text-gray-900">Invite to group</h2>
              <div className="w-9" />
            </div>
            <div className="px-5 pb-6 overflow-y-auto" style={{ maxHeight: '60vh', paddingBottom: 'calc(32px + env(safe-area-inset-bottom))' }}>
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#009688] border-t-transparent" />
                </div>
              ) : adminGroups.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-[13px] text-gray-500">You don't admin any groups yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-[11px] text-gray-400 mb-2">Invite {playerName.split(' ')[0]} to one of your groups:</p>
                  {adminGroups.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => inviteMutation.mutate(g)}
                      disabled={inviteMutation.isPending}
                      className="w-full flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-left active:scale-[0.98] transition-transform disabled:opacity-50"
                    >
                      <div className="h-9 w-9 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                        <Users className="h-4 w-4 text-blue-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-gray-800 truncate">{g.name}</p>
                        {g.city && <p className="text-[11px] text-gray-400">{g.city}</p>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {inviteMutation.isError && (
                <p className="text-[12px] text-red-500 text-center mt-3">Failed to send invitation. Try again.</p>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
