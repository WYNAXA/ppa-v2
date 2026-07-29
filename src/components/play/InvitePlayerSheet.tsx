import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Search, UserPlus } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { sendNotification } from '@/lib/notifications'
import { useAuth } from '@/hooks/useAuth'
import { shareMatchInvite, pickContact, isContactPickerSupported } from '@/lib/invites'
import { toast } from 'sonner'
import { PlayerAvatar } from '@/components/shared/PlayerAvatar'
import { UserRound } from 'lucide-react'

interface PlayerResult {
  id: string
  name: string
  avatar_url: string | null
  playtomic_level: number | null
}

interface InvitePlayerSheetProps {
  open: boolean
  onClose: () => void
  matchId: string
  currentPlayerIds: string[]
}

function useDebounce<T>(value: T, delay: number) {
  const [dv, setDv] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDv(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return dv
}

export function InvitePlayerSheet({ open, onClose, matchId, currentPlayerIds }: InvitePlayerSheetProps) {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const [query, setQuery]       = useState('')
  const [results, setResults]   = useState<PlayerResult[]>([])
  const [searching, setSearching] = useState(false)
  const [showGuestForm, setShowGuestForm] = useState(false)
  const [guestName, setGuestName] = useState('')
  const [guestContact, setGuestContact] = useState('')
  const debouncedQuery = useDebounce(query, 300)
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!open) { setQuery(''); setResults([]); setShowGuestForm(false); setGuestName(''); setGuestContact('') }
  }, [open])

  useEffect(() => {
    if (debouncedQuery.length < 2) { setResults([]); return }
    setSearching(true)
    const excluded = currentPlayerIds.length > 0 ? currentPlayerIds : ['00000000-0000-0000-0000-000000000000']
    supabase
      .from('profiles')
      .select('id, name, avatar_url, playtomic_level')
      .ilike('name', `%${debouncedQuery}%`)
      .not('id', 'in', `(${excluded.join(',')})`)
      .limit(10)
      .then(({ data }) => {
        setResults(data ?? [])
        setSearching(false)
      })
  }, [debouncedQuery, currentPlayerIds])

  const inviteMutation = useMutation({
    mutationFn: async (player: PlayerResult) => {
      const newPlayerIds = [...currentPlayerIds, player.id]
      const willBeFull = newPlayerIds.length >= 4
      const updates: Record<string, any> = { player_ids: newPlayerIds }
      if (willBeFull) {
        updates.is_open = false
        updates.open_elo_min = null
        updates.open_elo_max = null
        updates.status = 'scheduled'
      }
      const { error } = await supabase
        .from('matches')
        .update(updates)
        .eq('id', matchId)
      if (error) throw error

      sendNotification({
        user_id: player.id,
        type: 'match_created',
        title: 'Match invitation',
        message: 'You have been invited to a padel match',
        related_id: matchId,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['match', matchId] })
      queryClient.invalidateQueries({ queryKey: ['matches'] })
      onClose()
    },
  })

  // Add a new (non-PPA) player: creates a real guest slot + shareable invite link,
  // then opens the native share sheet so the host can send it via WhatsApp/Messages.
  const guestMutation = useMutation({
    mutationFn: async () => {
      const name = guestName.trim()
      if (!name) return null
      const { data, error } = await supabase.rpc('create_match_guest_invite', {
        p_match_id: matchId,
        p_guest_name: name,
        p_contact: guestContact.trim() || null,
      })
      if (error) throw error
      return (data as { token?: string })?.token ?? null
    },
    onSuccess: async (token) => {
      queryClient.invalidateQueries({ queryKey: ['match', matchId] })
      queryClient.invalidateQueries({ queryKey: ['matches'] })
      if (token) {
        const res = await shareMatchInvite({ token, guestName: guestName.trim(), inviterName: profile?.name })
        if (res === 'copied') toast.success(t('invite.link_copied', 'Invite link copied — paste it to them'))
      }
      onClose()
    },
  })

  async function chooseFromContacts() {
    const c = await pickContact()
    if (!c) return
    if (c.name) setGuestName(c.name)
    if (c.tel || c.email) setGuestContact(c.tel ?? c.email ?? '')
  }

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
              <h2 className="text-[15px] font-bold text-gray-900">{t('invite.title')}</h2>
              <div className="w-9" />
            </div>

            <div
              className="px-5 overflow-y-auto"
              style={{ paddingBottom: 'calc(48px + env(safe-area-inset-bottom))', maxHeight: '75vh' }}
            >
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('invite.search_placeholder')}
                  autoFocus
                  className="w-full rounded-xl border border-gray-200 pl-9 pr-4 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
                />
              </div>

              {searching && (
                <div className="flex justify-center py-6">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#009688] border-t-transparent" />
                </div>
              )}

              {inviteMutation.isError && (
                <p className="text-[12px] text-red-500 text-center mb-3">{t('invite.failed')}</p>
              )}

              {results.length > 0 && (
                <div className="space-y-1">
                  {results.map((player) => (
                    <button
                      key={player.id}
                      onClick={() => inviteMutation.mutate(player)}
                      disabled={inviteMutation.isPending}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors text-left disabled:opacity-50"
                    >
                      <PlayerAvatar name={player.name} avatarUrl={player.avatar_url} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-gray-800 truncate">{player.name}</p>
                      </div>
                      <UserPlus className="h-4 w-4 text-[#009688] flex-shrink-0" />
                    </button>
                  ))}
                </div>
              )}

              {!searching && debouncedQuery.length >= 2 && results.length === 0 && (
                <div className="py-10 text-center">
                  <p className="text-[13px] text-gray-400">{t('invite.no_results', { query: debouncedQuery })}</p>
                </div>
              )}

              {query.length < 2 && !searching && !showGuestForm && (
                <div className="py-10 text-center">
                  <p className="text-[13px] text-gray-400">{t('invite.type_to_search')}</p>
                </div>
              )}

              {/* Add guest player option */}
              {!showGuestForm ? (
                <button
                  onClick={() => setShowGuestForm(true)}
                  className="w-full flex items-center gap-3 px-3 py-3 mt-2 rounded-xl border border-dashed border-gray-200 hover:border-teal-300 hover:bg-teal-50/30 transition-colors text-left"
                >
                  <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <UserPlus className="h-4 w-4 text-gray-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-gray-600">{t('invite.add_guest')}</p>
                    <p className="text-[11px] text-gray-400">{t('invite.guest_description')}</p>
                  </div>
                </button>
              ) : (
                <div className="mt-2 rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
                  <p className="text-[13px] font-bold text-gray-700">{t('invite.add_guest_title')}</p>
                  {isContactPickerSupported() && (
                    <button
                      type="button"
                      onClick={chooseFromContacts}
                      className="w-full flex items-center justify-center gap-2 rounded-xl border border-teal-200 bg-white py-2.5 text-[13px] font-semibold text-teal-700"
                    >
                      <UserRound className="h-4 w-4" /> {t('invite.from_contacts', 'Choose from contacts')}
                    </button>
                  )}
                  <input
                    type="text"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder={t('invite.guest_name_placeholder')}
                    autoFocus
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
                  />
                  <input
                    type="text"
                    value={guestContact}
                    onChange={(e) => setGuestContact(e.target.value)}
                    placeholder={t('invite.guest_contact_optional', 'Phone or email (optional)')}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
                  />
                  <p className="text-[11px] text-gray-400 leading-snug">{t('invite.guest_share_hint', "We'll create an invite link — the share sheet opens so you can send it via WhatsApp or Messages. No number needed.")}</p>
                  {guestMutation.isError && (
                    <p className="text-[12px] text-red-500">{t('invite.add_guest_failed')}</p>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setShowGuestForm(false); setGuestName(''); setGuestContact('') }}
                      className="flex-1 rounded-xl border border-gray-200 py-2.5 text-[13px] font-semibold text-gray-600"
                    >
                      {t('match.cancel')}
                    </button>
                    <button
                      onClick={() => guestMutation.mutate()}
                      disabled={!guestName.trim() || guestMutation.isPending}
                      className="flex-1 rounded-xl bg-[#009688] py-2.5 text-[13px] font-bold text-white disabled:opacity-40"
                    >
                      {guestMutation.isPending ? t('invite.adding_guest') : t('invite.invite_and_share', 'Invite & share link')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
