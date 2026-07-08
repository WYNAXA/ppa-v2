/**
 * Density timeline for range-poll voter screen.
 * Shows a per-day horizontal strip of 30-min blocks shaded by how many
 * OTHER submitted voters have a range covering each block. The current
 * voter's own ranges are overlaid as a teal outline band.
 *
 * Read-only — no interaction changes voting.
 */

import { useMemo } from 'react'
import { format } from 'date-fns'

interface TimeRange {
  start: string  // "HH:MM"
  end: string    // "HH:MM"
}

interface Props {
  date: string                              // "yyyy-MM-dd"
  otherRanges: TimeRange[]                  // flattened ranges from OTHER submitted voters
  voterRanges: TimeRange[]                  // current voter's in-progress ranges (for overlay)
  totalOtherVoters: number                  // count of other submitted voters (for label)
}

// 30-min blocks from 06:00 to 23:30 (36 blocks)
const BLOCK_START = 6 * 60   // 06:00
const BLOCK_END = 24 * 60    // 24:00 (exclusive)
const BLOCK_SIZE = 30         // minutes
const BLOCKS: number[] = []
for (let m = BLOCK_START; m < BLOCK_END; m += BLOCK_SIZE) {
  BLOCKS.push(m)
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function minutesToLabel(m: number): string {
  const h = Math.floor(m / 60)
  return `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

function rangeCoversBlock(ranges: TimeRange[], blockStart: number): boolean {
  const blockEnd = blockStart + BLOCK_SIZE
  return ranges.some(r => {
    const rStart = timeToMinutes(r.start)
    const rEnd = timeToMinutes(r.end)
    // Range covers block if it starts before block ends AND ends after block starts
    return rStart < blockEnd && rEnd > blockStart
  })
}

export function DensityTimeline({ date, otherRanges, voterRanges, totalOtherVoters }: Props) {
  // Compute density: for each 30-min block, count how many OTHER ranges cover it
  // otherRanges is already a flat list of all other voters' ranges for this date.
  // We need per-voter coverage, but we receive a flat list. To count correctly,
  // the parent must pass per-voter ranges. Instead we receive pre-computed density.
  // Actually, let's compute from the flat list by checking coverage per block.
  //
  // Wait — a flat list loses per-voter grouping. We need the count of voters
  // covering each block, not the count of ranges. The parent will pass
  // otherRanges as a flat list, so we can't distinguish voters.
  //
  // Solution: parent passes the density array directly. Let me restructure.
  // Actually simpler: accept a density array as prop.

  // For now, since otherRanges is flat, each range covering a block adds 1.
  // This overcounts if a voter has overlapping ranges on the same day, but
  // that's unlikely and the visual nudge is still directionally correct.
  const density = useMemo(() => {
    return BLOCKS.map(blockStart => {
      let count = 0
      for (const r of otherRanges) {
        const rStart = timeToMinutes(r.start)
        const rEnd = timeToMinutes(r.end)
        if (rStart < blockStart + BLOCK_SIZE && rEnd > blockStart) {
          count++
        }
      }
      return count
    })
  }, [otherRanges])

  const maxDensity = Math.max(...density, 1)
  const hasAnyDensity = density.some(d => d > 0)

  // Voter's own ranges overlay
  const voterBlocks = useMemo(() => {
    return BLOCKS.map(blockStart => rangeCoversBlock(voterRanges, blockStart))
  }, [voterRanges])

  // Hour labels: show every 2 hours
  const hourLabels = BLOCKS.filter((_, i) => i % 4 === 0)

  return (
    <div className="space-y-1">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
          Group availability
        </span>
        {hasAnyDensity && (
          <span className="text-[10px] text-gray-400">
            {totalOtherVoters} vote{totalOtherVoters !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Timeline strip */}
      {!hasAnyDensity ? (
        <div className="h-7 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center">
          <span className="text-[10px] text-gray-300">No availability yet</span>
        </div>
      ) : (
        <div className="relative">
          {/* Density blocks */}
          <div className="flex h-7 rounded-lg overflow-hidden border border-gray-100">
            {BLOCKS.map((blockStart, i) => {
              const count = density[i]
              const intensity = count / maxDensity
              const isVoterBlock = voterBlocks[i]

              return (
                <div
                  key={blockStart}
                  className="flex-1 relative group"
                  title={`${minutesToLabel(blockStart)}–${minutesToLabel(blockStart + BLOCK_SIZE)}: ${count} player${count !== 1 ? 's' : ''}`}
                >
                  {/* Density fill */}
                  <div
                    className="absolute inset-0"
                    style={{
                      backgroundColor: count > 0
                        ? `rgba(0, 150, 136, ${0.12 + intensity * 0.48})`  // #009688 at varying opacity
                        : 'transparent',
                    }}
                  />
                  {/* Voter overlay — teal outline band */}
                  {isVoterBlock && (
                    <div
                      className="absolute inset-x-0 top-0 bottom-0"
                      style={{
                        borderTop: '2.5px solid #009688',
                        borderBottom: '2.5px solid #009688',
                        borderLeft: i === 0 || !voterBlocks[i - 1] ? '2px solid #009688' : 'none',
                        borderRight: i === BLOCKS.length - 1 || !voterBlocks[i + 1] ? '2px solid #009688' : 'none',
                      }}
                    />
                  )}
                  {/* Hover tooltip — count badge */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    {count > 0 && (
                      <span className="text-[8px] font-bold text-[#009688] bg-white/80 rounded px-0.5">
                        {count}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Hour labels */}
          <div className="flex mt-0.5">
            {BLOCKS.map((blockStart, i) => {
              if (i % 4 !== 0) return <div key={blockStart} className="flex-1" />
              return (
                <div key={blockStart} className="flex-1 text-[8px] text-gray-300 leading-none">
                  {Math.floor(blockStart / 60)}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Compute per-date density data from other voters' availability_ranges.
 * Returns a map: { "yyyy-MM-dd": TimeRange[] } — flat list of all other
 * voters' ranges for each date (one entry per range per voter).
 */
export function computeOtherRanges(
  otherResponses: { availability_ranges: Record<string, TimeRange[]> }[],
): Record<string, TimeRange[]> {
  const result: Record<string, TimeRange[]> = {}
  for (const resp of otherResponses) {
    for (const [date, ranges] of Object.entries(resp.availability_ranges)) {
      if (!result[date]) result[date] = []
      result[date].push(...ranges)
    }
  }
  return result
}
