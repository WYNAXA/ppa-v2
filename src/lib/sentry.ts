import * as Sentry from '@sentry/react'

export function initSentry() {
  if (!import.meta.env.PROD) return

  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!dsn) return

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    enabled: import.meta.env.PROD,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0.1,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    release: import.meta.env.VITE_GIT_COMMIT_SHA || undefined,
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
      'Network request failed',
      'Failed to fetch',
      'Load failed',
      'AbortError',
    ],
    beforeSend(event) {
      // Strip all PII from user context — keep only user ID
      if (event.user) {
        event.user = { id: event.user.id }
      }
      return event
    },
  })
}

export { Sentry }
