import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'

interface PushToOpenSheetProps {
  open: boolean
  onClose: () => void
  matchId: string
  currentPlayerIds: string[]
  onSent: () => void
  isEditing?: boolean
  existingMin?: number | null
  existingMax?: number | null
  anchorLat?: number | null
  anchorLng?: number | null
}

export function PushToOpenSheet({ open, onClose, matchId, currentPlayerIds, onSent, isEditing = false, existingMin, existingMax, anchorLat, anchorLng }: PushToOpenSheetProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const { data: playerElos = [] } = useQuery({
    queryKey: ['match-player-elos-open', currentPlayerIds.join(',')],
    enabled: open && currentPlayerIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('internal_ranking').in('id', currentPlayerIds)
      return (data ?? []).map((p: any) => p.internal_ranking as number | null).filter((r): r is number => r != null)
    },
  })

  const teamAvg = useMemo(() => {
    return playerElos.length > 0 ? Math.round(playerElos.reduce((s, r) => s + r, 0) / playerElos.length) : 1300
  }, [playerElos])

  const [eloMin, setEloMin] = useState<number | null>(null)
  const [eloMax, setEloMax] = useState<number | null>(null)

  const min = eloMin ?? existingMin ?? Math.max(600, teamAvg - 200)
  const max = eloMax ?? existingMax ?? Math.min(2500, teamAvg + 200)

  const hasGeo = anchorLat != null && anchorLng != null

  // Geo-scoped audience count
  const { data: audienceCount } = useQuery({
    queryKey: ['open-match-audience', min, max, anchorLat, anchorLng, currentPlayerIds.join(',')],
    enabled: open && hasGeo,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('count_open_match_audience', {
        p_lat: anchorLat!,
        p_lng: anchorLng!,
        p_elo_min: min,
        p_elo_max: max,
        p_exclude_player_ids: currentPlayerIds,
      })
      if (error) return null
      return data as number
    },
  })

  const pushMutation = useMutation({
    mutationFn: async () => {
      if (isEditing) {
        const { error } = await supabase.rpc('update_open_match_range', {
          p_match_id: matchId, p_elo_min: min, p_elo_max: max,
        })
        if (error) throw error
      } else {
        const { error } = await supabase.rpc('push_match_to_open', {
          p_match_id: matchId, p_elo_min: min, p_elo_max: max,
        })
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['match', matchId] })
      onSent()
      onClose()
    },
  })

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 z-[60] bg-black/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-[70] bg-white rounded-t-3xl"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            <div className="flex justify-center pt-3 pb-1"><div className="h-1 w-10 rounded-full bg-gray-200" /></div>
            <div className="flex items-center justify-between px-5 py-3">
              <h2 className="text-[15px] font-bold text-gray-900">{t('open_matches.push_sheet_title')}</h2>
              <button onClick={onClose} className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center">
                <X className="h-4 w-4 text-gray-500" />
              </button>
            </div>
            <div className="px-5 pb-6" style={{ paddingBottom: 'calc(32px + env(safe-area-inset-bottom))' }}>
              <p className="text-[12px] text-gray-400 mb-5">{t('open_matches.push_sheet_subtitle')}</p>

              <div className="space-y-4 mb-5">
                <div>
                  <label className="text-[12px] font-semibold text-gray-700 mb-1 block">{t('open_matches.push_elo_min')}</label>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setEloMin(Math.max(600, min - 50))} className="h-8 w-8 rounded-lg border border-gray-200 text-gray-500 font-bold">-</button>
                    <span className="text-[16px] font-bold text-gray-800 w-16 text-center">{min}</span>
                    <button onClick={() => setEloMin(Math.min(max - 50, min + 50))} className="h-8 w-8 rounded-lg border border-gray-200 text-gray-500 font-bold">+</button>
                  </div>
                </div>
                <div>
                  <label className="text-[12px] font-semibold text-gray-700 mb-1 block">{t('open_matches.push_elo_max')}</label>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setEloMax(Math.max(min + 50, max - 50))} className="h-8 w-8 rounded-lg border border-gray-200 text-gray-500 font-bold">-</button>
                    <span className="text-[16px] font-bold text-gray-800 w-16 text-center">{max}</span>
                    <button onClick={() => setEloMax(Math.min(2500, max + 50))} className="h-8 w-8 rounded-lg border border-gray-200 text-gray-500 font-bold">+</button>
                  </div>
                </div>
              </div>

              <p className="text-[12px] text-gray-500 mb-4">
                {hasGeo && audienceCount != null
                  ? t('open_matches.push_audience', { count: audienceCount })
                  : !hasGeo
                    ? 'Audience count not available \u2014 no location set'
                    : '...'}
              </p>

              <button
                onClick={() => pushMutation.mutate()}
                disabled={pushMutation.isPending || min >= max}
                className="w-full rounded-2xl bg-[#009688] py-3.5 text-[14px] font-bold text-white disabled:opacity-50"
              >
                {pushMutation.isPending ? 'Saving\u2026' : isEditing ? 'Update ELO range' : t('open_matches.push_confirm')}
              </button>

              {pushMutation.isError && (
                <p className="text-[12px] text-red-500 text-center mt-2">Failed. Try again.</p>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
