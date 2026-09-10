import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { MapPin, Clock, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { PlayerAvatar } from './PlayerAvatar'
import { cn } from '@/lib/utils'
import { format, parseISO } from 'date-fns'
import { getDateLocale } from '@/lib/dateLocale'

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
  competitive: 'bg-warn-50 text-warn border-warn-100',
  friendly:    'bg-surface text-ink-2 border-hairline',
  casual:      'bg-surface text-ink-2 border-hairline',
  group:       'bg-court-50 text-court border-court-100',
}

const STATUS_DOT: Record<string, string> = {
  confirmed: 'bg-court',
  scheduled: 'bg-court',
  open:      'bg-warn',
  pending:   'bg-warn',
  completed: 'bg-ink-4',
}

function formatMatchDate(dateStr: string, timeStr: string | null) {
  try {
    const d = parseISO(dateStr)
    const dayPart = format(d, 'EEE d MMM', { locale: getDateLocale() })
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
  const statusDot = STATUS_DOT[match.status] ?? 'bg-ink-4'
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
      className="w-full text-left bg-white border border-hairline rounded-2xl px-4 py-3.5 hover:border-court-100 hover:bg-court-50/20 transition-all duration-150 active:scale-[0.985]"
    >
      <div className="flex items-start justify-between gap-3">
        {/* Left */}
        <div className="min-w-0 flex-1">
          {/* Date / time */}
          <p className="text-[13px] font-semibold text-ink leading-tight">
            {formatMatchDate(match.match_date, match.match_time)}
          </p>

          {/* Venue */}
          {match.booked_venue_name && (
            <div className="flex items-center gap-1 mt-1">
              <MapPin className="h-3 w-3 text-ink-2 flex-shrink-0" />
              <p className="text-[12px] text-ink-2 truncate">{match.booked_venue_name}</p>
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
                <div key={`guest-${i}`} className="h-7 w-7 rounded-full bg-hairline border-2 border-white flex items-center justify-center" title={`Guest: ${name}`}>
                  <span className="text-[11px] font-bold text-ink-2 leading-none">{name.charAt(0).toUpperCase()}</span>
                </div>
              ))}
              {totalPlayers < 4 && (
                <div className="h-7 w-7 rounded-full border-2 border-dashed border-hairline bg-surface flex items-center justify-center">
                  <span className="text-[11px] text-ink-3 leading-none">+</span>
                </div>
              )}
            </div>
            <span className="text-[11px] text-ink-2">
              {totalPlayers}/4
            </span>
          </div>

          {/* Badges */}
          <div className="flex items-center gap-1.5 mt-2">
            <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold', typeClass)}>
              {typeLabel}
            </span>
            {!hasResult && (
              <span className="inline-flex items-center gap-1 rounded-full bg-surface border border-hairline px-2 py-0.5 text-[11px] font-medium text-ink-2">
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
                match.didWin === true ? 'text-court' : match.didWin === false ? 'text-alert' : 'text-ink-2'
              )}>
                {match.score}
              </span>
              <span className={cn(
                'text-[11px] font-bold uppercase tracking-wide',
                match.didWin === true ? 'text-court' : match.didWin === false ? 'text-alert' : 'text-ink-2'
              )}>
                {match.didWin === true ? t('matches.win') : match.didWin === false ? t('matches.loss') : t('matches.draw')}
              </span>
            </div>
          ) : action === 'join' && onJoin ? (
            <button
              onClick={(e) => { e.stopPropagation(); onJoin(match.id) }}
              className="rounded-xl bg-court px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-court-700 active:scale-95"
            >
              {t('play.join')}
            </button>
          ) : (
            <ChevronRight className="h-4 w-4 text-ink-3 mt-1" />
          )}
          {match.match_time && !hasResult && (
            <div className="flex items-center gap-0.5 text-[11px] text-ink-2">
              <Clock className="h-3 w-3" />
              {match.match_time.slice(0, 5)}
            </div>
          )}
        </div>
      </div>
    </motion.button>
  )
}
