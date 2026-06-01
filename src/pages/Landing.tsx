import { Link } from 'react-router-dom'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import {
  MapPin, Users, Trophy, Calendar, Star, Shield,
  Search, Zap, BarChart3, Heart, Globe, ChevronRight,
} from 'lucide-react'

function NavBar() {
  return (
    <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-gray-100">
      <div className="mx-auto max-w-6xl flex items-center justify-between px-5 py-3">
        <Link to="/" className="flex items-center gap-2.5">
          <img src="/PPA_Round_Logo_White_Background.png" alt="Padel Players" className="h-9 w-9 rounded-xl" />
          <span className="text-[16px] font-extrabold text-navy">Padel Players</span>
        </Link>
        <div className="hidden sm:flex items-center gap-6 text-[13px] font-medium text-gray-600">
          <a href="#features" className="hover:text-teal-600 transition-colors">Features</a>
          <Link to="/faq" className="hover:text-teal-600 transition-colors">FAQ</Link>
          <Link to="/contact" className="hover:text-teal-600 transition-colors">Contact</Link>
        </div>
        <Link
          to="/auth"
          className="rounded-xl bg-teal-500 px-4 py-2 text-[13px] font-semibold text-white hover:bg-teal-600 transition-colors"
        >
          Sign In
        </Link>
      </div>
    </nav>
  )
}

const FEATURES = [
  {
    icon: MapPin,
    title: 'Find Matches Near You',
    desc: 'Discover open matches in your area and join with one tap. Location-based match discovery makes it easy to play.',
  },
  {
    icon: Calendar,
    title: 'Create a Match in Seconds',
    desc: 'Set the time, venue, and number of players. Invite friends directly or broadcast to your network.',
  },
  {
    icon: Zap,
    title: 'Find My Game',
    desc: 'Share your availability and get auto-matched with compatible players. No more group chat coordination.',
  },
  {
    icon: Trophy,
    title: 'Leagues & Tournaments',
    desc: 'Create and run leagues with Round Robin or Mexicano formats. Live standings, seasons, and automated scheduling.',
  },
  {
    icon: BarChart3,
    title: 'ELO Rankings & Leaderboards',
    desc: 'Track your rating over time with a global ELO system. Earn badges, achievements, and streaks as you improve.',
  },
  {
    icon: Users,
    title: 'Community & Groups',
    desc: 'Find players, coaches, venues, and events. Create or join groups to organise your padel community.',
  },
  {
    icon: Heart,
    title: 'Household Linking',
    desc: 'Link a partner or family member to detect scheduling conflicts and coordinate your padel lives.',
  },
  {
    icon: Star,
    title: 'Player Profiles',
    desc: 'Showcase your stats, win rate, best streak, and favourite partner. Customise with avatar and banner images.',
  },
  {
    icon: Search,
    title: 'Book a Court',
    desc: 'Search for available courts at venues near you and book directly through the app.',
  },
  {
    icon: Shield,
    title: 'Safe & Respectful',
    desc: 'Built-in report and block tools keep the community welcoming. An account is required for all social features.',
  },
  {
    icon: Globe,
    title: 'iOS & Web',
    desc: 'Available as a native iOS app and a full-featured web app. Your data syncs seamlessly across devices.',
  },
] as const

function FeatureCard({ icon: Icon, title, desc }: { icon: typeof MapPin; title: string; desc: string }) {
  return (
    <div className="group rounded-2xl border border-gray-100 bg-white p-6 shadow-sm hover:shadow-md hover:border-teal-100 transition-all">
      <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-teal-50 text-teal-600 group-hover:bg-teal-500 group-hover:text-white transition-colors">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="text-[15px] font-bold text-navy mb-1.5">{title}</h3>
      <p className="text-[13px] text-gray-500 leading-relaxed">{desc}</p>
    </div>
  )
}

function PhoneMockup({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="relative mx-auto w-[220px] flex-shrink-0">
      <div className="rounded-[2rem] border-[6px] border-navy bg-navy p-1 shadow-xl">
        <div className="overflow-hidden rounded-[1.5rem] bg-gray-100">
          <img src={src} alt={alt} className="w-full object-cover aspect-[9/19.5]" loading="lazy" />
        </div>
      </div>
    </div>
  )
}

function Footer() {
  return (
    <footer className="border-t border-gray-100 bg-white">
      <div className="mx-auto max-w-6xl px-5 py-10">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2.5 mb-2">
              <img src="/PPA_Round_Logo_White_Background.png" alt="Padel Players" className="h-8 w-8 rounded-lg" />
              <span className="text-[15px] font-bold text-navy">Padel Players</span>
            </div>
            <p className="text-[12px] text-gray-400">Wynaxa Sports Tech Ltd (part of Wynaxa Limited)</p>
            <p className="text-[12px] text-gray-400">26 Fitzwilliam Square West, Dublin, D02 HX82, Ireland</p>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-[13px] font-medium text-gray-500">
            <Link to="/privacy" className="hover:text-teal-600 transition-colors">Privacy</Link>
            <Link to="/terms" className="hover:text-teal-600 transition-colors">Terms</Link>
            <Link to="/faq" className="hover:text-teal-600 transition-colors">FAQ</Link>
            <Link to="/contact" className="hover:text-teal-600 transition-colors">Contact</Link>
            <Link to="/support" className="hover:text-teal-600 transition-colors">Support</Link>
          </div>
        </div>
        <p className="mt-6 text-[11px] text-gray-300">&copy; {new Date().getFullYear()} Wynaxa Sports Tech Ltd. All rights reserved.</p>
      </div>
    </footer>
  )
}

/* ── Screenshots that ship in /public/screenshots/ ── */
const SCREENSHOTS = [
  { src: '/screenshots/home.png', alt: 'Home dashboard showing upcoming matches' },
  { src: '/screenshots/match.png', alt: 'Match detail view with players and scores' },
  { src: '/screenshots/leagues.png', alt: 'League standings and rankings' },
  { src: '/screenshots/community.png', alt: 'Community groups and player discovery' },
  { src: '/screenshots/you.png', alt: 'Player profile with stats and achievements' },
]

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

      {/* ── Hero ── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-white to-cream">
        <div className="mx-auto max-w-6xl px-5 pt-16 pb-20 sm:pt-24 sm:pb-28 text-center">
          <img
            src="/PPA_Round_Logo_White_Background.png"
            alt="Padel Players App"
            className="mx-auto mb-6 h-20 w-20 rounded-2xl shadow-md"
          />
          <h1 className="text-[32px] sm:text-[44px] font-extrabold leading-tight text-navy tracking-tight">
            Your Padel Community,<br className="hidden sm:block" /> All in One App
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-[15px] sm:text-[17px] text-gray-500 leading-relaxed">
            Find matches, run leagues, track your ELO, and connect with players near you.
            Free for everyone — built for the social padel player.
          </p>

          {/* CTAs */}
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-xl bg-gray-100 px-5 py-3 text-[14px] font-semibold text-gray-500">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
              </svg>
              Coming soon to the App Store
            </span>
            <a
              href="https://app.padelplayersapp.com"
              className="inline-flex items-center gap-2 rounded-xl bg-teal-500 px-5 py-3 text-[14px] font-semibold text-white hover:bg-teal-600 transition-colors shadow-sm"
            >
              Open the Web App
              <ChevronRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="bg-cream py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-5">
          <div className="text-center mb-12">
            <p className="text-[13px] font-semibold text-teal-600 uppercase tracking-wider mb-2">Everything you need</p>
            <h2 className="text-[26px] sm:text-[32px] font-extrabold text-navy">Built for Padel Players</h2>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <FeatureCard key={f.title} {...f} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Screenshots ── */}
      <section className="bg-white py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-5">
          <div className="text-center mb-12">
            <p className="text-[13px] font-semibold text-teal-600 uppercase tracking-wider mb-2">See it in action</p>
            <h2 className="text-[26px] sm:text-[32px] font-extrabold text-navy">Designed for Your Phone</h2>
          </div>
          <div className="flex gap-6 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide justify-center flex-wrap sm:flex-nowrap">
            {SCREENSHOTS.map((s) => (
              <div key={s.alt} className="snap-center">
                <PhoneMockup src={s.src} alt={s.alt} />
              </div>
            ))}
          </div>
          <p className="text-center text-[12px] text-gray-400 mt-6">
            Screenshots are illustrative. Actual app experience may vary.
          </p>
        </div>
      </section>

      {/* ── Bottom CTA ── */}
      <section className="bg-gradient-to-br from-deep-teal to-navy py-16 sm:py-20">
        <div className="mx-auto max-w-3xl px-5 text-center">
          <h2 className="text-[24px] sm:text-[32px] font-extrabold text-white mb-4">
            Ready to Play?
          </h2>
          <p className="text-[15px] text-teal-100 mb-8 max-w-lg mx-auto">
            Join a growing community of padel players. Create your free account in seconds.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <a
              href="https://app.padelplayersapp.com"
              className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-[14px] font-semibold text-navy hover:bg-gray-50 transition-colors shadow-sm"
            >
              Open the Web App
              <ChevronRight className="h-4 w-4" />
            </a>
            <Link
              to="/auth"
              className="inline-flex items-center gap-2 rounded-xl border border-white/30 px-6 py-3 text-[14px] font-semibold text-white hover:bg-white/10 transition-colors"
            >
              Create an Account
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
