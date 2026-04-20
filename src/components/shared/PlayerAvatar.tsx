interface PlayerAvatarProps {
  name?: string | null
  avatarUrl?: string | null
  size?: 'sm' | 'md' | 'lg'
  badge?: string
}

const sizes = {
  sm: 'h-7 w-7 text-[10px]',
  md: 'h-9 w-9 text-[12px]',
  lg: 'h-11 w-11 text-[14px]',
}

const PALETTE = [
  '#009688', '#00897b', '#00796b',
  '#E65100', '#BF360C',
  '#1565C0', '#283593',
  '#6A1B9A', '#4527A0',
]

function colourFor(name?: string | null) {
  if (!name) return '#9ca3af'
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

  return (
    <div className="relative inline-flex flex-shrink-0">
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={name ?? 'Player'}
          className={`${cls} rounded-full object-cover`}
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
        <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-white px-1 py-px text-[8px] font-bold leading-none text-teal-600 shadow-sm border border-teal-100">
          {badge}
        </span>
      )}
    </div>
  )
}
