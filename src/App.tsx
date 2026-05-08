import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState, lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { AuthProvider } from '@/context/AuthContext'
import { useAuth } from '@/hooks/useAuth'
import { BottomNav } from '@/components/shared/BottomNav'
import { SplashScreen } from '@/components/shared/SplashScreen'
import { AuthPage } from '@/pages/Auth'
import { OnboardingPage, isOnboardingComplete } from '@/pages/Onboarding'
import { PrivacyPolicyPage } from '@/pages/PrivacyPolicy'
import { TermsOfServicePage } from '@/pages/TermsOfService'

// v1.0.9 — bump this comment to force service worker cache invalidation

const HomePage = lazy(() => import('@/pages/Home').then(m => ({ default: m.HomePage })))
const PlayPage = lazy(() => import('@/pages/Play').then(m => ({ default: m.PlayPage })))
const CompetePage = lazy(() => import('@/pages/Compete').then(m => ({ default: m.CompetePage })))
const CommunityPage = lazy(() => import('@/pages/Community').then(m => ({ default: m.CommunityPage })))
const GroupDetailPage = lazy(() => import('@/pages/GroupDetail').then(m => ({ default: m.GroupDetailPage })))
const EventDetailPage = lazy(() => import('@/pages/EventDetail').then(m => ({ default: m.EventDetailPage })))
const YouPage = lazy(() => import('@/pages/You').then(m => ({ default: m.YouPage })))
const MatchDetailPage = lazy(() => import('@/pages/MatchDetail').then(m => ({ default: m.MatchDetailPage })))
const LeagueDetailPage = lazy(() => import('@/pages/LeagueDetail').then(m => ({ default: m.LeagueDetailPage })))
const MatchesPage = lazy(() => import('@/pages/Matches').then(m => ({ default: m.MatchesPage })))
const AvailabilityPage = lazy(() => import('@/pages/Availability').then(m => ({ default: m.AvailabilityPage })))
const AvailabilityPollPage = lazy(() => import('@/pages/AvailabilityPoll').then(m => ({ default: m.AvailabilityPollPage })))
const CreatePollPage = lazy(() => import('@/pages/CreatePoll').then(m => ({ default: m.CreatePollPage })))
const BookCourtPage = lazy(() => import('@/pages/BookCourt').then(m => ({ default: m.BookCourtPage })))
const NotificationsPage = lazy(() => import('@/pages/Notifications').then(m => ({ default: m.NotificationsPage })))
const SearchPage = lazy(() => import('@/pages/Search').then(m => ({ default: m.SearchPage })))
const PlayerProfilePage = lazy(() => import('@/pages/PlayerProfile').then(m => ({ default: m.PlayerProfilePage })))
const PayBookingPage = lazy(() => import('@/pages/PayBooking').then(m => ({ default: m.PayBookingPage })))
const VenueDetailPage = lazy(() => import('@/pages/VenueDetail').then(m => ({ default: m.VenueDetailPage })))
const TournamentModePage = lazy(() => import('@/pages/TournamentMode').then(m => ({ default: m.TournamentModePage })))
const LeagueDiscoveryPage = lazy(() => import('@/pages/LeagueDiscovery').then(m => ({ default: m.LeagueDiscoveryPage })))


const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
})

// Pages that don't show the bottom nav
const NO_NAV_PREFIXES = ['/auth', '/onboarding', '/search', '/pay']

function Guard({ children }: { children: React.ReactNode }) {
  const { session } = useAuth()
  return session ? <>{children}</> : <Navigate to="/auth" replace />
}

function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const { session, profile, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    if (loading) return
    if (!session || !profile) return
    if (location.pathname === '/onboarding') return
    if (!isOnboardingComplete()) {
      // Check if profile looks incomplete
      const name = profile.name ?? ''
      const isNameDefault = !name || name === 'Player' || name === profile.email?.split('@')[0]
      if (isNameDefault) {
        navigate('/onboarding', { replace: true })
      }
    }
  }, [session, profile, loading, location.pathname, navigate])

  return <>{children}</>
}

function UpdateBanner() {
  const [showUpdate, setShowUpdate] = useState(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    // Check for updates every 60 seconds + on tab focus
    const checkForUpdates = async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration()
        reg?.update().catch(() => {})
      } catch { /* ignore */ }
    }
    const interval = setInterval(checkForUpdates, 60_000)
    const handleFocus = () => checkForUpdates()
    window.addEventListener('focus', handleFocus)

    navigator.serviceWorker.ready.then((reg) => {
      // Already waiting SW
      if (reg.waiting) setShowUpdate(true)

      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing
        if (!newWorker) return
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            setShowUpdate(true)
          }
        })
      })
    })

    // Auto-reload when new SW activates
    let refreshing = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) { refreshing = true; window.location.reload() }
    })

    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', handleFocus)
    }
  }, [])

  if (!showUpdate) return null

  const handleUpdate = () => {
    setShowUpdate(false)
    navigator.serviceWorker.ready.then(reg => {
      reg.waiting?.postMessage({ type: 'SKIP_WAITING' })
    })
    // Fallback reload after 1 second
    setTimeout(() => window.location.reload(), 1000)
  }

  return (
    <div style={{
      position: 'fixed', bottom: 90, left: 16, right: 16,
      background: '#009688', color: 'white',
      borderRadius: 16, padding: '14px 16px', zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 20 }}>🚀</span>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>New version available</div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>Tap to get the latest updates</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={handleUpdate}
          style={{
            background: 'white', color: '#009688', border: 'none',
            borderRadius: 20, padding: '6px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer',
          }}
        >
          Update
        </button>
        <button
          onClick={() => setShowUpdate(false)}
          style={{
            background: 'none', border: 'none', color: 'white',
            fontSize: 20, cursor: 'pointer', padding: '0 4px', opacity: 0.8,
          }}
        >
          ✕
        </button>
      </div>
    </div>
  )
}

function TranslationBanner() {
  const { i18n } = useTranslation()
  const [dismissed, setDismissed] = useState(false)
  if (i18n.language === 'en' || dismissed) return null
  return (
    <div style={{
      position: 'fixed', bottom: 'calc(80px + env(safe-area-inset-bottom))', left: 12, right: 12,
      background: 'rgba(0,0,0,0.75)', color: 'white', borderRadius: 12,
      padding: '10px 14px', zIndex: 9990,
      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
    }}>
      <span style={{ fontSize: 12 }}>Some text may still appear in English while translation is in progress.</span>
      <button onClick={() => setDismissed(true)} style={{
        background: 'none', border: 'none', color: 'white', fontSize: 16, cursor: 'pointer', flexShrink: 0,
      }}>×</button>
    </div>
  )
}

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
    const main = document.querySelector('main')
    if (main) main.scrollTop = 0
  }, [pathname])
  return null
}

function AppShell() {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) return <SplashScreen />

  const showNav = !!session && !NO_NAV_PREFIXES.some((p) => location.pathname.startsWith(p))

  return (
    <OnboardingGuard>
      <ScrollToTop />
      <UpdateBanner />
      <TranslationBanner />
      <div className="flex h-full flex-col">
        <main className={`flex-1 overflow-y-auto${showNav ? ' pb-24' : ''}`}>
          <Suspense fallback={<SplashScreen />}>
          <Routes>
            {/* Root redirect */}
            <Route path="/" element={<Navigate to={session ? '/home' : '/auth'} replace />} />

            {/* Auth */}
            <Route path="/auth" element={<AuthPage />} />

            {/* Public pages (no auth required) */}
            <Route path="/privacy" element={<PrivacyPolicyPage />} />
            <Route path="/terms" element={<TermsOfServicePage />} />
            <Route path="/pay/booking/:bookingId/player/:playerId" element={<PayBookingPage />} />

            {/* Onboarding */}
            <Route path="/onboarding" element={<Guard><OnboardingPage /></Guard>} />

            {/* Global search overlay */}
            <Route path="/search" element={<Guard><SearchPage /></Guard>} />

            {/* Main tabs */}
            <Route path="/home"      element={<Guard><HomePage /></Guard>} />
            <Route path="/play"      element={<Guard><PlayPage /></Guard>} />
            <Route path="/compete"   element={<Guard><CompetePage /></Guard>} />
            <Route path="/community"             element={<Guard><CommunityPage /></Guard>} />
            <Route path="/community/groups/:id"  element={<Guard><GroupDetailPage /></Guard>} />
            <Route path="/community/events/:id"  element={<Guard><EventDetailPage /></Guard>} />
            <Route path="/you"       element={<Guard><YouPage /></Guard>} />

            {/* Matches */}
            <Route path="/matches"     element={<Guard><MatchesPage /></Guard>} />
            <Route path="/matches/:id" element={<Guard><MatchDetailPage /></Guard>} />

            {/* Play sub-routes — /create MUST come before /:pollId */}
            <Route path="/play/availability"         element={<Guard><AvailabilityPage /></Guard>} />
            <Route path="/play/availability/create"  element={<Guard><CreatePollPage /></Guard>} />
            <Route path="/play/availability/:pollId" element={<Guard><AvailabilityPollPage /></Guard>} />
            <Route path="/play/book-court"           element={<Guard><BookCourtPage /></Guard>} />

            {/* Compete sub-routes */}
            <Route path="/leagues" element={<Guard><LeagueDiscoveryPage /></Guard>} />
            <Route path="/compete/leagues/create" element={<Guard><CompetePage /></Guard>} />
            <Route path="/compete/leagues/:id"    element={<Guard><LeagueDetailPage /></Guard>} />
            <Route path="/compete/leagues/:id/tournament" element={<Guard><TournamentModePage /></Guard>} />

            {/* Player profiles */}
            <Route path="/players/:playerId" element={<Guard><PlayerProfilePage /></Guard>} />

            {/* Venue detail */}
            <Route path="/venues/:venueId" element={<Guard><VenueDetailPage /></Guard>} />

            {/* Notifications */}
            <Route path="/notifications" element={<Guard><NotificationsPage /></Guard>} />

            {/* Fallback */}
            <Route path="*" element={<Navigate to={session ? '/home' : '/auth'} replace />} />
          </Routes>
          </Suspense>
        </main>

        {showNav && <BottomNav />}
      </div>
    </OnboardingGuard>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <AppShell />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
