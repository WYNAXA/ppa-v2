import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ChevronLeft, ChevronRight, Users, User, Trophy, Check } from 'lucide-react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

type LeagueType  = 'pairs' | 'individual' | 'tournament'
type Format      = 'round_robin' | 'mexicano' | 'knockout'
type Visibility  = 'group_only' | 'open' | 'invite_only'

interface MyGroup { id: string; name: string }

interface FormState {
  leagueType:      LeagueType | null
  name:            string
  description:     string
  groupId:         string | null
  format:          Format | null
  startDate:       string
  endDate:         string
  maxParticipants: string
  visibility:      Visibility
  minElo:          string
  maxElo:          string
}

function emptyForm(defaultGroupId?: string): FormState {
  return {
    leagueType:      null,
    name:            '',
    description:     '',
    groupId:         defaultGroupId ?? null,
    format:          null,
    startDate:       '',
    endDate:         '',
    maxParticipants: '',
    visibility:      'group_only',
    minElo:          '',
    maxElo:          '',
  }
}

// ── Step dots ─────────────────────────────────────────────────────────────────

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-1.5 mb-6">
      {Array.from({ length: total }).map((_, i) => (
        <motion.div
          key={i}
          animate={{ width: i === current - 1 ? 20 : 6, backgroundColor: i === current - 1 ? '#009688' : '#e5e7eb' }}
          transition={{ duration: 0.25 }}
          className="h-1.5 rounded-full"
        />
      ))}
    </div>
  )
}

// ── Step 1 — League type ──────────────────────────────────────────────────────

const LEAGUE_TYPES: Array<{ type: LeagueType; label: string; desc: string; Icon: typeof Trophy }> = [
  { type: 'pairs',      label: 'Pairs',      desc: 'Teams of 2 compete across the league',  Icon: Users  },
  { type: 'individual', label: 'Individual', desc: 'Solo players compete for ranking',       Icon: User   },
  { type: 'tournament', label: 'Tournament', desc: 'Bracket-style knockout competition',     Icon: Trophy },
]

function Step1({ form, setForm }: { form: FormState; setForm: (f: FormState) => void }) {
  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-1">League type</h2>
      <p className="text-sm text-gray-500 mb-6">What kind of competition is this?</p>
      <div className="space-y-3">
        {LEAGUE_TYPES.map(({ type, label, desc, Icon }) => {
          const selected = form.leagueType === type
          return (
            <button
              key={type}
              onClick={() => setForm({ ...form, leagueType: type })}
              className={cn(
                'w-full flex items-center gap-4 rounded-2xl border-2 p-4 text-left transition-all',
                selected ? 'border-[#009688] bg-teal-50/50' : 'border-gray-100 bg-white hover:border-gray-200'
              )}
            >
              <div className={cn(
                'h-11 w-11 rounded-xl flex items-center justify-center flex-shrink-0',
                selected ? 'bg-teal-100' : 'bg-gray-100'
              )}>
                <Icon className={cn('h-5 w-5', selected ? 'text-[#009688]' : 'text-gray-400')} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900">{label}</p>
                <p className="text-[13px] text-gray-500 mt-0.5">{desc}</p>
              </div>
              {selected && (
                <div className="h-5 w-5 rounded-full bg-[#009688] flex items-center justify-center flex-shrink-0">
                  <Check className="h-3 w-3 text-white" />
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Step 2 — Setup ────────────────────────────────────────────────────────────

const FORMATS: Array<{ id: Format; label: string }> = [
  { id: 'round_robin', label: 'Round Robin' },
  { id: 'mexicano',    label: 'Mexicano'    },
  { id: 'knockout',    label: 'Knockout'    },
]

function Step2({
  form,
  setForm,
  userId,
}: {
  form: FormState
  setForm: (f: FormState) => void
  userId: string
}) {
  const { data: groups = [] } = useQuery<MyGroup[]>({
    queryKey: ['my-groups-for-league', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from('group_members')
        .select('group_id, groups(id, name)')
        .eq('user_id', userId)
        .eq('status', 'approved')
      if (!data) return []
      return data
        .map((m) => (Array.isArray(m.groups) ? m.groups[0] : m.groups) as MyGroup)
        .filter(Boolean)
    },
  })

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-1">Setup</h2>
      <p className="text-sm text-gray-500 mb-6">Name your league and set the schedule</p>
      <div className="space-y-4">

        {/* Name */}
        <div>
          <label className="block text-[13px] font-medium text-gray-700 mb-1.5">
            Name <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Summer Padel League 2025"
            style={{ fontSize: '16px', width: '100%', boxSizing: 'border-box' }}
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-[13px] font-medium text-gray-700 mb-1.5">
            Description <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Rules, prizes, anything players should know…"
            rows={2}
            style={{ fontSize: '16px' }}
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 resize-none"
          />
        </div>

        {/* Group */}
        {groups.length > 0 && (
          <div>
            <label className="block text-[13px] font-medium text-gray-700 mb-1.5">Group</label>
            <select
              value={form.groupId ?? ''}
              onChange={(e) => setForm({ ...form, groupId: e.target.value || null })}
              style={{ fontSize: '16px', width: '100%', boxSizing: 'border-box' }}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 bg-white"
            >
              <option value="">No group</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Format */}
        <div>
          <label className="block text-[13px] font-medium text-gray-700 mb-1.5">Format</label>
          <div className="flex gap-2">
            {FORMATS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setForm({ ...form, format: id })}
                className={cn(
                  'flex-1 rounded-xl border py-2.5 text-[12px] font-medium transition-all',
                  form.format === id
                    ? 'border-teal-500 bg-teal-50 text-teal-700'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Start / End dates */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[13px] font-medium text-gray-700 mb-1.5">Start date</label>
            <input
              type="date"
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              style={{ fontSize: '16px', width: '100%', boxSizing: 'border-box' }}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
            />
          </div>
          <div>
            <label className="block text-[13px] font-medium text-gray-700 mb-1.5">End date</label>
            <input
              type="date"
              value={form.endDate}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              style={{ fontSize: '16px', width: '100%', boxSizing: 'border-box' }}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
            />
          </div>
        </div>

        {/* Max participants */}
        <div>
          <label className="block text-[13px] font-medium text-gray-700 mb-1.5">
            Max players/teams <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            type="number"
            value={form.maxParticipants}
            onChange={(e) => setForm({ ...form, maxParticipants: e.target.value })}
            placeholder="e.g. 16"
            min="2"
            max="128"
            style={{ fontSize: '16px', width: '100%', boxSizing: 'border-box' }}
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
          />
        </div>
      </div>
    </div>
  )
}

// ── Step 3 — Settings + Confirm ───────────────────────────────────────────────

const VISIBILITY_OPTIONS: Array<{ id: Visibility; label: string; desc: string }> = [
  { id: 'group_only',  label: 'Group only',   desc: 'Only group members can join'  },
  { id: 'open',        label: 'Open',         desc: 'Anyone can discover and join' },
  { id: 'invite_only', label: 'Invite only',  desc: 'Join by invite link only'     },
]

function Step3({ form, setForm }: { form: FormState; setForm: (f: FormState) => void }) {
  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-1">Settings</h2>
      <p className="text-sm text-gray-500 mb-6">Configure access and review</p>
      <div className="space-y-4">

        {/* Visibility */}
        <div>
          <label className="block text-[13px] font-medium text-gray-700 mb-2">Visibility</label>
          <div className="space-y-2">
            {VISIBILITY_OPTIONS.map(({ id, label, desc }) => (
              <button
                key={id}
                onClick={() => setForm({ ...form, visibility: id })}
                className={cn(
                  'w-full flex items-center gap-3 rounded-xl border-2 p-3 text-left transition-all',
                  form.visibility === id ? 'border-[#009688] bg-teal-50/50' : 'border-gray-100 bg-white'
                )}
              >
                <div className={cn(
                  'h-4 w-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center',
                  form.visibility === id ? 'border-[#009688]' : 'border-gray-300'
                )}>
                  {form.visibility === id && <div className="h-2 w-2 rounded-full bg-[#009688]" />}
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-gray-900">{label}</p>
                  <p className="text-[11px] text-gray-400">{desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ELO range */}
        <div>
          <label className="block text-[13px] font-medium text-gray-700 mb-1.5">
            ELO range <span className="text-gray-400 font-normal">(optional filter)</span>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <input
              type="number"
              value={form.minElo}
              onChange={(e) => setForm({ ...form, minElo: e.target.value })}
              placeholder="Min ELO"
              style={{ fontSize: '16px', width: '100%', boxSizing: 'border-box' }}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
            />
            <input
              type="number"
              value={form.maxElo}
              onChange={(e) => setForm({ ...form, maxElo: e.target.value })}
              placeholder="Max ELO"
              style={{ fontSize: '16px', width: '100%', boxSizing: 'border-box' }}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
            />
          </div>
        </div>

        {/* Review */}
        <div className="rounded-2xl border border-gray-100 bg-gray-50 divide-y divide-gray-100 overflow-hidden">
          {[
            { label: 'Type',    value: form.leagueType ?? '—' },
            { label: 'Name',    value: form.name || '—' },
            { label: 'Format',  value: form.format?.replace('_', ' ') ?? '—' },
            { label: 'Starts',  value: form.startDate || '—' },
            { label: 'Ends',    value: form.endDate || '—' },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between px-4 py-2.5">
              <span className="text-[12px] text-gray-500">{label}</span>
              <span className="text-[12px] font-semibold text-gray-900 capitalize">{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Main sheet ────────────────────────────────────────────────────────────────

interface CreateLeagueSheetProps {
  open: boolean
  onClose: () => void
  defaultGroupId?: string
}

export function CreateLeagueSheet({ open, onClose, defaultGroupId }: CreateLeagueSheetProps) {
  const { user } = useAuth()
  const navigate  = useNavigate()
  const [step, setStep]   = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm]   = useState<FormState>(emptyForm(defaultGroupId))

  useEffect(() => {
    if (open) {
      setStep(1)
      setError(null)
      setForm(emptyForm(defaultGroupId))
    }
  }, [open, defaultGroupId])

  const canNext = () => {
    if (step === 1) return !!form.leagueType
    if (step === 2) return !!form.name.trim() && !!form.format
    return true
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not authenticated')

      const payload: Record<string, unknown> = {
        name:             form.name.trim(),
        description:      form.description.trim() || null,
        league_type:      form.leagueType,
        format:           form.format,
        start_date:       form.startDate || null,
        end_date:         form.endDate || null,
        max_participants: form.maxParticipants ? parseInt(form.maxParticipants, 10) : null,
        visibility:       form.visibility,
        min_elo:          form.minElo ? parseInt(form.minElo, 10) : null,
        max_elo:          form.maxElo ? parseInt(form.maxElo, 10) : null,
        created_by:       user.id,
        status:           'active',
        linked_group_ids: form.groupId ? [form.groupId] : [],
      }

      const { data: league, error: insertError } = await supabase
        .from('leagues')
        .insert(payload)
        .select('id')
        .single()

      if (insertError) throw insertError

      await supabase.from('league_members').insert({
        league_id: league.id,
        user_id:   user.id,
        role:      'admin',
        status:    'active',
      })

      return league.id
    },
    onSuccess: (leagueId: string) => {
      onClose()
      navigate(`/compete/leagues/${leagueId}`)
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : 'Failed to create league')
    },
  })

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[55] bg-black/40"
          />
          <motion.div
            key="sheet"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="fixed bottom-0 left-0 right-0 z-[60] flex flex-col bg-white rounded-t-3xl shadow-2xl"
            style={{ maxHeight: '92vh' }}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-2 flex-shrink-0">
              <div className="h-1 w-10 rounded-full bg-gray-200" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 pb-2 flex-shrink-0">
              <button
                onClick={step > 1 ? () => setStep(step - 1) : onClose}
                className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center"
              >
                {step > 1
                  ? <ChevronLeft className="h-5 w-5 text-gray-600" />
                  : <X className="h-4 w-4 text-gray-600" />}
              </button>
              <span className="text-[13px] text-gray-400 font-medium">Step {step} of 3</span>
              <div className="w-9" />
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-5 pb-4">
              <StepDots current={step} total={3} />
              <AnimatePresence mode="wait">
                <motion.div
                  key={step}
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -24 }}
                  transition={{ duration: 0.2 }}
                >
                  {step === 1 && <Step1 form={form} setForm={setForm} />}
                  {step === 2 && <Step2 form={form} setForm={setForm} userId={user?.id ?? ''} />}
                  {step === 3 && <Step3 form={form} setForm={setForm} />}
                </motion.div>
              </AnimatePresence>

              {error && (
                <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
              )}
            </div>

            {/* Footer */}
            <div
              className="px-5 pt-4 flex-shrink-0 border-t border-gray-50"
              style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}
            >
              {step < 3 ? (
                <button
                  onClick={() => setStep(step + 1)}
                  disabled={!canNext()}
                  className="w-full flex items-center justify-center gap-2 rounded-2xl py-4 text-base font-semibold text-white transition disabled:opacity-40"
                  style={{ background: '#009688' }}
                >
                  Continue <ChevronRight className="h-5 w-5" />
                </button>
              ) : (
                <button
                  onClick={() => createMutation.mutate()}
                  disabled={createMutation.isPending}
                  className="w-full flex items-center justify-center gap-2 rounded-2xl py-4 text-base font-semibold text-white transition disabled:opacity-60"
                  style={{ background: '#009688' }}
                >
                  {createMutation.isPending ? 'Creating…' : 'Create League'}
                </button>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
