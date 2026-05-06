import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { MapPin, Clock, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { PlayerAvatar } from './PlayerAvatar'
import { cn } from '@/lib/utils'
import { format, parseISO } from 'date-fns'

export interface MatchCardData {
  id: string
  match_date: string
  match_time: string | null
  booked_venue_name: string | null
  player_ids: string[]
  match_type: string | null
  status: string
  notes?: string | null
  // Joined player profiles (optional — shown as initials if absent)
  players?: Array<{ id: string; name: string; avatar_url?: string | null }>
  // Past match result data
  score?: string
  didWin?: boolean
}

interface MatchCardProps {
  match: MatchCardData
  currentUserId?: string
  action?: 'join' | 'view'
  onJoin?: (matchId: string) => void
  index?: number
}

const TYPE_CLASS: Record<string, string> = {
  competitive: 'bg-orange-50 text-orange-600 border-orange-100',
  friendly:    'bg-blue-50 text-blue-600 border-blue-100',
  casual:      'bg-gray-50 text-gray-500 border-gray-100',
  group:       'bg-teal-50 text-teal-600 border-teal-100',
}

const STATUS_DOT: Record<string, string> = {
  confirmed: 'bg-green-400',
  scheduled: 'bg-green-400',
  open:      'bg-orange-400',
  pending:   'bg-yellow-400',
  completed: 'bg-gray-400',
}

function formatMatchDate(dateStr: string, timeStr: string | null) {
  try {
    const d = parseISO(dateStr)
    const dayPart = format(d, 'EEE d MMM')
    if (!timeStr) return dayPart
    return `${dayPart} · ${timeStr.slice(0, 5)}`
  } catch {
    return dateStr
  }
}

export function MatchCard({ match, currentUserId: _currentUserId, action = 'view', onJoin, index = 0 }: MatchCardProps) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const typeKey = match.match_type ?? 'group'
  const typeClass = TYPE_CLASS[typeKey] ?? TYPE_CLASS.group
  const typeLabel = t(`matches.type_${typeKey}`, { defaultValue: typeKey })
  const statusDot = STATUS_DOT[match.status] ?? 'bg-gray-300'
  const statusKey = match.status === 'scheduled' ? 'confirmed' : match.status
  const statusLabel = t(`matches.status_${statusKey}`, { defaultValue: match.status })

  // Parse guest names from notes
  const guestNames = (match as any).notes?.match(/Guests?: (.+)/)?.[1]?.split(',').map((n: string) => n.trim()) ?? []
  const totalPlayers = match.player_ids.length + guestNames.length
  const avatarSlots = match.player_ids.slice(0, 4)
  const hasResult = match.score !== undefined

  return (
    <motion.button
      onClick={() => navigate(`/matches/${match.id}`)}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.25 }}
      whileTap={{ scale: 0.985 }}
      className="w-full text-left bg-white border border-gray-100 rounded-2xl px-4 py-3.5 hover:border-teal-200 hover:bg-teal-50/20 transition-all duration-150 active:scale-[0.985]"
    >
      <div className="flex items-start justify-between gap-3">
        {/* Left */}
        <div className="min-w-0 flex-1">
          {/* Date / time */}
          <p className="text-[13px] font-semibold text-gray-900 leading-tight">
            {formatMatchDate(match.match_date, match.match_time)}
          </p>

          {/* Venue */}
          {match.booked_venue_name && (
            <div className="flex items-center gap-1 mt-1">
              <MapPin className="h-3 w-3 text-gray-400 flex-shrink-0" />
              <p className="text-[12px] text-gray-500 truncate">{match.booked_venue_name}</p>
            </div>
          )}

          {/* Players */}
          <div className="flex items-center gap-1.5 mt-2.5">
            <div className="flex -space-x-1.5">
              {avatarSlots.map((pid) => {
                const player = match.players?.find((p) => p.id === pid)
                return (
                  <PlayerAvatar
                    key={pid}
                    name={player?.name ?? null}
                    avatarUrl={player?.avatar_url}
                    size="sm"
                  />
                )
              })}
              {guestNames.slice(0, 4 - avatarSlots.length).map((name: string, i: number) => (
                <div key={`guest-${i}`} className="h-7 w-7 rounded-full bg-gray-200 border-2 border-white flex items-center justify-center" title={`Guest: ${name}`}>
                  <span className="text-[10px] font-bold text-gray-500 leading-none">{name.charAt(0).toUpperCase()}</span>
                </div>
              ))}
              {totalPlayers < 4 && (
                <div className="h-7 w-7 rounded-full border-2 border-dashed border-gray-200 bg-gray-50 flex items-center justify-center">
                  <span className="text-[10px] text-gray-300 leading-none">+</span>
                </div>
              )}
            </div>
            <span className="text-[11px] text-gray-400">
              {totalPlayers}/4
            </span>
          </div>

          {/* Badges */}
          <div className="flex items-center gap-1.5 mt-2">
            <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold', typeClass)}>
              {typeLabel}
            </span>
            {!hasResult && (
              <span className="inline-flex items-center gap-1 rounded-full bg-gray-50 border border-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
                <span className={cn('h-1.5 w-1.5 rounded-full', statusDot)} />
                {statusLabel}
              </span>
            )}
          </div>
        </div>

        {/* Right */}
        <div className="flex flex-col items-end justify-between self-stretch gap-2 flex-shrink-0">
          {/* Score badge for past matches */}
          {hasResult ? (
            <div className={cn(
              'flex flex-col items-end gap-0.5'
            )}>
              <span className={cn(
                'text-[15px] font-black',
                match.didWin === true ? 'text-teal-600' : match.didWin === false ? 'text-red-500' : 'text-gray-700'
              )}>
                {match.score}
              </span>
              <span className={cn(
                'text-[10px] font-bold uppercase tracking-wide',
                match.didWin === true ? 'text-teal-500' : match.didWin === false ? 'text-red-400' : 'text-gray-400'
              )}>
                {match.didWin === true ? t('matches.win') : match.didWin === false ? t('matches.loss') : t('matches.draw')}
              </span>
            </div>
          ) : action === 'join' && onJoin ? (
            <button
              onClick={(e) => { e.stopPropagation(); onJoin(match.id) }}
              className="rounded-xl bg-[#009688] px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-teal-700 active:scale-95"
            >
              {t('play.join')}
            </button>
          ) : (
            <ChevronRight className="h-4 w-4 text-gray-300 mt-1" />
          )}
          {match.match_time && !hasResult && (
            <div className="flex items-center gap-0.5 text-[11px] text-gray-400">
              <Clock className="h-3 w-3" />
              {match.match_time.slice(0, 5)}
            </div>
          )}
        </div>
      </div>
    </motion.button>
  )
}
