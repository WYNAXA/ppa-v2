import { useState, useEffect } from 'react'

interface PlayerAvatarProps {
  name?: string | null
  avatarUrl?: string | null
  size?: 'sm' | 'md' | 'lg'
  badge?: string
}

const sizes = {
  sm: 'h-7 w-7 text-[11px]',
  md: 'h-9 w-9 text-[12px]',
  lg: 'h-11 w-11 text-[14px]',
}

/**
 * Avatar fills. Eight hues that all sit in the same family as `court`, so a
 * row of four players reads as one set rather than a bag of Material swatches.
 * The previous list mixed Material orange, blue and purple with the brand teal,
 * which is why four avatars side by side looked like a colour test card.
 *
 * All eight clear 4.5:1 against white initials.
 */
const PALETTE = [
  '#0F5D54', // court
  '#0A473F', // court-700
  '#12786B',
  '#1C6B7A', // teal drifting to blue
  '#2A5F86',
  '#3C5A8A',
  '#4A5D6E', // slate
  '#5C6F5A', // moss
]

function colourFor(name?: string | null) {
  if (!name) return '#7C8B86'
  const sum = [...name].reduce((a, c) => a + c.charCodeAt(0), 0)
  return PALETTE[sum % PALETTE.length]
}

function initials(name?: string | null) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function PlayerAvatar({ name, avatarUrl, size = 'md', badge }: PlayerAvatarProps) {
  const cls = sizes[size]
  const [failed, setFailed] = useState(false)
  useEffect(() => { setFailed(false) }, [avatarUrl])
  const showImage = !!avatarUrl && !failed

  return (
    <div className="relative inline-flex flex-shrink-0">
      {showImage ? (
        <img
          src={avatarUrl!}
          alt={name ?? 'Player'}
          className={`${cls} rounded-full object-cover`}
          onError={() => setFailed(true)}
        />
      ) : (
        <div
          className={`${cls} rounded-full flex items-center justify-center font-semibold text-white flex-shrink-0`}
          style={{ backgroundColor: colourFor(name) }}
        >
          {initials(name)}
        </div>
      )}
      {badge && (
        <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-white px-1 py-px text-[11px] font-bold leading-none text-court shadow-sm border border-court-100">
          {badge}
        </span>
      )}
    </div>
  )
}
