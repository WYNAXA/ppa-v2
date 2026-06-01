import { useReducedMotion } from './useReducedMotion'

interface AtmosphereBandProps {
  src: string
  alt: string
  /** Content overlay — positioned over the gradient */
  children?: React.ReactNode
  /** Height class, default h-[340px] sm:h-[420px] */
  heightClass?: string
  /** Gradient direction: 'left' or 'right' */
  gradientSide?: 'left' | 'right'
}

export function AtmosphereBand({
  src,
  alt,
  children,
  heightClass = 'h-[340px] sm:h-[420px]',
  gradientSide = 'left',
}: AtmosphereBandProps) {
  const reducedMotion = useReducedMotion()

  return (
    <section className={`relative overflow-hidden ${heightClass}`}>
      {/* Background image — very subtle parallax unless reduced motion */}
      <div
        className="absolute inset-0"
        style={!reducedMotion ? { backgroundAttachment: 'fixed' } : undefined}
      >
        <img
          src={src}
          alt={alt}
          loading="lazy"
          width={1920}
          height={800}
          className="absolute inset-0 w-full h-full object-cover"
        />
      </div>

      {/* Gradient overlay */}
      <div
        className="absolute inset-0"
        style={{
          background:
            gradientSide === 'left'
              ? 'linear-gradient(to right, rgba(16,33,52,0.88) 0%, rgba(16,33,52,0.5) 50%, transparent 100%)'
              : 'linear-gradient(to left, rgba(16,33,52,0.88) 0%, rgba(16,33,52,0.5) 50%, transparent 100%)',
        }}
      />

      {/* Content */}
      {children && (
        <div className="relative z-10 h-full flex items-center">
          <div className="mx-auto max-w-6xl px-6 w-full">
            {children}
          </div>
        </div>
      )}
    </section>
  )
}
