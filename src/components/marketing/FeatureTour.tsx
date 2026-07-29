import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IPhoneFrame } from './IPhoneFrame'
import { useReducedMotion } from './useReducedMotion'

interface TourStop {
  id: string
  labelKey: string
  headingKey: string
  bodyKey: string
  screenshot: string
  altKey: string
}

const STOPS: TourStop[] = [
  {
    id: 'home',
    labelKey: 'tour.home_label',
    headingKey: 'tour.home_heading',
    bodyKey: 'tour.home_body',
    screenshot: '/screenshots/home.png',
    altKey: 'tour.home_alt',
  },
  {
    id: 'play',
    labelKey: 'tour.play_label',
    headingKey: 'tour.play_heading',
    bodyKey: 'tour.play_body',
    screenshot: '/screenshots/match.png',
    altKey: 'tour.play_alt',
  },
  {
    id: 'compete',
    labelKey: 'tour.compete_label',
    headingKey: 'tour.compete_heading',
    bodyKey: 'tour.compete_body',
    screenshot: '/screenshots/leagues.png',
    altKey: 'tour.compete_alt',
  },
  {
    id: 'community',
    labelKey: 'tour.community_label',
    headingKey: 'tour.community_heading',
    bodyKey: 'tour.community_body',
    screenshot: '/screenshots/community.png',
    altKey: 'tour.community_alt',
  },
  {
    id: 'you',
    labelKey: 'tour.you_label',
    headingKey: 'tour.you_heading',
    bodyKey: 'tour.you_body',
    screenshot: '/screenshots/you.png',
    altKey: 'tour.you_alt',
  },
]

/* ── Desktop: pinned phone with scroll-sync ── */
function DesktopTour() {
  const { t } = useTranslation()
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
              alt={t(STOPS[activeIdx].altKey)}
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
              {t(stop.labelKey)}
            </span>
            <h3
              className="font-display text-[28px] font-extrabold text-navy leading-tight mb-3"
              style={{
                opacity: activeIdx === i ? 1 : 0.3,
                transition: reducedMotion ? 'none' : 'opacity 0.3s ease',
              }}
            >
              {t(stop.headingKey)}
            </h3>
            <p
              className="text-[15px] text-gray-500 leading-relaxed max-w-md"
              style={{
                opacity: activeIdx === i ? 1 : 0.3,
                transition: reducedMotion ? 'none' : 'opacity 0.3s ease',
              }}
            >
              {t(stop.bodyKey)}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Mobile: horizontal scroll-snap carousel ── */
function MobileTour() {
  const { t } = useTranslation()
  return (
    <div className="px-4">
      <div className="flex gap-5 overflow-x-auto snap-x snap-mandatory scrollbar-none pb-4 -mx-4 px-4">
        {STOPS.map((stop) => (
          <div
            key={stop.id}
            className="snap-center flex-shrink-0 w-[240px] flex flex-col items-center"
          >
            <IPhoneFrame src={stop.screenshot} alt={t(stop.altKey)} width={220} />
            <div className="mt-4 text-center">
              <span className="text-[11px] font-bold uppercase tracking-wider text-teal-600">
                {t(stop.labelKey)}
              </span>
              <h3 className="font-display text-[16px] font-bold text-navy mt-1">{t(stop.headingKey)}</h3>
              <p className="text-[12px] text-gray-500 leading-relaxed mt-1 px-2">{t(stop.bodyKey)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function FeatureTour() {
  const { t } = useTranslation()
  return (
    <section className="bg-cream py-16 sm:py-24">
      <div className="text-center mb-12 px-6">
        <p className="text-[13px] font-semibold text-teal-600 uppercase tracking-wider mb-2">
          {t('tour.section_tagline')}
        </p>
        <h2 className="font-display text-[26px] sm:text-[36px] font-extrabold text-navy">
          {t('tour.section_heading')}
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
