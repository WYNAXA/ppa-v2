import { cn } from '@/lib/utils'

/**
 * The app's switch, in one place.
 *
 * This markup existed in eight copies across You, GroupDetail and
 * CreateGroupSheet — same 6x11 pill, same 4x4 knob, same translate-x-6/1, all
 * hand-written. Eight copies is eight chances for one of them to drift, and it
 * is where a design-token change quietly misses a screen.
 *
 * The classes here are byte-for-byte what those eight rendered, so this is a
 * de-duplication and not a restyle. The only additions are `role="switch"` and
 * `aria-checked`, which no copy had and which cost nothing visually: a screen
 * reader previously announced these as unlabelled buttons with no state.
 */
export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
  className,
}: {
  checked: boolean
  onChange: () => void
  /** Announced to screen readers. Required — an unlabelled switch is a bug. */
  label: string
  disabled?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={cn(
        'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
        checked ? 'bg-court' : 'bg-hairline',
        disabled && 'opacity-50',
        className,
      )}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 rounded-full bg-card shadow transition-transform',
          checked ? 'translate-x-6' : 'translate-x-1',
        )}
      />
    </button>
  )
}
