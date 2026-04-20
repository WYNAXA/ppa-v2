import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Bell, ChevronRight, Plus, Search, BookOpen, ArrowRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { MatchCard, type MatchCardData } from '@/components/shared/MatchCard'
import { CreateMatchSheet } from '@/components/play/CreateMatchSheet'

// ── Custom padel racket SVG ───────────────────────────────────────────────────
function PadelCourtIllustration() {
  return (
    <svg viewBox="0 0 120 80" className="w-24 h-16 mx-auto mb-4 opacity-30" fill="none">
      <rect x="8" y="8" width="104" height="64" rx="4" stroke="#009688" strokeWidth="2.5"/>
      <line x1="60" y1="8" x2="60" y2="72" stroke="#009688" strokeWidth="1.5"/>
      <line x1="8" y1="40" x2="60" y2="40" stroke="#009688" strokeWidth="1.5"/>
      <line x1="60" y1="40" x2="112" y2="40" stroke="#009688" strokeWidth="1.5"/>
      <rect x="20" y="24" width="24" height="32" rx="2" stroke="#009688" strokeWidth="1" opacity="0.5"/>
      <rect x="76" y="24" width="24" height="32" rx="2" stroke="#009688" strokeWidth="1" opacity="0.5"/>
    </svg>
  )
}

// ── Container animation ───────────────────────────────────────────────────────
const container = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } }
const item = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] } },
}

// ── Component ─────────────────────────────────────────────────────────────────
export function PlayPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [createOpen, setCreateOpen] = useState(false)
  const today = new Date().toISOString().split('T')[0]

  // ── Upcoming matches query ─────────────────────────────────────────────────
  const { data: upcoming = [], isLoading: loadingUpcoming } = useQuery<MatchCardData[]>({
    queryKey: ['play-upcoming', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('matches')
        .select('id, match_date, match_time, booked_venue_name, player_ids, match_type, status')
        .contains('player_ids', [user!.id])
        .neq('status', 'cancelled')
        .gte('match_date', today)
        .order('match_date', { ascending: true })
        .order('match_time', { ascending: true })
        .limit(5)
      if (error) throw error

      // Fetch player profiles for the first 5 unique IDs across all matches
      const allIds = [...new Set((data ?? []).flatMap((m) => m.player_ids as string[]))].slice(0, 20)
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name, avatar_url')
        .in('id', allIds)

      return (data ?? []).map((m) => ({
        ...m,
        players: (profiles ?? []).filter((p) => (m.player_ids as string[]).includes(p.id)),
      }))
    },
  })

  // ── Open matches query ─────────────────────────────────────────────────────
  const { data: openMatches = [] } = useQuery<MatchCardData[]>({
    queryKey: ['play-open'],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('matches')
        .select('id, match_date, match_time, booked_venue_name, player_ids, match_type, status')
        .eq('status', 'open')
        .gte('match_date', today)
        .order('match_date', { ascending: true })
        .limit(5)
      if (error) throw error

      // Filter out matches the user is already in
      const filtered = (data ?? []).filter(
        (m) => !(m.player_ids as string[]).includes(user!.id)
      ).slice(0, 3)

      const allIds = [...new Set(filtered.flatMap((m) => m.player_ids as string[]))].slice(0, 16)
      const { data: profiles } = allIds.length > 0
        ? await supabase.from('profiles').select('id, name, avatar_url').in('id', allIds)
        : { data: [] }

      return filtered.map((m) => ({
        ...m,
        players: (profiles ?? []).filter((p) => (m.player_ids as string[]).includes(p.id)),
      }))
    },
  })

  return (
    <>
      <div className="min-h-full bg-white">
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 pt-14 pb-4 sticky top-0 bg-white/95 backdrop-blur-sm z-10 border-b border-gray-50">
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Play</h1>
          <button
            onClick={() => navigate('/notifications')}
            className="relative h-10 w-10 rounded-full bg-gray-50 flex items-center justify-center hover:bg-gray-100 transition-colors"
          >
            <Bell className="h-5 w-5 text-gray-600" />
          </button>
        </div>

        <motion.div
          className="px-5 py-5 space-y-7 max-w-lg mx-auto"
          variants={container}
          initial="hidden"
          animate="show"
        >
          {/* ── Find My Game CTA ─────────────────────────────────────────── */}
          <motion.div variants={item}>
            <button
              onClick={() => navigate('/play/availability')}
              className="w-full rounded-2xl overflow-hidden relative"
              style={{ background: 'linear-gradient(135deg, #007d74 0%, #009688 55%, #00a896 100%)' }}
            >
              {/* Court SVG overlay */}
              <div className="absolute inset-0 opacity-[0.08] pointer-events-none">
                <svg viewBox="0 0 390 120" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
                  <rect x="12" y="10" width="366" height="100" fill="none" stroke="white" strokeWidth="2"/>
                  <line x1="195" y1="10" x2="195" y2="110" stroke="white" strokeWidth="1.5"/>
                  <line x1="12" y1="60" x2="195" y2="60" stroke="white" strokeWidth="1.5"/>
                  <line x1="195" y1="60" x2="378" y2="60" stroke="white" strokeWidth="1.5"/>
                </svg>
              </div>

              <div className="relative flex items-center justify-between px-5 py-5">
                <div className="text-left">
                  <p className="text-[11px] font-semibold text-white/60 uppercase tracking-widest mb-1">Auto-match</p>
                  <p className="text-xl font-black text-white leading-tight">Find My Game</p>
                  <p className="text-[13px] text-white/70 mt-1 leading-snug">
                    Check availability and auto-match<br/>with your group
                  </p>
                </div>
                <div className="h-12 w-12 rounded-full bg-white/15 flex items-center justify-center flex-shrink-0">
                  <ArrowRight className="h-6 w-6 text-white" />
                </div>
              </div>
            </button>
          </motion.div>

          {/* ── Quick actions ────────────────────────────────────────────── */}
          <motion.div variants={item}>
            <div className="grid grid-cols-3 gap-3">
              {/* Create Match */}
              <button
                onClick={() => setCreateOpen(true)}
                className="flex flex-col items-center gap-2 rounded-2xl border-2 border-[#009688] bg-white py-4 px-2 transition-all hover:bg-teal-50/50 active:scale-[0.97]"
              >
                <div className="h-10 w-10 rounded-xl bg-teal-50 flex items-center justify-center">
                  <Plus className="h-5 w-5 text-[#009688]" />
                </div>
                <span className="text-[12px] font-semibold text-gray-700 text-center leading-tight">Create Match</span>
              </button>

              {/* Join Match */}
              <button
                onClick={() => navigate('/play/join')}
                className="flex flex-col items-center gap-2 rounded-2xl border-2 border-[#009688] bg-white py-4 px-2 transition-all hover:bg-teal-50/50 active:scale-[0.97]"
              >
                <div className="h-10 w-10 rounded-xl bg-teal-50 flex items-center justify-center">
                  <Search className="h-5 w-5 text-[#009688]" />
                </div>
                <span className="text-[12px] font-semibold text-gray-700 text-center leading-tight">Join Match</span>
              </button>

              {/* Book Court */}
              <button
                onClick={() => navigate('/play/book-court')}
                className="flex flex-col items-center gap-2 rounded-2xl border-2 border-[#009688] bg-white py-4 px-2 transition-all hover:bg-teal-50/50 active:scale-[0.97]"
              >
                <div className="h-10 w-10 rounded-xl bg-teal-50 flex items-center justify-center">
                  <BookOpen className="h-5 w-5 text-[#009688]" />
                </div>
                <span className="text-[12px] font-semibold text-gray-700 text-center leading-tight">Book Court</span>
              </button>
            </div>
          </motion.div>

          {/* ── Upcoming matches ─────────────────────────────────────────── */}
          <motion.section variants={item}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[13px] font-semibold text-gray-400 uppercase tracking-wide">
                Your upcoming matches
              </h2>
              {upcoming.length > 0 && (
                <button
                  onClick={() => navigate('/matches')}
                  className="flex items-center gap-0.5 text-[13px] font-medium text-teal-600"
                >
                  All <ChevronRight className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {loadingUpcoming ? (
              <div className="space-y-3">
                {[0, 1].map((i) => (
                  <div key={i} className="h-24 rounded-2xl bg-gray-100 animate-pulse" />
                ))}
              </div>
            ) : upcoming.length === 0 ? (
              /* Empty state */
              <div className="rounded-2xl bg-gray-50 border border-gray-100 px-5 py-10 text-center">
                <PadelCourtIllustration />
                <p className="text-[15px] font-bold text-gray-700">No matches yet</p>
                <p className="text-[13px] text-gray-400 mt-1.5 mb-5 leading-snug">
                  Create a match or check availability<br/>with your group
                </p>
                <button
                  onClick={() => setCreateOpen(true)}
                  className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                  style={{ background: '#009688' }}
                >
                  <Plus className="h-4 w-4" />
                  Create Match
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {upcoming.map((match, i) => (
                  <MatchCard
                    key={match.id}
                    match={match}
                    currentUserId={user?.id}
                    action="view"
                    index={i}
                  />
                ))}
              </div>
            )}
          </motion.section>

          {/* ── Open matches ─────────────────────────────────────────────── */}
          {openMatches.length > 0 && (
            <motion.section variants={item}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[13px] font-semibold text-gray-400 uppercase tracking-wide">
                  Open matches near you
                </h2>
                <button
                  onClick={() => navigate('/play/join')}
                  className="flex items-center gap-0.5 text-[13px] font-medium text-teal-600"
                >
                  All <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="space-y-2.5">
                {openMatches.map((match, i) => (
                  <MatchCard
                    key={match.id}
                    match={match}
                    currentUserId={user?.id}
                    action="join"
                    onJoin={() => navigate(`/matches/${match.id}`)}
                    index={i}
                  />
                ))}
              </div>
            </motion.section>
          )}

          {openMatches.length === 0 && upcoming.length > 0 && (
            <motion.section variants={item}>
              <h2 className="text-[13px] font-semibold text-gray-400 uppercase tracking-wide mb-3">
                Open matches near you
              </h2>
              <div className="rounded-2xl bg-gray-50 border border-gray-100 px-5 py-6 text-center">
                <p className="text-[14px] font-medium text-gray-500">No open matches right now</p>
                <p className="text-[12px] text-gray-400 mt-1">Check back later or create one</p>
              </div>
            </motion.section>
          )}

          {/* Bottom spacing for nav */}
          <div className="h-4" />
        </motion.div>
      </div>

      {/* Create match sheet */}
      <CreateMatchSheet open={createOpen} onClose={() => setCreateOpen(false)} />
    </>
  )
}
