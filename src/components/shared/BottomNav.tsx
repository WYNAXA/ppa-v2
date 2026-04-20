import { useNavigate, useLocation } from 'react-router-dom'
import { Home, Trophy, Users, User } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

// Custom padel racket SVG — no suitable lucide icon
function PadelRacketIcon({ className, strokeWidth = 1.8 }: { className?: string; strokeWidth?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="5" y="2" width="14" height="13" rx="7" />
      <line x1="12" y1="2.5" x2="12" y2="14.5" strokeWidth="1.2" />
      <line x1="5.5" y1="8" x2="18.5" y2="8" strokeWidth="1.2" />
      <line x1="12" y1="15" x2="12" y2="22" strokeWidth="2.5" />
      <line x1="10.5" y1="19.5" x2="13.5" y2="19.5" strokeWidth="1.2" />
    </svg>
  )
}

const ACTIVE = '#009688'
const ACTIVE_BG = 'rgba(0,150,136,0.09)'

const navItems = [
  {
    icon: Home,
    label: 'Home',
    path: '/home',
    activePaths: ['/home'],
  },
  {
    icon: PadelRacketIcon,
    label: 'Play',
    path: '/play',
    activePaths: ['/play', '/matches'],
  },
  {
    icon: Trophy,
    label: 'Compete',
    path: '/compete',
    activePaths: ['/compete', '/leagues'],
  },
  {
    icon: Users,
    label: 'Community',
    path: '/community',
    activePaths: ['/community', '/groups'],
  },
  {
    icon: User,
    label: 'You',
    path: '/you',
    activePaths: ['/you', '/profile'],
  },
]

export function BottomNav() {
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 flex justify-center px-4"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}
    >
      <motion.nav
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30, delay: 0.05 }}
        className="w-full max-w-sm bg-white/95 backdrop-blur-xl border border-gray-100 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.10)] px-2 py-2"
      >
        <div className="grid grid-cols-5 gap-1">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = item.activePaths.some(
              (p) => location.pathname === p || location.pathname.startsWith(p + '/')
            )

            return (
              <motion.button
                key={item.path}
                onClick={() => navigate(item.path)}
                whileTap={{ scale: 0.88 }}
                className={cn(
                  'relative flex flex-col items-center justify-center gap-0.5 py-2 px-1 rounded-xl transition-colors touch-manipulation',
                  isActive ? '' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                )}
                style={isActive ? { backgroundColor: ACTIVE_BG } : undefined}
                aria-label={item.label}
              >
                <Icon
                  className="h-5 w-5"
                  style={{ color: isActive ? ACTIVE : undefined }}
                  strokeWidth={isActive ? 2.5 : 1.8}
                />
                <span
                  className="text-[10px] font-medium leading-none"
                  style={{ color: isActive ? ACTIVE : undefined }}
                >
                  {item.label}
                </span>
              </motion.button>
            )
          })}
        </div>
      </motion.nav>
    </div>
  )
}
