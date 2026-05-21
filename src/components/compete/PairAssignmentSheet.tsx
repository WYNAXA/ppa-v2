import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Shuffle, BarChart3, Hand } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { PlayerAvatar } from '@/components/shared/PlayerAvatar'
import { PairAvatar } from '@/components/shared/PairAvatar'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Member {
  id: string
  name: string
  avatar_url: string | null
  internal_ranking: number
}

interface Pair {
  player1: Member
  player2: Member
  teamName: string
}

interface PairAssignmentSheetProps {
  open: boolean
  onClose: () => void
  leagueId: string
  members: Member[]
  onSaved: () => void
}

// ── Pairing algorithms ────────────────────────────────────────────────────────

function autoBalancePairs(members: Member[]): Pair[] {
  const sorted = [...members].sort((a, b) => b.internal_ranking - a.internal_ranking)
  const pairs: Pair[] = []
  let lo = 0
  let hi = sorted.length - 1
  while (lo < hi) {
    const p1 = sorted[lo]
    const p2 = sorted[hi]
    const [first, second] = p1.id < p2.id ? [p1, p2] : [p2, p1]
    pairs.push({
      player1: first,
      player2: second,
      teamName: `${p1.name.split(' ')[0]} & ${p2.name.split(' ')[0]}`,
    })
    lo++
    hi--
  }
  return pairs
}

function randomPairs(members: Member[]): Pair[] {
  const shuffled = [...members]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  const pairs: Pair[] = []
  for (let i = 0; i < shuffled.length - 1; i += 2) {
    const p1 = shuffled[i]
    const p2 = shuffled[i + 1]
    const [first, second] = p1.id < p2.id ? [p1, p2] : [p2, p1]
    pairs.push({
      player1: first,
      player2: second,
      teamName: `${p1.name.split(' ')[0]} & ${p2.name.split(' ')[0]}`,
    })
  }
  return pairs
}

// ── Component ─────────────────────────────────────────────────────────────────

type Step = 'mode' | 'manual' | 'review'

export function PairAssignmentSheet({ open, onClose, leagueId, members, onSaved }: PairAssignmentSheetProps) {
  const { t } = useTranslation('', { keyPrefix: 'pairs' })
  const [step, setStep] = useState<Step>('mode')
  const [pairs, setPairs] = useState<Pair[]>([])
  const [selected, setSelected] = useState<Member | null>(null)
  const [unpaired, setUnpaired] = useState<Member[]>([])
  const [saving, setSaving] = useState(false)
  const [editingIdx, setEditingIdx] = useState<number | null>(null)

  function reset() {
    setStep('mode')
    setPairs([])
    setSelected(null)
    setUnpaired([])
    setEditingIdx(null)
  }

  function handleClose() {
    reset()
    onClose()
  }

  // ── Mode selection handlers ─────────────────────────────────────────────

  function handleAutoBalance() {
    if (members.length % 2 !== 0) {
      toast.error(t('odd_members_error', { count: members.length }))
      return
    }
    setPairs(autoBalancePairs(members))
    setStep('review')
  }

  function handleRandom() {
    if (members.length % 2 !== 0) {
      toast.error(t('odd_members_error', { count: members.length }))
      return
    }
    setPairs(randomPairs(members))
    setStep('review')
  }

  function handleManual() {
    if (members.length % 2 !== 0) {
      toast.error(t('odd_members_error', { count: members.length }))
      return
    }
    setUnpaired([...members])
    setPairs([])
    setSelected(null)
    setStep('manual')
  }

  // ── Manual pairing ──────────────────────────────────────────────────────

  function handleTapPlayer(member: Member) {
    if (!selected) {
      setSelected(member)
      return
    }
    if (selected.id === member.id) {
      setSelected(null)
      return
    }
    const p1 = selected
    const p2 = member
    const [first, second] = p1.id < p2.id ? [p1, p2] : [p2, p1]
    setPairs((prev) => [
      ...prev,
      {
        player1: first,
        player2: second,
        teamName: `${p1.name.split(' ')[0]} & ${p2.name.split(' ')[0]}`,
      },
    ])
    setUnpaired((prev) => prev.filter((m) => m.id !== p1.id && m.id !== p2.id))
    setSelected(null)
  }

  function canProceedToReview() {
    return unpaired.length === 0 && pairs.length > 0
  }

  // ── Save ────────────────────────────────────────────────────────────────

  async function handleConfirm() {
    setSaving(true)
    const rows = pairs.map((p) => ({
      league_id: leagueId,
      player1_id: p.player1.id,
      player2_id: p.player2.id,
      team_name: p.teamName,
    }))

    const { error } = await supabase.from('league_teams').insert(rows)
    if (error) {
      toast.error(error.message)
      setSaving(false)
      return
    }

    toast.success(t('pairs_saved'))
    setSaving(false)
    onSaved()
    handleClose()
  }

  if (!open) return null

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/40"
        onClick={handleClose}
      />
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="sticky top-0 bg-white z-10 px-5 pt-5 pb-3 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h2 className="text-[17px] font-bold text-gray-900">{t('setup_title')}</h2>
            <button onClick={handleClose} className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center">
              <X className="h-4 w-4 text-gray-500" />
            </button>
          </div>
          <p className="text-[12px] text-gray-400 mt-0.5">{t('setup_subtitle')}</p>
        </div>

        <div className="px-5 py-4 pb-10">
          <AnimatePresence mode="wait">
            {/* ── Step: Mode selection ── */}
            {step === 'mode' && (
              <motion.div key="mode" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
                <button onClick={handleAutoBalance} className="w-full rounded-2xl border border-gray-100 p-4 text-left hover:border-teal-200 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-teal-50 flex items-center justify-center"><BarChart3 className="h-5 w-5 text-teal-600" /></div>
                    <div>
                      <p className="text-[14px] font-semibold text-gray-900">{t('auto_balance')}</p>
                      <p className="text-[12px] text-gray-400">{t('auto_balance_desc')}</p>
                    </div>
                  </div>
                </button>
                <button onClick={handleRandom} className="w-full rounded-2xl border border-gray-100 p-4 text-left hover:border-teal-200 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-purple-50 flex items-center justify-center"><Shuffle className="h-5 w-5 text-purple-600" /></div>
                    <div>
                      <p className="text-[14px] font-semibold text-gray-900">{t('random')}</p>
                      <p className="text-[12px] text-gray-400">{t('random_desc')}</p>
                    </div>
                  </div>
                </button>
                <button onClick={handleManual} className="w-full rounded-2xl border border-gray-100 p-4 text-left hover:border-teal-200 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-amber-50 flex items-center justify-center"><Hand className="h-5 w-5 text-amber-600" /></div>
                    <div>
                      <p className="text-[14px] font-semibold text-gray-900">{t('manual')}</p>
                      <p className="text-[12px] text-gray-400">{t('manual_desc')}</p>
                    </div>
                  </div>
                </button>
              </motion.div>
            )}

            {/* ── Step: Manual pairing ── */}
            {step === 'manual' && (
              <motion.div key="manual" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {/* Already paired */}
                {pairs.length > 0 && (
                  <div className="mb-4 space-y-2">
                    {pairs.map((p, i) => (
                      <div key={i} className="rounded-xl bg-green-50 border border-green-200 px-3 py-2 flex items-center gap-2">
                        <PairAvatar
                          player1={{ name: p.player1.name, avatarUrl: p.player1.avatar_url }}
                          player2={{ name: p.player2.name, avatarUrl: p.player2.avatar_url }}
                        />
                        <span className="text-[12px] font-semibold text-gray-800 flex-1">{p.teamName}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Unpaired roster */}
                {selected && (
                  <p className="text-[11px] font-semibold text-teal-600 mb-2">{t('tap_to_pair')}</p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  {unpaired.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => handleTapPlayer(m)}
                      className={cn(
                        'rounded-xl border p-3 flex items-center gap-2 transition-colors text-left',
                        selected?.id === m.id
                          ? 'border-teal-400 bg-teal-50'
                          : 'border-gray-100 hover:border-gray-200'
                      )}
                    >
                      <PlayerAvatar name={m.name} avatarUrl={m.avatar_url} size="sm" />
                      <div className="min-w-0">
                        <p className="text-[12px] font-semibold text-gray-800 truncate">{m.name}</p>
                        <p className="text-[10px] text-gray-400">{m.internal_ranking} ELO</p>
                      </div>
                    </button>
                  ))}
                </div>

                <div className="flex gap-2 mt-4">
                  <button onClick={() => { reset(); setStep('mode') }} className="flex-1 rounded-xl border border-gray-200 py-2.5 text-[13px] font-semibold text-gray-600">
                    {t('reset')}
                  </button>
                  {canProceedToReview() && (
                    <button onClick={() => setStep('review')} className="flex-1 rounded-xl bg-[#009688] py-2.5 text-[13px] font-bold text-white">
                      Review
                    </button>
                  )}
                </div>
              </motion.div>
            )}

            {/* ── Step: Review ── */}
            {step === 'review' && (
              <motion.div key="review" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <p className="text-[13px] text-gray-500 mb-3">{t('review_subtitle')}</p>
                <div className="space-y-3">
                  {pairs.map((p, i) => (
                    <div key={i} className="rounded-xl border border-gray-100 p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <PairAvatar
                          player1={{ name: p.player1.name, avatarUrl: p.player1.avatar_url }}
                          player2={{ name: p.player2.name, avatarUrl: p.player2.avatar_url }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] text-gray-400">{t('pair_number', { n: i + 1 })}</p>
                          <p className="text-[13px] font-semibold text-gray-800">
                            {p.player1.name} & {p.player2.name}
                          </p>
                        </div>
                      </div>
                      {editingIdx === i ? (
                        <input
                          autoFocus
                          value={p.teamName}
                          onChange={(e) => {
                            const val = e.target.value
                            setPairs((prev) => prev.map((pp, ii) => ii === i ? { ...pp, teamName: val } : pp))
                          }}
                          onBlur={() => setEditingIdx(null)}
                          onKeyDown={(e) => { if (e.key === 'Enter') setEditingIdx(null) }}
                          className="w-full rounded-lg border border-teal-300 px-3 py-1.5 text-[13px] text-gray-800 focus:outline-none"
                        />
                      ) : (
                        <button
                          onClick={() => setEditingIdx(i)}
                          className="w-full text-left rounded-lg bg-gray-50 px-3 py-1.5 text-[13px] text-gray-600 hover:bg-gray-100 transition-colors"
                        >
                          {p.teamName}
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 mt-4">
                  <button onClick={reset} className="flex-1 rounded-xl border border-gray-200 py-2.5 text-[13px] font-semibold text-gray-600">
                    {t('reset')}
                  </button>
                  <button
                    onClick={handleConfirm}
                    disabled={saving}
                    className="flex-1 rounded-xl bg-[#009688] py-2.5 text-[13px] font-bold text-white disabled:opacity-50"
                  >
                    {saving ? t('generating_pairs') : t('confirm_pairs')}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </>
  )
}
