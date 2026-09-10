import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Shuffle, BarChart3, Hand, AlertTriangle } from 'lucide-react'
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

function makePair(p1: Member, p2: Member): Pair {
  const [first, second] = p1.id < p2.id ? [p1, p2] : [p2, p1]
  return {
    player1: first,
    player2: second,
    teamName: `${p1.name.split(' ')[0]} & ${p2.name.split(' ')[0]}`,
  }
}

function autoBalancePairs(members: Member[]): { pairs: Pair[]; leftover: Member | null } {
  const sorted = [...members].sort((a, b) => b.internal_ranking - a.internal_ranking)
  const pairs: Pair[] = []
  const pairableCount = sorted.length % 2 === 0 ? sorted.length : sorted.length - 1
  let lo = 0
  let hi = pairableCount - 1
  while (lo < hi) {
    pairs.push(makePair(sorted[lo], sorted[hi]))
    lo++
    hi--
  }
  const leftover = sorted.length % 2 !== 0 ? sorted[sorted.length - 1] : null
  return { pairs, leftover }
}

function randomPairs(members: Member[]): { pairs: Pair[]; leftover: Member | null } {
  const shuffled = [...members]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  const pairs: Pair[] = []
  const pairableCount = shuffled.length % 2 === 0 ? shuffled.length : shuffled.length - 1
  for (let i = 0; i < pairableCount; i += 2) {
    pairs.push(makePair(shuffled[i], shuffled[i + 1]))
  }
  const leftover = shuffled.length % 2 !== 0 ? shuffled[shuffled.length - 1] : null
  return { pairs, leftover }
}

// ── Component ─────────────────────────────────────────────────────────────────

type Step = 'mode' | 'manual' | 'review'

export function PairAssignmentSheet({ open, onClose, leagueId, members, onSaved }: PairAssignmentSheetProps) {
  const { t } = useTranslation('', { keyPrefix: 'pairs' })
  const [step, setStep] = useState<Step>('mode')
  const [pairs, setPairs] = useState<Pair[]>([])
  const [selected, setSelected] = useState<Member | null>(null)
  const [unpaired, setUnpaired] = useState<Member[]>([])
  const [leftoverMember, setLeftoverMember] = useState<Member | null>(null)
  const [saving, setSaving] = useState(false)
  const [editingIdx, setEditingIdx] = useState<number | null>(null)

  const isOdd = members.length % 2 !== 0

  function reset() {
    setStep('mode')
    setPairs([])
    setSelected(null)
    setUnpaired([])
    setLeftoverMember(null)
    setEditingIdx(null)
  }

  function handleClose() {
    reset()
    onClose()
  }

  // ── Mode selection handlers ─────────────────────────────────────────────

  function handleAutoBalance() {
    const { pairs: p, leftover } = autoBalancePairs(members)
    setPairs(p)
    setLeftoverMember(leftover)
    setStep('review')
  }

  function handleRandom() {
    const { pairs: p, leftover } = randomPairs(members)
    setPairs(p)
    setLeftoverMember(leftover)
    setStep('review')
  }

  function handleManual() {
    setUnpaired([...members])
    setPairs([])
    setSelected(null)
    setLeftoverMember(null)
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
    setPairs((prev) => [...prev, makePair(p1, p2)])
    setUnpaired((prev) => prev.filter((m) => m.id !== p1.id && m.id !== p2.id))
    setSelected(null)
  }

  function canProceedToReview() {
    // Can proceed if we have at least 1 pair and at most 1 unpaired
    return pairs.length > 0 && unpaired.length <= 1
  }

  function handleManualToReview() {
    setLeftoverMember(unpaired.length === 1 ? unpaired[0] : null)
    setStep('review')
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

    // Auto-set max_rounds for round-robin based on team count
    const teamCount = pairs.length + (leftoverMember ? 1 : 0)
    const maxRounds = teamCount % 2 === 0 ? teamCount - 1 : teamCount
    await supabase.from('leagues').update({ max_rounds: maxRounds }).eq('id', leagueId)

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
        className="fixed inset-0 z-50 bg-scrim"
        onClick={handleClose}
      />
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="fixed inset-x-0 bottom-0 z-50 bg-card rounded-t-2xl max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="sticky top-0 bg-card z-10 px-5 pt-5 pb-3 border-b border-hairline">
          <div className="flex items-center justify-between">
            <h2 className="text-[17px] font-bold text-ink">{t('setup_title')}</h2>
            <button onClick={handleClose} className="h-8 w-8 rounded-full bg-hairline flex items-center justify-center">
              <X className="h-4 w-4 text-ink-2" />
            </button>
          </div>
          <p className="text-[12px] text-ink-2 mt-0.5">{t('setup_subtitle')}</p>
        </div>

        <div className="px-5 py-4 pb-28">
          {/* Odd member info banner */}
          {isOdd && step === 'mode' && (
            <div className="rounded-xl bg-warn-50 border border-warn px-3 py-2 mb-4 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-warn flex-shrink-0 mt-0.5" />
              <p className="text-[12px] text-warn">
                {members.length} members — odd number. One player will be left unpaired and won&apos;t play until they get a partner.
              </p>
            </div>
          )}

          <AnimatePresence mode="wait">
            {/* ── Step: Mode selection ── */}
            {step === 'mode' && (
              <motion.div key="mode" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
                <button onClick={handleAutoBalance} className="w-full rounded-2xl border border-hairline p-4 text-left hover:border-court-100 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-court-50 flex items-center justify-center"><BarChart3 className="h-5 w-5 text-court" /></div>
                    <div>
                      <p className="text-[14px] font-semibold text-ink">{t('auto_balance')}</p>
                      <p className="text-[12px] text-ink-2">{t('auto_balance_desc')}</p>
                    </div>
                  </div>
                </button>
                <button onClick={handleRandom} className="w-full rounded-2xl border border-hairline p-4 text-left hover:border-court-100 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-court-50 flex items-center justify-center"><Shuffle className="h-5 w-5 text-court" /></div>
                    <div>
                      <p className="text-[14px] font-semibold text-ink">{t('random')}</p>
                      <p className="text-[12px] text-ink-2">{t('random_desc')}</p>
                    </div>
                  </div>
                </button>
                <button onClick={handleManual} className="w-full rounded-2xl border border-hairline p-4 text-left hover:border-court-100 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-warn-50 flex items-center justify-center"><Hand className="h-5 w-5 text-warn" /></div>
                    <div>
                      <p className="text-[14px] font-semibold text-ink">{t('manual')}</p>
                      <p className="text-[12px] text-ink-2">{t('manual_desc')}</p>
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
                      <div key={i} className="rounded-xl bg-court-50 border border-court-100 px-3 py-2 flex items-center gap-2">
                        <PairAvatar
                          player1={{ name: p.player1.name, avatarUrl: p.player1.avatar_url }}
                          player2={{ name: p.player2.name, avatarUrl: p.player2.avatar_url }}
                        />
                        <span className="text-[12px] font-semibold text-ink flex-1">{p.teamName}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Unpaired roster */}
                {selected && (
                  <p className="text-[11px] font-semibold text-court mb-2">{t('tap_to_pair')}</p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  {unpaired.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => handleTapPlayer(m)}
                      className={cn(
                        'rounded-xl border p-3 flex items-center gap-2 transition-colors text-left',
                        selected?.id === m.id
                          ? 'border-court bg-court-50'
                          : 'border-hairline hover:border-hairline'
                      )}
                    >
                      <PlayerAvatar name={m.name} avatarUrl={m.avatar_url} size="sm" />
                      <div className="min-w-0">
                        <p className="text-[12px] font-semibold text-ink truncate">{m.name}</p>
                        <p className="text-[11px] text-ink-2">{m.internal_ranking} ELO</p>
                      </div>
                    </button>
                  ))}
                </div>

                <div className="flex gap-2 mt-4">
                  <button onClick={() => { reset(); setStep('mode') }} className="flex-1 rounded-xl border border-hairline py-2.5 text-[13px] font-semibold text-ink-2">
                    {t('reset')}
                  </button>
                  {canProceedToReview() && (
                    <button onClick={handleManualToReview} className="flex-1 rounded-xl bg-court py-2.5 text-[13px] font-bold text-white">
                      Review
                    </button>
                  )}
                </div>
              </motion.div>
            )}

            {/* ── Step: Review ── */}
            {step === 'review' && (
              <motion.div key="review" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <p className="text-[13px] text-ink-2 mb-3">{t('review_subtitle')}</p>

                {/* Leftover member banner */}
                {leftoverMember && (
                  <div className="rounded-xl bg-warn-50 border border-warn px-3 py-2 mb-3 flex items-center gap-2">
                    <PlayerAvatar name={leftoverMember.name} avatarUrl={leftoverMember.avatar_url} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-semibold text-warn truncate">{leftoverMember.name}</p>
                      <p className="text-[11px] text-warn">{t('unpaired')} — awaiting partner</p>
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  {pairs.map((p, i) => (
                    <div key={i} className="rounded-xl border border-hairline p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <PairAvatar
                          player1={{ name: p.player1.name, avatarUrl: p.player1.avatar_url }}
                          player2={{ name: p.player2.name, avatarUrl: p.player2.avatar_url }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] text-ink-2">{t('pair_number', { n: i + 1 })}</p>
                          <p className="text-[13px] font-semibold text-ink">
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
                          className="w-full rounded-lg border border-court-100 px-3 py-1.5 text-[13px] text-ink focus:outline-none"
                        />
                      ) : (
                        <button
                          onClick={() => setEditingIdx(i)}
                          className="w-full text-left rounded-lg bg-surface px-3 py-1.5 text-[13px] text-ink-2 hover:bg-hairline transition-colors"
                        >
                          {p.teamName}
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 mt-4">
                  <button onClick={reset} className="flex-1 rounded-xl border border-hairline py-2.5 text-[13px] font-semibold text-ink-2">
                    {t('reset')}
                  </button>
                  <button
                    onClick={handleConfirm}
                    disabled={saving}
                    className="flex-1 rounded-xl bg-court py-2.5 text-[13px] font-bold text-white disabled:opacity-50"
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
