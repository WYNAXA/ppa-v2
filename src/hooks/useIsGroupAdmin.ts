import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

/**
 * Single source of truth for "is the current user an admin of this group?"
 * Checks BOTH groups.admin_id (legacy) and group_members.role (modern).
 */
export function useIsGroupAdmin(groupId: string | null | undefined) {
  const { profile } = useAuth()
  const userId = profile?.id

  const { data: isAdmin = false, isLoading } = useQuery({
    queryKey: ['is-group-admin', groupId, userId],
    enabled: !!groupId && !!userId,
    staleTime: 60_000,
    queryFn: async () => checkIsGroupAdmin(groupId!, userId!),
  })

  return { isAdmin, isLoading }
}

/**
 * Async version for non-React contexts.
 * Same logic as the hook — checks both admin_id and group_members.role.
 */
export async function checkIsGroupAdmin(groupId: string, userId: string): Promise<boolean> {
  const [groupResult, memberResult] = await Promise.all([
    supabase.from('groups').select('admin_id').eq('id', groupId).single(),
    supabase.from('group_members').select('role').eq('group_id', groupId).eq('user_id', userId).maybeSingle(),
  ])

  // eslint-disable-next-line no-restricted-syntax -- canonical admin check reads both sources
  const isLegacyAdmin = groupResult.data?.admin_id === userId
  const isRoleAdmin = memberResult.data?.role === 'admin'
  return isLegacyAdmin || isRoleAdmin
}
