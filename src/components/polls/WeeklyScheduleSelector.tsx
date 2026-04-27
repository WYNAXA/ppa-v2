import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { CheckCircle, Users, AlertTriangle, Star, Calendar, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PlayerProfile {
  id: string
  name: string
  playtomic_level?: number
  internal_ranking?: number
}

interface MatchOption {
  optionNumber: number
  dayOfWeek: string
  date: string
  timeSlot: string
  actualStartTime?: string
  playerIds: string[]
  playerNames: string[]
  playersNeeded: number
  status: 'ready' | 'need_ringer' | 'conflict_warning'
  conflicts: any[]
  quality: 'excellent' | 'good' | 'fair'
}

interface WeeklySchedule {
  scheduleNumber: number
  strategyName: string
  strategyDescription: string
  isRecommended: boolean
  quality: 'excellent' | 'good' | 'fair'
  matches: MatchOption[]
  totalPlayers: number
  totalMatches: number
  ringersNeeded: number
  daysUsed: number
}

interface Props {
  weeklySchedules: WeeklySchedule[]
  allProfiles: Record<string, PlayerProfile>
  onSelectSchedule: (schedule: WeeklySchedule) => void
  loading?: boolean
}

function formatMatchDate(dateStr: string): string {
  try { return format(parseISO(dateStr), 'EEE d MMM') } catch { return dateStr }
}

function QualityBadge({ quality }: { quality: 'excellent' | 'good' | 'fair' }) {
  return (
    <span className={cn(
      'text-[10px] font-bold rounded-full px-2 py-0.5 uppercase tracking-wide',
      quality === 'excellent' ? 'bg-green-100 text-green-700' :
      quality === 'good'      ? 'bg-teal-100 text-teal-700' :
                                'bg-gray-100 text-gray-500'
    )}>
      {quality}
    </span>
  )
}

function PlayerInitials({ name }: { name?: string }) {
  const initials = (name ?? '?').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div className="h-7 w-7 rounded-full bg-teal-100 flex items-center justify-center text-[10px] font-bold text-teal-700 flex-shrink-0 border border-white">
      {initials}
    </div>
  )
}

function MatchCard({ match, profiles }: { match: MatchOption; profiles: Record<string, PlayerProfile> }) {
  const hasConflicts = match.conflicts?.length > 0
  const needsRinger = match.playersNeeded > 0

  return (
    <div className={cn(
      'rounded-xl border px-3 py-3 space-y-2',
      hasConflicts ? 'border-amber-200 bg-amber-50/40' :
      needsRinger  ? 'border-blue-100 bg-blue-50/30' :
                     'border-gray-100 bg-white'
    )}>
      {/* Date + time */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[12px] text-gray-700">
          <Calendar className="h-3.5 w-3.5 text-gray-400" />
          <span className="font-semibold">{formatMatchDate(match.date)}</span>
        </div>
        <div className="flex items-center gap-1 text-[12px] text-gray-500">
          <Clock className="h-3 w-3" />
          {match.actualStartTime ?? match.timeSlot.split('-')[0].trim()}
        </div>
      </div>

      {/* Players */}
      <div className="flex items-center gap-1.5">
        <div className="flex -space-x-1.5">
          {match.playerIds.map((id) => (
            <PlayerInitials key={id} name={profiles[id]?.name} />
          ))}
          {match.playersNeeded > 0 && Array.from({ length: match.playersNeeded }).map((_, i) => (
            <div key={`ringer-${i}`} className="h-7 w-7 rounded-full bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center">
              <span className="text-[10px] text-gray-400">?</span>
            </div>
          ))}
        </div>
        <span className="text-[12px] text-gray-500 ml-1">
          {match.playerNames.join(', ')}
          {needsRinger && <span className="text-blue-500 font-medium"> +{match.playersNeeded} needed</span>}
        </span>
      </div>

      {/* Warnings */}
      {hasConflicts && (
        <div className="flex items-center gap-1.5 text-[11px] text-amber-600">
          <AlertTriangle className="h-3.5 w-3.5" />
          Potential household conflict
        </div>
      )}
      {match.status === 'ready' && !hasConflicts && (
        <div className="flex items-center gap-1.5 text-[11px] text-green-600">
          <CheckCircle className="h-3.5 w-3.5" />
          Ready to schedule
        </div>
      )}
    </div>
  )
}

export function WeeklyScheduleSelector({ weeklySchedules, allProfiles, onSelectSchedule, loading }: Props) {
  const [selected, setSelected] = useState<number | null>(null)

  if (weeklySchedules.length === 0) {
    return (
      <p className="text-[13px] text-gray-400 text-center py-4">
        No match configurations generated. Try again with more responses.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {weeklySchedules.map((schedule) => {
        const isChosen = selected === schedule.scheduleNumber

        return (
          <div
            key={schedule.scheduleNumber}
            className={cn(
              'rounded-2xl border-2 transition-all',
              isChosen ? 'border-[#009688] bg-teal-50/30' : 'border-gray-100 bg-white'
            )}
          >
            {/* Schedule header */}
            <button
              onClick={() => setSelected(isChosen ? null : schedule.scheduleNumber)}
              className="w-full flex items-start justify-between px-4 py-3.5 text-left"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-[14px] font-bold text-gray-900">{schedule.strategyName}</p>
                  <QualityBadge quality={schedule.quality} />
                  {schedule.isRecommended && (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 rounded-full px-2 py-0.5">
                      <Star className="h-3 w-3" /> Recommended
                    </span>
                  )}
                </div>
                <p className="text-[12px] text-gray-500 mt-0.5">{schedule.strategyDescription}</p>
                <div className="flex items-center gap-3 mt-2 text-[12px] text-gray-500">
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    {schedule.totalPlayers} players
                  </span>
                  <span>{schedule.totalMatches} {schedule.totalMatches === 1 ? 'match' : 'matches'}</span>
                  {schedule.ringersNeeded > 0 && (
                    <span className="text-blue-500">{schedule.ringersNeeded} ringer{schedule.ringersNeeded > 1 ? 's' : ''} needed</span>
                  )}
                </div>
              </div>
              <div className={cn(
                'mt-0.5 h-5 w-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ml-3',
                isChosen ? 'border-[#009688]' : 'border-gray-300'
              )}>
                {isChosen && <div className="h-2.5 w-2.5 rounded-full bg-[#009688]" />}
              </div>
            </button>

            {/* Expanded match list */}
            {isChosen && (
              <div className="px-4 pb-4 space-y-2">
                <div className="border-t border-gray-100 pt-3 space-y-2">
                  {schedule.matches.map((match, i) => (
                    <MatchCard key={i} match={match} profiles={allProfiles} />
                  ))}
                </div>

                <button
                  onClick={() => onSelectSchedule(schedule)}
                  disabled={loading}
                  className="w-full rounded-xl bg-[#009688] py-3 text-[14px] font-bold text-white disabled:opacity-50 mt-2"
                >
                  {loading ? 'Creating matches…' : 'Confirm this schedule →'}
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
