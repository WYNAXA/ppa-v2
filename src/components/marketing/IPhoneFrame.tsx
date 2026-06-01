/**
 * Pure-CSS iPhone frame with dynamic island pill.
 * Dark bezel, 44px corners, soft shadow.
 */
interface IPhoneFrameProps {
  src: string
  alt: string
  className?: string
  /** Width of the outer frame in px. Height is auto (19.5:9 aspect). */
  width?: number
}

export function IPhoneFrame({ src, alt, className = '', width = 260 }: IPhoneFrameProps) {
  const bezel = Math.round(width * 0.025) // ~2.5% of width
  const innerRadius = Math.round(width * 0.15)
  const outerRadius = Math.round(width * 0.17)
  const pillW = Math.round(width * 0.3)
  const pillH = Math.round(width * 0.045)

  return (
    <div
      className={`relative inline-block ${className}`}
      style={{ width }}
    >
      {/* Outer bezel */}
      <div
        className="bg-navy shadow-2xl"
        style={{
          borderRadius: outerRadius,
          padding: bezel,
        }}
      >
        {/* Dynamic island pill */}
        <div
          className="absolute left-1/2 bg-navy z-10"
          style={{
            width: pillW,
            height: pillH,
            borderRadius: pillH,
            top: bezel + Math.round(pillH * 0.6),
            transform: 'translateX(-50%)',
          }}
        />
        {/* Screen */}
        <div
          className="overflow-hidden bg-gray-100 relative"
          style={{ borderRadius: innerRadius }}
        >
          <img
            src={src}
            alt={alt}
            loading="lazy"
            width={width - bezel * 2}
            height={Math.round((width - bezel * 2) * (19.5 / 9))}
            className="block w-full"
            style={{ aspectRatio: '9 / 19.5', objectFit: 'cover' }}
          />
        </div>
      </div>
    </div>
  )
}
