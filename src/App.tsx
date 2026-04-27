import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, lazy, Suspense } from 'react'
import { AuthProvider } from '@/context/AuthContext'
import { useAuth } from '@/hooks/useAuth'
import { BottomNav } from '@/components/shared/BottomNav'
import { SplashScreen } from '@/components/shared/SplashScreen'
import { AuthPage } from '@/pages/Auth'
import { OnboardingPage, isOnboardingComplete } from '@/pages/Onboarding'
import { PrivacyPolicyPage } from '@/pages/PrivacyPolicy'
import { TermsOfServicePage } from '@/pages/TermsOfService'

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


const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
})

// Pages that don't show the bottom nav
const NO_NAV_PREFIXES = ['/auth', '/onboarding', '/search']

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

function AppShell() {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) return <SplashScreen />

  const showNav = !!session && !NO_NAV_PREFIXES.some((p) => location.pathname.startsWith(p))

  return (
    <OnboardingGuard>
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
            <Route path="/compete/leagues/create" element={<Guard><CompetePage /></Guard>} />
            <Route path="/compete/leagues/:id"    element={<Guard><LeagueDetailPage /></Guard>} />

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
