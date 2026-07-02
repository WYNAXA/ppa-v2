import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState, lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { Toaster } from 'sonner'
import { AuthProvider } from '@/context/AuthContext'
import { useAuth } from '@/hooks/useAuth'
import { BottomNav } from '@/components/shared/BottomNav'
import { SplashScreen } from '@/components/shared/SplashScreen'
import { AuthPage } from '@/pages/Auth'
import ResetPasswordPage from '@/pages/ResetPassword'
import { OnboardingPage, isOnboardingComplete } from '@/pages/Onboarding'
import { PrivacyPolicyPage } from '@/pages/PrivacyPolicy'
import { TermsOfServicePage } from '@/pages/TermsOfService'
import { SupportPage } from '@/pages/Support'
import { LandingPage } from '@/pages/Landing'
import { FAQPage } from '@/pages/FAQ'
import { ContactPage } from '@/pages/Contact'

// v1.1.3 — force WKWebView cache refresh to drop stale debug banner

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
const BookingStatusPage = lazy(() => import('@/pages/BookingStatus').then(m => ({ default: m.BookingStatusPage })))
const VenueDetailPage = lazy(() => import('@/pages/VenueDetail').then(m => ({ default: m.VenueDetailPage })))
const TournamentModePage = lazy(() => import('@/pages/TournamentMode').then(m => ({ default: m.TournamentModePage })))
const LeagueDiscoveryPage = lazy(() => import('@/pages/LeagueDiscovery').then(m => ({ default: m.LeagueDiscoveryPage })))
const AllGroupsPage = lazy(() => import('@/pages/community/AllGroupsPage').then(m => ({ default: m.AllGroupsPage })))
const AllPlayersPage = lazy(() => import('@/pages/community/AllPlayersPage').then(m => ({ default: m.AllPlayersPage })))
const MyConnectionsPage = lazy(() => import('@/pages/community/MyConnectionsPage').then(m => ({ default: m.MyConnectionsPage })))
const OpenMatchesPage = lazy(() => import('@/pages/OpenMatches').then(m => ({ default: m.OpenMatchesPage })))


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
    if (['/onboarding', '/privacy', '/terms', '/support', '/faq', '/contact'].includes(location.pathname)) return
    if (location.pathname.startsWith('/auth')) return
    if (!isOnboardingComplete(profile)) {
      navigate('/onboarding', { replace: true })
    }
  }, [session, profile, loading, location.pathname, navigate])

  return <>{children}</>
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
  const navigate = useNavigate()

  // ── Native iOS push-notification-click relay ──────────────────────────────
  // The native wrapper (ppa-ios AppDelegate) dispatches a CustomEvent with the
  // raw APNs userInfo when the user taps a notification. OneSignal nests our
  // `data` payload under `custom.a` in the APNs dictionary.
  useEffect(() => {
    function handleNativePushClick(e: Event) {
      const detail = (e as CustomEvent).detail

      // Parse custom safely: may be a JSON string or an object (or absent).
      let navUrl: string | undefined
      try {
        const custom = typeof detail?.custom === 'string'
          ? JSON.parse(detail.custom)
          : detail?.custom
        navUrl =
          custom?.a?.nav_url ??        // OneSignal APNs: custom.a.nav_url
          detail?.data?.nav_url ??     // direct data (Android / future)
          detail?.nav_url              // flat fallback
      } catch {
        navUrl = detail?.data?.nav_url ?? detail?.nav_url
      }

      if (navUrl && typeof navUrl === 'string' && navUrl.startsWith('/')) {
        navigate(navUrl)
      } else {
        console.warn('[push-click] no usable nav_url, falling back to /notifications', detail)
        navigate('/notifications')
      }

      // Confirm to native that the click was handled — clears the pending buffer
      // so it won't replay again on the next webview-ready.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bridge = (window as any)?.webkit?.messageHandlers?.onesignal
      if (bridge) {
        try { bridge.postMessage({ type: 'push-click-handled' }) } catch { /* non-iOS */ }
      }
    }
    window.addEventListener('push-notification-click', handleNativePushClick)

    // Signal the native wrapper that JS is ready to receive push-click events.
    // On cold start the native side buffers the payload and replays it now.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handler = (window as any)?.webkit?.messageHandlers?.onesignal
    if (handler) {
      try { handler.postMessage({ type: 'webview-ready' }) } catch { /* non-iOS */ }
    }

    return () => window.removeEventListener('push-notification-click', handleNativePushClick)
  }, [navigate])

  if (loading) return <SplashScreen />

  const showNav = !!session && !NO_NAV_PREFIXES.some((p) => location.pathname.startsWith(p))

  return (
    <OnboardingGuard>
      <ScrollToTop />
      <TranslationBanner />
      <div className="flex h-full flex-col">
        <main className={`flex-1 overflow-y-auto${showNav ? ' pb-24' : ''}`}>
          <Suspense fallback={<SplashScreen />}>
          <Routes>
            {/* Root — app subdomain skips landing; marketing domains show it */}
            <Route path="/" element={
              window.location.hostname.startsWith('app.')
                ? <Navigate to={session ? '/home' : '/auth'} replace />
                : session ? <Navigate to="/home" replace /> : <LandingPage />
            } />

            {/* Auth */}
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/auth/reset" element={<ResetPasswordPage />} />

            {/* Public pages (no auth required) */}
            <Route path="/privacy" element={<PrivacyPolicyPage />} />
            <Route path="/terms" element={<TermsOfServicePage />} />
            <Route path="/support" element={<SupportPage />} />
            <Route path="/faq" element={<FAQPage />} />
            <Route path="/contact" element={<ContactPage />} />
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
            <Route path="/community/groups"      element={<Guard><AllGroupsPage /></Guard>} />
            <Route path="/community/players"     element={<Guard><AllPlayersPage /></Guard>} />
            <Route path="/community/connections"  element={<Guard><MyConnectionsPage /></Guard>} />
            <Route path="/community/groups/:id"  element={<Guard><GroupDetailPage /></Guard>} />
            <Route path="/community/events/:id"  element={<Guard><EventDetailPage /></Guard>} />
            <Route path="/you"       element={<Guard><YouPage /></Guard>} />

            {/* Open matches */}
            <Route path="/open-matches" element={<Guard><OpenMatchesPage /></Guard>} />

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

            {/* Booking status */}
            <Route path="/booking/:bookingId" element={<Guard><BookingStatusPage /></Guard>} />

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
          <Toaster position="top-center" toastOptions={{ style: { background: 'white', color: '#1f2937', border: '1px solid #e5e7eb', borderRadius: '0.75rem' } }} />
          <AppShell />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
// banner test Fri  8 May 2026 17:17:22 BST
