import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { initSentry } from '@/lib/sentry'
import './index.css'
import './i18n'
import App from './App.tsx'
import { SentryErrorBoundary } from '@/components/shared/ErrorBoundary'

// Initialize Sentry before rendering — captures errors from first paint
initSentry()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SentryErrorBoundary>
      <App />
    </SentryErrorBoundary>
  </StrictMode>,
)
