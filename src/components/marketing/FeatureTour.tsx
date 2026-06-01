import { useEffect, useRef, useState } from 'react'
import { IPhoneFrame } from './IPhoneFrame'
import { useReducedMotion } from './useReducedMotion'

interface TourStop {
  id: string
  label: string
  heading: string
  body: string
  screenshot: string
  alt: string
}

const STOPS: TourStop[] = [
  {
    id: 'home',
    label: 'Home',
    heading: 'Your dashboard',
    body: 'See upcoming matches, recent results, and quick actions — all in one place.',
    screenshot: '/screenshots/home.png',
    alt: 'Home dashboard showing upcoming matches',
  },
  {
    id: 'play',
    label: 'Play',
    heading: 'Find your next match',
    body: 'Browse open matches near you, create your own in seconds, or let Find My Game auto-match you based on availability.',
    screenshot: '/screenshots/match.png',
    alt: 'Play tab — match discovery and scheduling',
  },
  {
    id: 'compete',
    label: 'Compete',
    heading: 'Leagues and rankings',
    body: 'Run leagues with Round Robin or Mexicano formats. Track live standings, seasons, and your global ELO ranking.',
    screenshot: '/screenshots/leagues.png',
    alt: 'Compete tab — league standings and rankings',
  },
  {
    id: 'community',
    label: 'Community',
    heading: 'Your padel network',
    body: 'Create or join groups, discover players and coaches, find venues and events near you.',
    screenshot: '/screenshots/community.png',
    alt: 'Community tab — groups and player discovery',
  },
  {
    id: 'you',
    label: 'You',
    heading: 'Your profile',
    body: 'Track your stats, win rate, best streak, and earned badges. Customise your avatar and banner.',
    screenshot: '/screenshots/you.png',
    alt: 'Profile tab — stats, achievements, and settings',
  },
]

/* ── Desktop: pinned phone with scroll-sync ── */
function DesktopTour() {
  const [activeIdx, setActiveIdx] = useState(0)
  const sectionRefs = useRef<(HTMLDivElement | null)[]>([])
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    const observers: IntersectionObserver[] = []
    sectionRefs.current.forEach((el, i) => {
      if (!el) return
      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) setActiveIdx(i)
        },
        { threshold: 0.5 }
      )
      obs.observe(el)
      observers.push(obs)
    })
    return () => observers.forEach((o) => o.disconnect())
  }, [])

  return (
    <div className="relative flex gap-16 max-w-6xl mx-auto px-6">
      {/* Left: sticky phone */}
      <div className="w-[300px] flex-shrink-0">
        <div className="sticky top-[calc(50vh-280px)]">
          <div className="relative">
            <IPhoneFrame
              src={STOPS[activeIdx].screenshot}
              alt={STOPS[activeIdx].alt}
              width={280}
            />
            {/* Crossfade overlay — stack all images, hide inactive */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ borderRadius: 'inherit' }}
            >
              {STOPS.map((stop, i) => (
                <div
                  key={stop.id}
                  className="absolute inset-0"
                  style={{
                    opacity: i === activeIdx ? 1 : 0,
                    transition: reducedMotion ? 'none' : 'opacity 0.4s ease',
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Right: scrolling sections */}
      <div className="flex-1 py-20">
        {STOPS.map((stop, i) => (
          <div
            key={stop.id}
            ref={(el) => { sectionRefs.current[i] = el }}
            className="min-h-[70vh] flex flex-col justify-center py-12"
          >
            <span className="inline-block text-[12px] font-bold uppercase tracking-wider text-teal-600 mb-2">
              {stop.label}
            </span>
            <h3
              className="font-display text-[28px] font-extrabold text-navy leading-tight mb-3"
              style={{
                opacity: activeIdx === i ? 1 : 0.3,
                transition: reducedMotion ? 'none' : 'opacity 0.3s ease',
              }}
            >
              {stop.heading}
            </h3>
            <p
              className="text-[15px] text-gray-500 leading-relaxed max-w-md"
              style={{
                opacity: activeIdx === i ? 1 : 0.3,
                transition: reducedMotion ? 'none' : 'opacity 0.3s ease',
              }}
            >
              {stop.body}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Mobile: horizontal scroll-snap carousel ── */
function MobileTour() {
  return (
    <div className="px-4">
      <div className="flex gap-5 overflow-x-auto snap-x snap-mandatory scrollbar-none pb-4 -mx-4 px-4">
        {STOPS.map((stop) => (
          <div
            key={stop.id}
            className="snap-center flex-shrink-0 w-[240px] flex flex-col items-center"
          >
            <IPhoneFrame src={stop.screenshot} alt={stop.alt} width={220} />
            <div className="mt-4 text-center">
              <span className="text-[11px] font-bold uppercase tracking-wider text-teal-600">
                {stop.label}
              </span>
              <h3 className="font-display text-[16px] font-bold text-navy mt-1">{stop.heading}</h3>
              <p className="text-[12px] text-gray-500 leading-relaxed mt-1 px-2">{stop.body}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function FeatureTour() {
  return (
    <section className="bg-cream py-16 sm:py-24">
      <div className="text-center mb-12 px-6">
        <p className="text-[13px] font-semibold text-teal-600 uppercase tracking-wider mb-2">
          Five hubs, one app
        </p>
        <h2 className="font-display text-[26px] sm:text-[36px] font-extrabold text-navy">
          Everything at your fingertips
        </h2>
      </div>

      {/* Desktop: pinned phone + scroll */}
      <div className="hidden md:block">
        <DesktopTour />
      </div>

      {/* Mobile: carousel */}
      <div className="md:hidden">
        <MobileTour />
      </div>
    </section>
  )
}
