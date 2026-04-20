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
import { YouPage } from '@/pages/You'
import { MatchDetailPage } from '@/pages/MatchDetail'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})

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

  const showNav = !!session && !location.pathname.startsWith('/auth')

  return (
    <div className="flex h-full flex-col">
      <main className={`flex-1 overflow-y-auto${showNav ? ' pb-24' : ''}`}>
        <Routes>
          <Route path="/" element={<Navigate to={session ? '/home' : '/auth'} replace />} />
          <Route path="/auth" element={<AuthPage />} />

          <Route path="/home"        element={session ? <HomePage />        : <Navigate to="/auth" replace />} />
          <Route path="/play"        element={session ? <PlayPage />        : <Navigate to="/auth" replace />} />
          <Route path="/matches"     element={session ? <PlayPage />        : <Navigate to="/auth" replace />} />
          <Route path="/matches/:id" element={session ? <MatchDetailPage /> : <Navigate to="/auth" replace />} />
          <Route path="/compete"     element={session ? <CompetePage />     : <Navigate to="/auth" replace />} />
          <Route path="/community"   element={session ? <CommunityPage />   : <Navigate to="/auth" replace />} />
          <Route path="/you"         element={session ? <YouPage />         : <Navigate to="/auth" replace />} />

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
