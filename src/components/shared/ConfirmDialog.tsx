import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'

export interface ConfirmOptions {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  /** Renders the confirm button in a destructive (red) style. */
  destructive?: boolean
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

// Module-level handle so call sites in deeply-nested components can trigger the
// dialog without threading useConfirm() through every sub-component. Registered
// by the mounted ConfirmProvider. Falls back to window.confirm if unmounted.
let _confirm: ConfirmFn | null = null

/** Promise-based confirm usable anywhere (no hook needed). */
export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  if (_confirm) return _confirm(opts)
  return Promise.resolve(typeof window !== 'undefined' ? window.confirm(opts.title) : false)
}

/**
 * Promise-based replacement for window.confirm() that renders a styled in-app
 * modal (reliable in the iOS/Android WebView, consistent with the app's design).
 *
 *   const confirm = useConfirm()
 *   if (await confirm({ title: 'Delete league?', destructive: true })) { ... }
 */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used within <ConfirmProvider>')
  return ctx
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const [opts, setOpts] = useState<ConfirmOptions | null>(null)
  const resolverRef = useRef<((v: boolean) => void) | null>(null)

  const confirm = useCallback<ConfirmFn>((options) => {
    setOpts(options)
    return new Promise<boolean>((resolve) => { resolverRef.current = resolve })
  }, [])

  // Register/unregister the module-level handle used by confirmDialog().
  useEffect(() => {
    _confirm = confirm
    return () => { if (_confirm === confirm) _confirm = null }
  }, [confirm])

  const close = useCallback((result: boolean) => {
    resolverRef.current?.(result)
    resolverRef.current = null
    setOpts(null)
  }, [])

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AnimatePresence>
        {opts && (
          <motion.div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-6"
            style={{ background: 'rgba(0,0,0,0.45)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => close(false)}
          >
            <motion.div
              className="w-full max-w-xs rounded-2xl bg-white p-5 shadow-xl"
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 26 }}
              onClick={(e) => e.stopPropagation()}
              role="alertdialog"
              aria-modal="true"
            >
              <h2 className="text-[16px] font-bold text-gray-900">{opts.title}</h2>
              {opts.message && (
                <p className="mt-2 text-[13px] leading-relaxed text-gray-500">{opts.message}</p>
              )}
              <div className="mt-5 flex gap-2">
                <button
                  onClick={() => close(false)}
                  className="flex-1 rounded-xl border border-gray-200 py-2.5 text-[13px] font-semibold text-gray-600 active:bg-gray-50"
                >
                  {opts.cancelLabel ?? t('common.cancel')}
                </button>
                <button
                  onClick={() => close(true)}
                  className={`flex-1 rounded-xl py-2.5 text-[13px] font-bold text-white ${
                    opts.destructive ? 'bg-red-500 active:bg-red-600' : 'bg-[#009688] active:bg-[#00796b]'
                  }`}
                >
                  {opts.confirmLabel ?? t('common.confirm')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </ConfirmContext.Provider>
  )
}
