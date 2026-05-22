// Sentry must init FIRST — before any other module that might error
import { initSentry } from '@/lib/sentry-init'
initSentry()

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import './i18n'
import App from './App.tsx'
import { SentryErrorBoundary } from '@/components/shared/ErrorBoundary'

// ── Silent SW auto-update on navigation ──────────────────────────────────────

let pendingUpdate = false

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    pendingUpdate = true
  },
  onOfflineReady() {
    // First install — nothing to do
  },
})

// Auto-reload when a new service worker takes control
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload()
  })
}

// Poll for SW updates every 60 seconds so PWA users get new deploys quickly
setInterval(() => { updateSW(false) }, 60_000)

function applyPendingUpdate() {
  if (!pendingUpdate) return
  pendingUpdate = false
  window.location.reload()
}

// Apply update on history navigation (back/forward)
window.addEventListener('popstate', applyPendingUpdate)

// Patch pushState/replaceState so SPA navigations trigger the check
const origPushState = history.pushState.bind(history)
history.pushState = function (...args: Parameters<typeof history.pushState>) {
  const result = origPushState(...args)
  applyPendingUpdate()
  return result
}
const origReplaceState = history.replaceState.bind(history)
history.replaceState = function (...args: Parameters<typeof history.replaceState>) {
  const result = origReplaceState(...args)
  applyPendingUpdate()
  return result
}

// ── Stuck-build recovery ─────────────────────────────────────────────────────

async function checkVersionFloor() {
  try {
    const resp = await fetch('/version.json', { cache: 'no-store' })
    if (!resp.ok) return
    const { current } = await resp.json()
    // If version.json exists and our build doesn't match, force reload
    const runningScripts = document.querySelectorAll('script[src*="/assets/index-"]')
    if (runningScripts.length === 0) return
    const scriptSrc = (runningScripts[0] as HTMLScriptElement).src
    // Extract the hash from the script filename
    const match = scriptSrc.match(/index-([^.]+)\.js/)
    if (!match) return
    // Migrate from sessionStorage to localStorage (one-time)
    const ssVal = sessionStorage.getItem('ppa-build-version')
    if (ssVal) {
      if (!localStorage.getItem('ppa-build-version')) localStorage.setItem('ppa-build-version', ssVal)
      sessionStorage.removeItem('ppa-build-version')
    }
    // Store version in localStorage so it persists across tab closes.
    const storedVersion = localStorage.getItem('ppa-build-version')
    if (!storedVersion) {
      localStorage.setItem('ppa-build-version', current)
      return
    }
    if (storedVersion !== current) {
      localStorage.setItem('ppa-build-version', current)
      // Clear all caches to break out of stale SW
      if ('caches' in window) {
        const keys = await caches.keys()
        await Promise.all(keys.map(k => caches.delete(k)))
      }
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations()
        await Promise.all(regs.map(r => r.unregister()))
      }
      window.location.reload()
    }
  } catch {
    // Non-fatal — version check is best-effort
  }
}

// Run version check on every page load (fetches ~50 bytes).
// No PROD gate — the function handles missing version.json gracefully.
checkVersionFloor()

// ── Render ───────────────────────────────────────────────────────────────────

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SentryErrorBoundary>
      <App />
    </SentryErrorBoundary>
  </StrictMode>,
)
