// Re-export Sentry for use in AuthContext, ErrorBoundary, etc.
// Init logic is in sentry-init.ts (loaded eagerly by main.tsx)
export * as Sentry from '@sentry/react'
