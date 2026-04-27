import { Component, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { hasError: boolean; error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('[PPA ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-white flex flex-col items-center justify-center px-8 text-center">
          <div className="h-20 w-20 rounded-3xl bg-red-50 flex items-center justify-center mb-6">
            <span className="text-4xl">⚠️</span>
          </div>
          <h1 className="text-[22px] font-bold text-gray-900 mb-2">Something went wrong</h1>
          <p className="text-[14px] text-gray-500 mb-8 max-w-xs">
            The app encountered an unexpected error. Please refresh to continue.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="w-full max-w-xs rounded-2xl bg-[#009688] py-4 text-[15px] font-bold text-white"
          >
            Refresh App
          </button>
          {this.state.error && (
            <p className="mt-4 text-[11px] text-gray-300 max-w-xs break-all">
              {this.state.error.message}
            </p>
          )}
        </div>
      )
    }
    return this.props.children
  }
}
