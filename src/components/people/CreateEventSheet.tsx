import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, MapPin } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useMyGroups } from '@/hooks/useSocial'
import { format, addHours } from 'date-fns'
import { getDateLocale } from '@/lib/dateLocale'

type Visibility = 'private' | 'connections' | 'group' | 'public'

interface CreateEventSheetProps {
  open: boolean
  onClose: () => void
  /** When opened from a group page, pre-select that group. */
  groupId?: string | null
}

function todayDateTime() {
  return format(addHours(new Date(), 1), "yyyy-MM-dd'T'HH:mm", { locale: getDateLocale() })
}

export function CreateEventSheet({ open, onClose, groupId: initialGroupId }: CreateEventSheetProps) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const userId = user?.id ?? ''

  const [title, setTitle]             = useState('')
  const [startTime, setStartTime]     = useState(todayDateTime())
  const [endTime, setEndTime]         = useState(format(addHours(new Date(), 3), "yyyy-MM-dd'T'HH:mm", { locale: getDateLocale() }))
  const [description, setDescription] = useState('')
  const [visibility, setVisibility]   = useState<Visibility>(initialGroupId ? 'group' : 'connections')
  const [groupId, setGroupId]         = useState<string | null>(initialGroupId ?? null)
  const [venueId, setVenueId]         = useState<string | null>(null)
  const [venueName, setVenueName]     = useState('')
  const [venueQuery, setVenueQuery]   = useState('')

  const { data: myGroups = [] } = useMyGroups(userId)
  const approvedGroups = myGroups.filter(g => g.memberStatus === 'approved')

  // Venue search for public events
  const { data: venueResults = [] } = useQuery({
    queryKey: ['event-venue-search', venueQuery],
    enabled: visibility === 'public' && venueQuery.length >= 2,
    queryFn: async () => {
      const { data } = await supabase
        .from('discoverable_venues')
        .select('venue_id, venue_name, city')
        .eq('venue_type', 'club')
        .ilike('venue_name', `%${venueQuery}%`)
        .limit(5)
      return (data ?? []).filter(v => v.venue_id)
    },
  })

  function reset() {
    setTitle('')
    setStartTime(todayDateTime())
    setEndTime(format(addHours(new Date(), 3), "yyyy-MM-dd'T'HH:mm", { locale: getDateLocale() }))
    setDescription('')
    setVisibility(initialGroupId ? 'group' : 'connections')
    setGroupId(initialGroupId ?? null)
    setVenueId(null)
    setVenueName('')
    setVenueQuery('')
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not authenticated')

      const isPublic = visibility === 'public'

      // Determine if the user can publish directly (platform admin or venue
      // staff). RLS is the authority — if our guess is wrong the insert fails,
      // and we fall back to a pending submission rather than showing a raw error.
      let canPublish = !isPublic // non-public events publish immediately
      if (isPublic) {
        const { data: isAdmin } = await supabase.rpc('is_platform_admin')
        if (isAdmin) {
          canPublish = true
        } else if (venueId) {
          const { data: isStaff } = await supabase.rpc('is_venue_staff', { p_venue_id: venueId })
          if (isStaff) canPublish = true
        }
      }

      const row: Record<string, unknown> = {
        created_by:  user.id,
        title:       title.trim(),
        start_time:  new Date(startTime).toISOString(),
        end_time:    endTime ? new Date(endTime).toISOString() : null,
        description: description.trim() || null,
        visibility,
        status:      canPublish ? 'published' : 'pending',
        group_id:    visibility === 'group' ? groupId : null,
      }

      if (isPublic) {
        row.is_official = canPublish
        row.source_type = canPublish ? 'venue' : 'player'
        if (venueId) {
          row.padel_venue_id = venueId
        }
        // No profile fallback — a public event must have a venue, never the
        // author's home coordinates. publicNeedsVenue blocks submission.
      }

      const { error } = await supabase.from('events').insert(row as any) // Workaround: payload built dynamically from form state
      if (error) {
        // RLS rejected the status — fall back to pending and retry once.
        if (isPublic && canPublish) {
          row.status = 'pending'
          row.is_official = false
          row.source_type = 'player'
          const { error: retryErr } = await supabase.from('events').insert(row as any) // Workaround: payload built dynamically from form state
          if (retryErr) {
            console.error('[CreateEvent] retry as pending failed:', retryErr)
            throw retryErr
          }
          return 'pending_fallback'
        }
        console.error('[CreateEvent] insert error:', error)
        throw error
      }
      return canPublish ? 'published' : 'pending'
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['discover-feed'] })
      if (groupId) queryClient.invalidateQueries({ queryKey: ['group-events', groupId] })
      if (result === 'pending' || result === 'pending_fallback') {
        toast(t('create_event.pending_toast'))
      } else {
        toast.success(t('create_event.published_toast'))
      }
      reset()
      onClose()
    },
  })

  const publicNeedsVenue = visibility === 'public' && !venueId
  const canSubmit = title.trim().length > 0 && startTime
    && (visibility !== 'group' || !!groupId)
    && !publicNeedsVenue

  const VISIBILITY_OPTIONS: Array<{ value: Visibility; label: string; note?: string }> = [
    { value: 'private',     label: t('create_event.vis_private') },
    { value: 'connections', label: t('create_event.vis_connections') },
    ...(approvedGroups.length > 0
      ? [{ value: 'group' as Visibility, label: t('create_event.vis_group') }]
      : []),
    { value: 'public', label: t('create_event.vis_public'), note: t('create_event.vis_public_note') },
  ]

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[55] bg-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-[60] bg-card rounded-t-3xl"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1 w-10 rounded-full bg-hairline" />
            </div>
            <div className="flex items-center justify-between px-5 py-3">
              <button onClick={onClose} className="h-9 w-9 rounded-full bg-hairline flex items-center justify-center">
                <X className="h-4 w-4 text-ink-2" />
              </button>
              <h2 className="text-[15px] font-bold text-ink">{t('create_event.title')}</h2>
              <div className="w-9" />
            </div>

            <div
              className="px-5 overflow-y-auto space-y-4"
              style={{ maxHeight: '80vh', paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}
            >
              {/* Title */}
              <div>
                <label className="block text-[13px] font-medium text-ink-2 mb-1.5">
                  {t('create_event.field_title')} <span className="text-alert">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t('create_event.title_placeholder')}
                  style={{ fontSize: '16px', width: '100%', boxSizing: 'border-box' }}
                  className="w-full rounded-xl border border-hairline px-3 py-2.5 outline-none focus:border-court focus:ring-2 focus:ring-court/20"
                />
              </div>

              {/* Visibility */}
              <div>
                <label className="block text-[13px] font-medium text-ink-2 mb-1.5">
                  {t('create_event.field_visibility')}
                </label>
                <div className="flex flex-wrap gap-2">
                  {VISIBILITY_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => {
                        setVisibility(opt.value)
                        if (opt.value !== 'group') setGroupId(null)
                      }}
                      className={`rounded-pill border px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                        visibility === opt.value
                          ? 'border-court bg-court text-white'
                          : 'border-hairline bg-card text-ink-2'
                      }`}
                    >
                      {opt.value === 'group' && groupId
                        ? approvedGroups.find(g => g.id === groupId)?.name ?? opt.label
                        : opt.label}
                    </button>
                  ))}
                </div>
                {visibility === 'public' && (
                  <p className="mt-1.5 text-[12px] text-ink-2">
                    {t('create_event.pending_review_note')}
                  </p>
                )}
              </div>

              {/* Group picker — only when visibility is 'group' */}
              {visibility === 'group' && approvedGroups.length > 0 && (
                <div>
                  <label className="block text-[13px] font-medium text-ink-2 mb-1.5">
                    {t('create_event.field_group')}
                  </label>
                  <select
                    value={groupId ?? ''}
                    onChange={(e) => setGroupId(e.target.value || null)}
                    className="w-full rounded-xl border border-hairline px-3 py-2.5 text-[15px] outline-none focus:border-court"
                  >
                    <option value="">{t('create_event.select_group')}</option>
                    {approvedGroups.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Venue picker — required for public events */}
              {visibility === 'public' && (
                <div>
                  <label className="block text-[13px] font-medium text-ink-2 mb-1.5">
                    {t('create_event.field_venue')} <span className="text-alert">*</span>
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-2" />
                    <input
                      type="text"
                      value={venueId ? venueName : venueQuery}
                      onChange={(e) => {
                        setVenueQuery(e.target.value)
                        setVenueId(null)
                        setVenueName('')
                      }}
                      placeholder={t('create_event.venue_placeholder')}
                      style={{ fontSize: '16px', width: '100%', boxSizing: 'border-box' }}
                      className="w-full rounded-xl border border-hairline pl-9 pr-3 py-2.5 outline-none focus:border-court focus:ring-2 focus:ring-court/20"
                    />
                  </div>
                  {venueResults.length > 0 && !venueId && (
                    <div className="mt-1 rounded-xl border border-hairline bg-card shadow-sm overflow-hidden">
                      {venueResults.map((v: any) => (
                        <button
                          key={v.venue_id}
                          onClick={() => {
                            setVenueId(v.venue_id)
                            setVenueName(v.venue_name ?? '')
                            setVenueQuery('')
                          }}
                          className="w-full px-3 py-2 text-left text-[13px] hover:bg-surface border-b border-hairline last:border-0"
                        >
                          <span className="font-medium text-ink">{v.venue_name}</span>
                          {v.city && <span className="text-ink-2"> · {v.city}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                  {publicNeedsVenue && (
                    <p className="mt-1.5 text-[12px] text-alert">{t('create_event.venue_required')}</p>
                  )}
                </div>
              )}

              {/* Start time */}
              <div>
                <label className="block text-[13px] font-medium text-ink-2 mb-1.5">{t('create_event.field_start')}</label>
                <input
                  type="datetime-local"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  style={{ fontSize: '16px', width: '100%', boxSizing: 'border-box' }}
                  className="w-full rounded-xl border border-hairline px-3 py-2.5 outline-none focus:border-court focus:ring-2 focus:ring-court/20"
                />
              </div>

              {/* End time */}
              <div>
                <label className="block text-[13px] font-medium text-ink-2 mb-1.5">
                  {t('create_event.field_end')} <span className="text-ink-2 font-normal">({t('create_event.optional')})</span>
                </label>
                <input
                  type="datetime-local"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  style={{ fontSize: '16px', width: '100%', boxSizing: 'border-box' }}
                  className="w-full rounded-xl border border-hairline px-3 py-2.5 outline-none focus:border-court focus:ring-2 focus:ring-court/20"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-[13px] font-medium text-ink-2 mb-1.5">
                  {t('create_event.field_description')} <span className="text-ink-2 font-normal">({t('create_event.optional')})</span>
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('create_event.description_placeholder')}
                  rows={2}
                  style={{ fontSize: '16px', width: '100%', boxSizing: 'border-box' }}
                  className="w-full rounded-xl border border-hairline px-3 py-2.5 outline-none focus:border-court focus:ring-2 focus:ring-court/20 resize-none"
                />
              </div>

              {createMutation.isError && (
                <p className="text-[12px] text-alert text-center">{t('create_event.error')}</p>
              )}

              <button
                onClick={() => createMutation.mutate()}
                disabled={!canSubmit || createMutation.isPending}
                className="w-full rounded-2xl bg-court py-3.5 text-[14px] font-bold text-white disabled:opacity-40"
              >
                {createMutation.isPending ? t('create_event.creating') : t('create_event.submit')}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
