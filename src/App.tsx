import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/context/AuthContext'
import { useAuth } from '@/hooks/useAuth'
import { BottomNav } from '@/components/shared/BottomNav'
import { AuthPage } from '@/pages/Auth'
import { HomePage } from '@/pages/Home'
import { PlayPage } from '@/pages/Play'
import { CompetePage } from '@/pages/Compete'
import { CommunityPage } from '@/pages/Community'
import { GroupDetailPage } from '@/pages/GroupDetail'
import { YouPage } from '@/pages/You'
import { MatchDetailPage } from '@/pages/MatchDetail'
import { MatchesPage } from '@/pages/Matches'
import { AvailabilityPage } from '@/pages/Availability'
import { AvailabilityPollPage } from '@/pages/AvailabilityPoll'
import { CreatePollPage } from '@/pages/CreatePoll'
import { PlaceholderPage } from '@/pages/Placeholder'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
})

// Pages that don't show the bottom nav
const NO_NAV_PREFIXES = ['/auth']

function Guard({ children }: { children: React.ReactNode }) {
  const { session } = useAuth()
  return session ? <>{children}</> : <Navigate to="/auth" replace />
}

function AppShell() {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#009688] border-t-transparent" />
      </div>
    )
  }

  const showNav = !!session && !NO_NAV_PREFIXES.some((p) => location.pathname.startsWith(p))

  return (
    <div className="flex h-full flex-col">
      <main className={`flex-1 overflow-y-auto${showNav ? ' pb-24' : ''}`}>
        <Routes>
          {/* Root redirect */}
          <Route path="/" element={<Navigate to={session ? '/home' : '/auth'} replace />} />

          {/* Auth */}
          <Route path="/auth" element={<AuthPage />} />

          {/* Main tabs */}
          <Route path="/home"      element={<Guard><HomePage /></Guard>} />
          <Route path="/play"      element={<Guard><PlayPage /></Guard>} />
          <Route path="/compete"   element={<Guard><CompetePage /></Guard>} />
          <Route path="/community"              element={<Guard><CommunityPage /></Guard>} />
          <Route path="/community/groups/:id"  element={<Guard><GroupDetailPage /></Guard>} />
          <Route path="/you"       element={<Guard><YouPage /></Guard>} />

          {/* Matches */}
          <Route path="/matches"     element={<Guard><MatchesPage /></Guard>} />
          <Route path="/matches/:id" element={<Guard><MatchDetailPage /></Guard>} />

          {/* Play sub-routes — /create MUST come before /:pollId */}
          <Route path="/play/availability"         element={<Guard><AvailabilityPage /></Guard>} />
          <Route path="/play/availability/create"  element={<Guard><CreatePollPage /></Guard>} />
          <Route path="/play/availability/:pollId" element={<Guard><AvailabilityPollPage /></Guard>} />
          <Route path="/play/join"         element={<Guard><PlaceholderPage title="Join a Match" /></Guard>} />
          <Route path="/play/book-court"   element={<Guard><PlaceholderPage title="Book a Court" /></Guard>} />

          {/* Notifications placeholder */}
          <Route path="/notifications" element={<Guard><PlaceholderPage title="Notifications" /></Guard>} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to={session ? '/home' : '/auth'} replace />} />
        </Routes>
      </main>

      {showNav && <BottomNav />}
    </div>
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
