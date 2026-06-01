import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { ChevronRight, Award, Star, Trophy, Shield, Shirt, Search, Users, Swords, MapPin } from 'lucide-react'
import { IPhoneFrame } from '@/components/marketing/IPhoneFrame'
import { FeatureTour } from '@/components/marketing/FeatureTour'
import { RankingExplainer } from '@/components/marketing/RankingExplainer'
import { AtmosphereBand } from '@/components/marketing/AtmosphereBand'
import { useReducedMotion } from '@/components/marketing/useReducedMotion'
import { useInView } from '@/components/marketing/useInView'

/* ── Nav ── */
function NavBar() {
  return (
    <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-gray-100">
      <div className="mx-auto max-w-6xl flex items-center justify-between px-5 py-3">
        <Link to="/" className="flex items-center gap-2.5">
          <img
            src="/PPA_Round_Logo_White_Background.png"
            alt="Padel Players"
            width={36} height={36}
            className="h-9 w-9 rounded-xl"
          />
          <span className="font-display text-[16px] font-extrabold text-navy">Padel Players</span>
        </Link>
        <div className="hidden sm:flex items-center gap-6 text-[13px] font-medium text-gray-600">
          <a href="#features" className="mkt-link pb-0.5 hover:text-navy transition-colors">Features</a>
          <a href="#ranking" className="mkt-link pb-0.5 hover:text-navy transition-colors">Ranking</a>
          <Link to="/faq" className="mkt-link pb-0.5 hover:text-navy transition-colors">FAQ</Link>
          <Link to="/contact" className="mkt-link pb-0.5 hover:text-navy transition-colors">Contact</Link>
        </div>
        <Link
          to="/auth?mode=signup"
          className="mkt-btn rounded-xl bg-teal-500 px-4 py-2 text-[13px] font-semibold text-white hover:bg-teal-600 transition-colors"
        >
          Get Started
        </Link>
      </div>
    </nav>
  )
}

/* ── Hero ── */
function Hero() {
  const reducedMotion = useReducedMotion()

  return (
    <section className="relative overflow-hidden bg-navy">
      {/* Background photo — wide on desktop, portrait on mobile */}
      <picture>
        <source media="(min-width: 640px)" srcSet="/images/padel-hero-wide.webp" />
        <img
          src="/images/padel-hero.webp"
          alt="Padel players on court"
          loading="eager"
          width={1200} height={800}
          className="absolute inset-0 w-full h-full object-cover"
        />
      </picture>
      {/* Gradient for legibility */}
      <div className="absolute inset-0 bg-gradient-to-t from-navy via-navy/70 to-navy/40" />

      <div className="relative z-10 mx-auto max-w-6xl px-5 pt-20 pb-24 sm:pt-28 sm:pb-32">
        <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-16">
          {/* Text */}
          <div className="flex-1 text-center lg:text-left">
            <h1 className="font-display text-[34px] sm:text-[48px] font-extrabold leading-[1.1] text-white tracking-tight">
              Your Padel<br className="hidden sm:block" /> Community
            </h1>
            <p className="mt-4 text-[16px] sm:text-[18px] text-gray-300 leading-relaxed max-w-lg mx-auto lg:mx-0">
              Find matches, run leagues, track your ranking, and connect with players near you. Free for everyone.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center lg:items-start gap-3">
              <Link
                to="/auth?mode=signup"
                className="mkt-btn inline-flex items-center gap-2 rounded-xl bg-teal-500 px-6 py-3.5 text-[14px] font-semibold text-white hover:bg-teal-600 transition-colors shadow-lg shadow-teal-500/20"
              >
                Get Started — It's Free
                <ChevronRight className="h-4 w-4" />
              </Link>
              <span className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-5 py-3 text-[13px] font-medium text-white/70">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                </svg>
                iOS app coming soon
              </span>
            </div>
          </div>

          {/* Phone mockup — entrance animation */}
          <div
            className="flex-shrink-0"
            style={reducedMotion ? {} : {
              animation: 'phoneEntrance 0.8s cubic-bezier(0.22, 1, 0.36, 1) both',
            }}
          >
            <IPhoneFrame
              src="/screenshots/home.png"
              alt="Padel Players App — Home screen"
              width={280}
            />
          </div>
        </div>
      </div>

      {/* Keyframes for phone entrance */}
      <style>{`
        @keyframes phoneEntrance {
          from { opacity: 0; transform: perspective(800px) rotateY(8deg) translateY(24px); }
          to   { opacity: 1; transform: perspective(800px) rotateY(0deg) translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes phoneEntrance { from, to { opacity: 1; transform: none; } }
        }
      `}</style>
    </section>
  )
}

/* ── Vote category chips ── */
const VOTE_CHIPS = [
  { emoji: '🎾', label: 'Shot of the Match' },
  { emoji: '🪃', label: 'Best Recovery Shot' },
  { emoji: '🧠', label: 'Tactical Genius' },
  { emoji: '😂', label: 'Comedy Gold' },
  { emoji: '💪', label: 'Hustle Award' },
]

/* ── Feature showcase cards (social/competitive) ── */
function FeatureShowcase() {
  const reducedMotion = useReducedMotion()
  const [ref1, inView1] = useInView<HTMLDivElement>({ threshold: 0.15 })
  const [ref2, inView2] = useInView<HTMLDivElement>({ threshold: 0.15 })
  const [ref3, inView3] = useInView<HTMLDivElement>({ threshold: 0.15 })

  const enterStyle = (visible: boolean, delay = 0) => reducedMotion
    ? {}
    : {
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(16px)',
        transition: `opacity 0.5s ease ${delay}s, transform 0.5s ease ${delay}s`,
      }

  return (
    <section className="bg-cream py-16 sm:py-24" id="features">
      <div className="mx-auto max-w-6xl px-5">
        <div className="text-center mb-12">
          <p className="text-[13px] font-semibold text-teal-600 uppercase tracking-wider mb-2">Social + competitive</p>
          <h2 className="font-display text-[26px] sm:text-[36px] font-extrabold text-navy">More than just a scoreboard</h2>
        </div>

        {/* Peer voting — with category chips */}
        <div ref={ref1} style={enterStyle(inView1)} className="rounded-2xl border border-gray-100 bg-white p-6 sm:p-8 shadow-sm mb-8">
          <div className="flex flex-col sm:flex-row gap-6 sm:gap-10">
            <div className="flex-1">
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
                <Award className="h-5 w-5" />
              </div>
              <h3 className="text-[16px] font-bold text-navy mb-2">Post-match voting</h3>
              <p className="text-[13px] text-gray-500 leading-relaxed">
                After a match, every participant can vote for the standout players across five categories. Votes are tallied per match so you can see who came out on top.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 sm:max-w-[280px] items-start content-start">
              {VOTE_CHIPS.map((chip) => (
                <span
                  key={chip.label}
                  className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 border border-teal-100 px-3 py-1.5 text-[12px] font-medium text-teal-700"
                >
                  <span>{chip.emoji}</span>
                  {chip.label}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Badges + jerseys (roadmap) */}
        <div ref={ref2} style={enterStyle(inView2)} className="grid sm:grid-cols-2 gap-5 mb-8">
          <div className="mkt-card-hover rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
              <Star className="h-5 w-5" />
            </div>
            <h3 className="text-[15px] font-bold text-navy mb-1">Badges and achievements</h3>
            <p className="text-[13px] text-gray-500 leading-relaxed">
              Earn badges like First Victory, On Fire (3-win streak), Sharp Shooter (70%+ win rate), and Giant Slayer as you play. More vote-driven badges are on the roadmap.
            </p>
          </div>
          <div className="mkt-card-hover rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-gray-500">
              <Shirt className="h-5 w-5" />
            </div>
            <h3 className="text-[15px] font-bold text-navy mb-1">
              League jerseys
              <span className="ml-2 text-[10px] font-semibold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded-full uppercase">Coming soon</span>
            </h3>
            <p className="text-[13px] text-gray-500 leading-relaxed">
              Automated weekly jerseys for league standouts — League Leader, Giant Killer, Most Improved, and more. Currently available as manual admin awards.
            </p>
          </div>
        </div>

        {/* Safety + ranking */}
        <div ref={ref3} style={enterStyle(inView3)} className="grid sm:grid-cols-2 gap-5">
          <div className="mkt-card-hover rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
              <Shield className="h-5 w-5" />
            </div>
            <h3 className="text-[15px] font-bold text-navy mb-1">Safe and respectful</h3>
            <p className="text-[13px] text-gray-500 leading-relaxed">
              Built-in report and block tools keep the community welcoming. Match results go through a verification step — the opposing team confirms or disputes within 24 hours.
            </p>
          </div>
          <div className="mkt-card-hover rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
              <Trophy className="h-5 w-5" />
            </div>
            <h3 className="text-[15px] font-bold text-navy mb-1">Transparent ranking</h3>
            <p className="text-[13px] text-gray-500 leading-relaxed">
              Every rating change is explained — opponent strength, experience level, and score margin all factor in. Nothing is hidden.{' '}
              <a href="#ranking" className="text-teal-600 font-medium mkt-link pb-0.5">Try the calculator below.</a>
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ── Bottom CTA ── */
function BottomCTA() {
  return (
    <section className="bg-gradient-to-br from-deep-teal to-navy py-16 sm:py-20">
      <div className="mx-auto max-w-3xl px-5 text-center">
        <h2 className="font-display text-[24px] sm:text-[32px] font-extrabold text-white mb-4">
          Ready to play?
        </h2>
        <p className="text-[15px] text-teal-100 mb-8 max-w-lg mx-auto">
          Join a growing community of padel players. Create your free account in seconds.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <a
            href="https://app.padelplayersapp.com"
            className="mkt-btn inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-[14px] font-semibold text-navy hover:bg-gray-50 transition-colors shadow-sm"
          >
            Open the Web App
            <ChevronRight className="h-4 w-4" />
          </a>
          <Link
            to="/auth?mode=signup"
            className="mkt-btn inline-flex items-center gap-2 rounded-xl border border-white/30 px-6 py-3 text-[14px] font-semibold text-white hover:bg-white/10 transition-colors"
          >
            Create an Account
          </Link>
        </div>
      </div>
    </section>
  )
}

/* ── Footer ── */
function Footer() {
  return (
    <footer className="border-t border-gray-100 bg-white">
      <div className="mx-auto max-w-6xl px-5 py-10">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2.5 mb-2">
              <img src="/PPA_Round_Logo_White_Background.png" alt="Padel Players" width={32} height={32} className="h-8 w-8 rounded-lg" />
              <span className="font-display text-[15px] font-bold text-navy">Padel Players</span>
            </div>
            <p className="text-[12px] text-gray-400">Wynaxa Sports Tech Ltd (part of Wynaxa Limited)</p>
            <p className="text-[12px] text-gray-400">26 Fitzwilliam Square West, Dublin, D02 HX82, Ireland</p>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-[13px] font-medium text-gray-500">
            <Link to="/privacy" className="mkt-link pb-0.5 hover:text-teal-600 transition-colors">Privacy</Link>
            <Link to="/terms" className="mkt-link pb-0.5 hover:text-teal-600 transition-colors">Terms</Link>
            <Link to="/faq" className="mkt-link pb-0.5 hover:text-teal-600 transition-colors">FAQ</Link>
            <Link to="/contact" className="mkt-link pb-0.5 hover:text-teal-600 transition-colors">Contact</Link>
            <Link to="/support" className="mkt-link pb-0.5 hover:text-teal-600 transition-colors">Support</Link>
          </div>
        </div>
        <p className="mt-6 text-[11px] text-gray-300">&copy; {new Date().getFullYear()} Wynaxa Sports Tech Ltd. All rights reserved.</p>
      </div>
    </footer>
  )
}

/* ── Page ── */
export function LandingPage() {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-cream">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
      </div>
    )
  }

  if (session) return <Navigate to="/home" replace />

  return (
    <div className="min-h-full bg-cream">
      <NavBar />
      <Hero />
      <FeatureTour />

      {/* Atmosphere band — social substance */}
      <AtmosphereBand src="/images/padel-duo-overhead.webp" alt="Padel player overhead shot" gradientSide="left">
        <div className="max-w-lg">
          <p className="font-display text-[22px] sm:text-[28px] font-extrabold text-white leading-tight">
            Built for the social padel player
          </p>
          <p className="text-[14px] text-gray-300 mt-3 leading-relaxed mb-5">
            Whether you play once a week or every day, Padel Players keeps your game organised and your community connected.
          </p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            <div className="flex items-start gap-2.5">
              <Search className="h-4 w-4 text-teal-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-[13px] font-semibold text-white">Open matches</p>
                <p className="text-[11px] text-gray-400">Find and join games near you</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Users className="h-4 w-4 text-teal-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-[13px] font-semibold text-white">Groups &amp; ringers</p>
                <p className="text-[11px] text-gray-400">Organise your regular crew</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Swords className="h-4 w-4 text-teal-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-[13px] font-semibold text-white">Leagues</p>
                <p className="text-[11px] text-gray-400">Round Robin &amp; Mexicano formats</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <MapPin className="h-4 w-4 text-teal-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-[13px] font-semibold text-white">Community</p>
                <p className="text-[11px] text-gray-400">Players, coaches, venues, events</p>
              </div>
            </div>
          </div>
        </div>
      </AtmosphereBand>

      <FeatureShowcase />
      <RankingExplainer />

      {/* Atmosphere band before CTA */}
      <AtmosphereBand
        src="/images/padel-duo-net.webp"
        alt="Padel racket at the net"
        gradientSide="right"
        heightClass="h-[240px] sm:h-[300px]"
      />

      <BottomCTA />
      <Footer />
    </div>
  )
}
