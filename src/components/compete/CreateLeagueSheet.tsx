import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ChevronLeft, ChevronRight, Users, User, Trophy, Check, Info } from 'lucide-react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

type LeagueType    = 'pairs' | 'individual' | 'tournament'
type Format        = 'round_robin' | 'mexicano' | 'knockout' | 'americano' | 'king_of_hill' | 'compass_draw' | 'box_league' | 'flex_league'
type ScoringFormat = 'standard' | 'short_sets' | 'one_set' | 'custom'
type Visibility    = 'group_only' | 'open' | 'invite_only'

interface MyGroup { id: string; name: string }

type JoinMode = 'auto_add' | 'invite' | 'open'

interface FormState {
  leagueType:      LeagueType | null
  name:            string
  description:     string
  groupId:         string | null
  format:          Format | null
  scoringFormat:   ScoringFormat
  startDate:       string
  endDate:         string
  maxParticipants: string
  visibility:      Visibility
  minElo:          string
  maxElo:          string
  joinMode:        JoinMode
}

function emptyForm(defaultGroupId?: string): FormState {
  return {
    leagueType:      null,
    name:            '',
    description:     '',
    groupId:         defaultGroupId ?? null,
    format:          null,
    scoringFormat:   'standard',
    startDate:       '',
    endDate:         '',
    maxParticipants: '',
    visibility:      'group_only',
    minElo:          '',
    maxElo:          '',
    joinMode:        'auto_add',
  }
}

// ── Format info modal ─────────────────────────────────────────────────────────

function FormatInfoModal({ format, onClose }: { format: Format; onClose: () => void }) {
  const { t } = useTranslation()
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[70] bg-black/40"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="fixed inset-x-5 top-1/2 -translate-y-1/2 z-[75] bg-white rounded-2xl p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between mb-4">
          <h3 className="text-[17px] font-bold text-gray-900 flex-1 pr-2">{t(`create_league.format_${format}_title`)}</h3>
          <button onClick={onClose} className="h-7 w-7 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
            <X className="h-3.5 w-3.5 text-gray-500" />
          </button>
        </div>
        <p className="text-[13px] text-gray-600 mb-4">{t(`create_league.format_${format}_desc`)}</p>
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <span className="text-[11px] font-bold text-teal-700 uppercase tracking-wide w-20 flex-shrink-0 pt-0.5">{t('create_league.best_for_label')}</span>
            <span className="text-[13px] text-gray-700">{t(`create_league.format_${format}_bestfor`)}</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-[11px] font-bold text-teal-700 uppercase tracking-wide w-20 flex-shrink-0 pt-0.5">{t('create_league.winner_label')}</span>
            <span className="text-[13px] text-gray-700">{t(`create_league.format_${format}_winner`)}</span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="mt-5 w-full rounded-xl bg-[#009688] py-3 text-[14px] font-bold text-white"
        >
          {t('create_league.got_it')}
        </button>
      </motion.div>
    </>
  )
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

const LEAGUE_TYPE_KEYS: Array<{ type: LeagueType; Icon: typeof Trophy }> = [
  { type: 'pairs', Icon: Users },
  { type: 'individual', Icon: User },
  { type: 'tournament', Icon: Trophy },
]

function Step1({ form, setForm }: { form: FormState; setForm: (f: FormState) => void }) {
  const { t } = useTranslation()
  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-1">{t('create_league.step1_title')}</h2>
      <p className="text-sm text-gray-500 mb-6">{t('create_league.step1_subtitle')}</p>
      <div className="space-y-3">
        {LEAGUE_TYPE_KEYS.map(({ type, Icon }) => {
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
                <p className="font-semibold text-gray-900">{t(`create_league.type_${type}_label`)}</p>
                <p className="text-[13px] text-gray-500 mt-0.5">{t(`create_league.type_${type}_desc`)}</p>
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

const FORMATS: Format[] = ['round_robin', 'mexicano', 'knockout', 'americano', 'king_of_hill', 'compass_draw', 'box_league', 'flex_league']

const SCORING_FORMAT_KEYS: ScoringFormat[] = ['standard', 'short_sets', 'one_set', 'custom']

function Step2({
  form,
  setForm,
  userId,
}: {
  form: FormState
  setForm: (f: FormState) => void
  userId: string
}) {
  const [infoFormat, setInfoFormat] = useState<Format | null>(null)
  const { t } = useTranslation()

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
      <h2 className="text-xl font-bold text-gray-900 mb-1">{t('create_league.step2_title')}</h2>
      <p className="text-sm text-gray-500 mb-6">{t('create_league.step2_subtitle')}</p>
      <div className="space-y-4">

        {/* Name */}
        <div>
          <label className="block text-[13px] font-medium text-gray-700 mb-1.5">
            {t('create_league.name_label')} <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder={t('create_league.name_placeholder')}
            style={{ fontSize: '16px', width: '100%', boxSizing: 'border-box' }}
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-[13px] font-medium text-gray-700 mb-1.5">
            {t('create_league.description_label')}
          </label>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder={t('create_league.description_placeholder')}
            rows={2}
            style={{ fontSize: '16px' }}
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 resize-none"
          />
        </div>

        {/* Group */}
        {groups.length > 0 && (
          <div>
            <label className="block text-[13px] font-medium text-gray-700 mb-1.5">{t('create_league.group_label')}</label>
            <select
              value={form.groupId ?? ''}
              onChange={(e) => setForm({ ...form, groupId: e.target.value || null })}
              style={{ fontSize: '16px', width: '100%', boxSizing: 'border-box' }}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 bg-white"
            >
              <option value="">{t('create_league.group_none')}</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Tournament format */}
        <div>
          <label className="block text-[13px] font-medium text-gray-700 mb-2">{t('create_league.tournament_format_label')} <span className="text-red-400">*</span></label>
          <div className="grid grid-cols-2 gap-2">
            {FORMATS.map((id) => (
              <div key={id} className="relative">
                <button
                  onClick={() => setForm({ ...form, format: id })}
                  className={cn(
                    'w-full rounded-xl border py-2.5 pl-3 pr-8 text-left text-[12px] font-medium transition-all',
                    form.format === id
                      ? 'border-teal-500 bg-teal-50 text-teal-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  )}
                >
                  {form.format === id && <Check className="inline h-3 w-3 mr-1 flex-shrink-0" />}
                  {t(`create_league.format_${id}_title`)}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setInfoFormat(id) }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  aria-label={t(`create_league.format_${id}_title`)}
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Scoring format */}
        <div>
          <label className="block text-[13px] font-medium text-gray-700 mb-2">{t('create_league.match_scoring_label')}</label>
          <div className="space-y-1.5">
            {SCORING_FORMAT_KEYS.map((id) => (
              <button
                key={id}
                onClick={() => setForm({ ...form, scoringFormat: id })}
                className={cn(
                  'w-full flex items-center gap-3 rounded-xl border-2 p-2.5 text-left transition-all',
                  form.scoringFormat === id ? 'border-[#009688] bg-teal-50/40' : 'border-gray-100 bg-white'
                )}
              >
                <div className={cn(
                  'h-4 w-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center',
                  form.scoringFormat === id ? 'border-[#009688]' : 'border-gray-300'
                )}>
                  {form.scoringFormat === id && <div className="h-2 w-2 rounded-full bg-[#009688]" />}
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-gray-900">{t(`create_league.scoring_${id}_label`)}</p>
                  <p className="text-[11px] text-gray-400">{t(`create_league.scoring_${id}_desc`)}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Start / End dates */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[13px] font-medium text-gray-700 mb-1.5">{t('create_league.start_date_label')}</label>
            <input
              type="date"
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              style={{ fontSize: '16px', width: '100%', boxSizing: 'border-box' }}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
            />
          </div>
          <div>
            <label className="block text-[13px] font-medium text-gray-700 mb-1.5">{t('create_league.end_date_label')}</label>
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
            {t('create_league.max_players_label')}
          </label>
          <input
            type="number"
            value={form.maxParticipants}
            onChange={(e) => setForm({ ...form, maxParticipants: e.target.value })}
            placeholder={t('create_league.max_players_placeholder')}
            min="2"
            max="128"
            style={{ fontSize: '16px', width: '100%', boxSizing: 'border-box' }}
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
          />
        </div>
      </div>

      {/* Format info modal */}
      <AnimatePresence>
        {infoFormat && (
          <FormatInfoModal format={infoFormat} onClose={() => setInfoFormat(null)} />
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Step 3 — Settings + Confirm ───────────────────────────────────────────────

const VISIBILITY_KEYS: Visibility[] = ['group_only', 'open', 'invite_only']
const JOIN_MODE_KEYS: JoinMode[] = ['auto_add', 'invite', 'open']

function Step3({ form, setForm }: { form: FormState; setForm: (f: FormState) => void }) {
  const { t } = useTranslation()
  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-1">{t('create_league.step3_title')}</h2>
      <p className="text-sm text-gray-500 mb-6">{t('create_league.step3_subtitle')}</p>
      <div className="space-y-4">

        {/* Visibility */}
        <div>
          <label className="block text-[13px] font-medium text-gray-700 mb-2">{t('create_league.visibility_label')}</label>
          <div className="space-y-2">
            {VISIBILITY_KEYS.map((id) => (
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
                  <p className="text-[13px] font-semibold text-gray-900">{t(`create_league.visibility_${id}_label`)}</p>
                  <p className="text-[11px] text-gray-400">{t(`create_league.visibility_${id}_desc`)}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* How members join */}
        <div>
          <label className="block text-[13px] font-medium text-gray-700 mb-2">{t('create_league.join_mode_label')}</label>
          <div className="space-y-2">
            {JOIN_MODE_KEYS.map((id) => (
              <button
                key={id}
                onClick={() => setForm({ ...form, joinMode: id })}
                className={cn(
                  'w-full flex items-center gap-3 rounded-xl border-2 p-3 text-left transition-all',
                  form.joinMode === id ? 'border-[#009688] bg-teal-50/50' : 'border-gray-100 bg-white'
                )}
              >
                <div className={cn(
                  'h-4 w-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center',
                  form.joinMode === id ? 'border-[#009688]' : 'border-gray-300'
                )}>
                  {form.joinMode === id && <div className="h-2 w-2 rounded-full bg-[#009688]" />}
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-gray-900">{t(`create_league.join_mode_${id}_label`)}</p>
                  <p className="text-[11px] text-gray-400">{t(`create_league.join_mode_${id}_desc`)}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ELO range */}
        <div>
          <label className="block text-[13px] font-medium text-gray-700 mb-1.5">
            {t('create_league.elo_range_label')}
          </label>
          <div className="grid grid-cols-2 gap-3">
            <input
              type="number"
              value={form.minElo}
              onChange={(e) => setForm({ ...form, minElo: e.target.value })}
              placeholder={t('create_league.min_elo_placeholder')}
              style={{ fontSize: '16px', width: '100%', boxSizing: 'border-box' }}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
            />
            <input
              type="number"
              value={form.maxElo}
              onChange={(e) => setForm({ ...form, maxElo: e.target.value })}
              placeholder={t('create_league.max_elo_placeholder')}
              style={{ fontSize: '16px', width: '100%', boxSizing: 'border-box' }}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
            />
          </div>
        </div>

        {/* Review */}
        <div className="rounded-2xl border border-gray-100 bg-gray-50 divide-y divide-gray-100 overflow-hidden">
          {[
            { label: t('create_league.review_type'),    value: form.leagueType ?? '—' },
            { label: t('create_league.review_name'),    value: form.name || '—' },
            { label: t('create_league.review_format'),  value: form.format?.replace(/_/g, ' ') ?? '—' },
            { label: t('create_league.review_scoring'), value: form.scoringFormat.replace(/_/g, ' ') },
            { label: t('create_league.review_starts'),  value: form.startDate || '—' },
            { label: t('create_league.review_ends'),    value: form.endDate || '—' },
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
  const { t } = useTranslation()
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
      console.log('[CreateLeague] mutate fired, user:', user?.id)
      if (!user) throw new Error('Not authenticated')

      // Only include fields with values to avoid CHECK constraint issues
      const payload: Record<string, unknown> = {
        name:             form.name.trim(),
        created_by:       user.id,
        status:           'active',
        linked_group_ids: form.groupId ? [form.groupId] : [],
      }
      // Optional fields — only include if set
      if (form.description.trim()) payload.description = form.description.trim()
      if (form.leagueType) payload.match_type = form.leagueType === 'tournament' ? 'competitive' : form.leagueType
      if (form.format) payload.format = form.format
      if (form.scoringFormat !== 'standard') payload.scoring_format = form.scoringFormat
      const vis = form.visibility === 'group_only' ? 'group' : form.visibility
      if (vis) payload.visibility = vis
      if (form.startDate) payload.season_start = form.startDate
      if (form.endDate) payload.season_end = form.endDate
      if (form.maxParticipants) payload.max_participants = parseInt(form.maxParticipants, 10)
      if (form.minElo) payload.min_elo = parseInt(form.minElo, 10)
      if (form.maxElo) payload.max_elo = parseInt(form.maxElo, 10)

      console.log('[CreateLeague] payload:', JSON.stringify(payload))

      const { data: league, error: insertError } = await supabase
        .from('leagues')
        .insert(payload)
        .select('id')
        .single()

      console.log('[CreateLeague] result:', league, 'error:', insertError)
      if (insertError) throw insertError
      console.log('[CreateLeague] league created:', league.id)

      // Add creator as admin member
      console.log('[CreateLeague] inserting creator as member')
      const { error: memberError } = await supabase.from('league_members').insert({
        league_id: league.id,
        user_id:   user.id,
        role:      'admin',
        status:    'active',
      })
      console.log('[CreateLeague] member error:', memberError)

      // Seed initial standings row
      console.log('[CreateLeague] inserting standings row')
      const { error: standingsError } = await supabase.from('league_standings').insert({
        league_id:      league.id,
        user_id:        user.id,
        wins:           0,
        losses:         0,
        draws:          0,
        matches_played: 0,
        ranking_points: 0,
        category:       'overall',
      })
      console.log('[CreateLeague] standings error:', standingsError)

      // Add group members based on joinMode (non-blocking)
      if (form.groupId) {
        try {
          const { data: members } = await supabase
            .from('group_members')
            .select('user_id')
            .eq('group_id', form.groupId)
            .eq('status', 'approved')
            .neq('user_id', user.id)

          if (members && members.length > 0) {
            if (form.joinMode === 'auto_add') {
              // Auto-add all group members directly
              const { error: memErr } = await supabase.from('league_members').insert(
                members.map((m) => ({
                  league_id: league.id, user_id: m.user_id, role: 'member', status: 'active',
                }))
              )
              if (memErr) console.error('[CreateLeague] auto-add members error:', memErr)

              const { error: stErr } = await supabase.from('league_standings').insert(
                members.map((m) => ({
                  league_id: league.id, user_id: m.user_id,
                  wins: 0, losses: 0, draws: 0, matches_played: 0, ranking_points: 0, category: 'overall',
                }))
              )
              if (stErr) console.error('[CreateLeague] auto-add standings error:', stErr)

              console.log('[CreateLeague] auto-added', members.length, 'members')
            } else if (form.joinMode === 'invite') {
              // Send invitations
              const { data: creatorProfile } = await supabase
                .from('profiles').select('name').eq('id', user.id).single()
              const creatorName = creatorProfile?.name ?? 'Someone'

              const { error: invErr } = await supabase.from('league_invitations').insert(
                members.map((m) => ({
                  league_id: league.id, invited_user_id: m.user_id,
                  invited_by: user.id, status: 'pending',
                }))
              )
              if (invErr) console.error('[CreateLeague] invitation INSERT error:', invErr)

              const { error: notifErr } = await supabase.from('notifications').insert(
                members.map((m) => ({
                  user_id: m.user_id, type: 'league_invite',
                  title: t('create_league.league_invitation_title'),
                  message: `${creatorName} invited you to join ${form.name.trim()}`,
                  related_id: league.id, read: false,
                }))
              )
              if (notifErr) console.error('[CreateLeague] notification INSERT error:', notifErr)

              console.log('[CreateLeague] invited', members.length, 'members')
            }
            // 'open' mode: do nothing — members join via link
          }
        } catch (e) {
          console.warn('[CreateLeague] member add error (non-blocking):', e)
        }
      }

      console.log('[CreateLeague] navigating to:', league.id)
      return league.id
    },
    onSuccess: (leagueId: string) => {
      onClose()
      navigate(`/compete/leagues/${leagueId}`)
    },
    onError: (err: unknown) => {
      console.error('[CreateLeague] error:', err)
      const msg = err instanceof Error ? err.message : typeof err === 'object' && err !== null ? JSON.stringify(err) : 'Failed to create league'
      setError(msg)
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
              <span className="text-[13px] text-gray-400 font-medium">{t('create_league.step_of', { step, total: 3 })}</span>
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
                  {t('create_league.continue')} <ChevronRight className="h-5 w-5" />
                </button>
              ) : (
                <button
                  onClick={() => createMutation.mutate()}
                  disabled={createMutation.isPending}
                  className="w-full flex items-center justify-center gap-2 rounded-2xl py-4 text-base font-semibold text-white transition disabled:opacity-60"
                  style={{ background: '#009688' }}
                >
                  {createMutation.isPending ? t('create_league.creating') : t('create_league.create_league_btn')}
                </button>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
