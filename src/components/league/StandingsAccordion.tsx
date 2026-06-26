import { useState } from 'react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { PlayerAvatar } from '@/components/shared/PlayerAvatar'

// Shared collapsed/expand leaderboard layout used by all standings views.
// Each view supplies a `headline` (the single collapsed stat, styled) and a
// `detail` (the expanded strip). Rank, avatar, wide name, star, jersey, expand
// toggle and isMe styling live here once — the layout that keeps long names
// readable across every view.

export interface StandingsRow {
  id: string
  user_id: string
  profile?: { name?: string | null; avatar_url?: string | null } | null
}

interface Props<Row extends StandingsRow> {
  rows: Row[]
  currentUserId: string | null
  jerseyByUser: Record<string, string>
  jerseyEmoji: Record<string, string>
  headline: (row: Row, isMe: boolean) => ReactNode
  headlineLabel: string
  // Optional second collapsed stat (Points view shows P/ELO + Pts). When present,
  // the grid widens to two stat columns; when absent, a single stat column.
  headline2?: (row: Row, isMe: boolean) => ReactNode
  headlineLabel2?: string
  detail: (row: Row) => ReactNode
}

export function StandingsAccordion<Row extends StandingsRow>({
  rows, currentUserId, jerseyByUser, jerseyEmoji, headline, headlineLabel, headline2, headlineLabel2, detail,
}: Props<Row>) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggle = (uid: string) =>
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(uid)) next.delete(uid); else next.add(uid)
      return next
    })

  return (
    <div className="rounded-2xl border border-gray-100 overflow-hidden">
      <div className={cn('grid gap-1 px-3 py-2 bg-gray-50 border-b border-gray-100', headline2 ? 'grid-cols-[28px_1fr_44px_40px]' : 'grid-cols-[28px_1fr_56px]')}>
        {(headline2 ? ['#', 'Player', headlineLabel, headlineLabel2!] : ['#', 'Player', headlineLabel]).map((h) => (
          <span key={h} className="text-[10px] font-bold text-gray-400 text-center first:text-left">{h}</span>
        ))}
      </div>
      {rows.map((row, i) => {
        const isMe = row.user_id === currentUserId
        const isExpanded = expanded.has(row.user_id)
        return (
          <div
            key={row.id}
            className={cn(
              i < rows.length - 1 && 'border-b border-gray-50',
              isMe && 'bg-teal-50/60',
            )}
          >
            <button
              onClick={() => toggle(row.user_id)}
              className={cn('w-full grid gap-1 items-center px-3 py-2 text-left', headline2 ? 'grid-cols-[28px_1fr_44px_40px]' : 'grid-cols-[28px_1fr_56px]')}
            >
              <span className={cn('text-[12px] font-bold', isMe ? 'text-[#009688]' : 'text-gray-400')}>
                {i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}
              </span>
              <div className="min-w-0 overflow-hidden flex items-center gap-2">
                <PlayerAvatar name={row.profile?.name} avatarUrl={row.profile?.avatar_url} size="sm" />
                <span className={cn('text-[12px] font-semibold truncate', isMe ? 'text-[#009688]' : 'text-gray-800')}>
                  {row.profile?.name ?? 'Unknown'}{isMe ? ' ★' : ''}
                  {jerseyByUser[row.user_id] && (
                    <span className="ml-0.5 text-[11px] leading-none">{jerseyEmoji[jerseyByUser[row.user_id]] ?? ''}</span>
                  )}
                </span>
              </div>
              <div className="text-center">{headline(row, isMe)}</div>
              {headline2 && <div className="text-center">{headline2(row, isMe)}</div>}
            </button>
            {isExpanded && (
              <div className="px-3 pb-2 pt-0">
                <div className="flex items-center gap-3 text-[11px] text-gray-500 pl-[36px]">
                  {detail(row)}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
