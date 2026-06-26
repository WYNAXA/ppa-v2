import { useState } from 'react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

// Shared collapsed/expand leaderboard layout. Identity-agnostic: the caller
// renders the identity cell (individual avatar+name, or PairAvatar+team name)
// and decides isMe. The component owns rank/medals (by display index), the
// headline stat slot(s), expand interaction, and isMe row styling. Rank is the
// array index so the medal is always on the visually-first row — display order
// IS rank; they cannot drift.

interface Props<Row extends { id: string }> {
  rows: Row[]
  // Caller renders the full identity cell (avatar + name + any jersey marks).
  identity: (row: Row, isMe: boolean) => ReactNode
  // Caller decides whether this row is the current user / their team.
  isMe: (row: Row) => boolean
  headline: (row: Row, isMe: boolean) => ReactNode
  headlineLabel: string
  headline2?: (row: Row, isMe: boolean) => ReactNode
  headlineLabel2?: string
  detail: (row: Row) => ReactNode
}

export function StandingsAccordion<Row extends { id: string }>({
  rows, identity, isMe, headline, headlineLabel, headline2, headlineLabel2, detail,
}: Props<Row>) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggle = (id: string) =>
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })

  const cols = headline2 ? 'grid-cols-[28px_1fr_44px_40px]' : 'grid-cols-[28px_1fr_56px]'

  return (
    <div className="rounded-2xl border border-gray-100 overflow-hidden">
      <div className={cn('grid gap-1 px-3 py-2 bg-gray-50 border-b border-gray-100', cols)}>
        {(headline2 ? ['#', 'Player', headlineLabel, headlineLabel2!] : ['#', 'Player', headlineLabel]).map((h) => (
          <span key={h} className="text-[10px] font-bold text-gray-400 text-center first:text-left">{h}</span>
        ))}
      </div>
      {rows.map((row, i) => {
        const me = isMe(row)
        const isExpanded = expanded.has(row.id)
        return (
          <div
            key={row.id}
            className={cn(
              i < rows.length - 1 && 'border-b border-gray-50',
              me && 'bg-teal-50/60',
            )}
          >
            <button
              onClick={() => toggle(row.id)}
              className={cn('w-full grid gap-1 items-center px-3 py-2 text-left', cols)}
            >
              <span className={cn('text-[12px] font-bold', me ? 'text-[#009688]' : 'text-gray-400')}>
                {i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}
              </span>
              <div className="min-w-0 overflow-hidden flex items-center gap-2">
                {identity(row, me)}
              </div>
              <div className="text-center">{headline(row, me)}</div>
              {headline2 && <div className="text-center">{headline2(row, me)}</div>}
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
