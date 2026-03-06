import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: (error: Error, reset: () => void) => ReactNode
  onError?: (error: Error) => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack)
    this.props.onError?.(error)
  }

  private reset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.reset)
      }

      return (
        <div data-ui="error-boundary" className="border-destructive/30 bg-destructive/5 flex flex-col items-center justify-center rounded-lg border p-6 text-center">
          <p className="text-destructive mb-1 text-sm font-medium">Something went wrong</p>
          {import.meta.env.DEV && (
            <p className="text-muted-foreground mb-3 max-w-sm text-xs">{this.state.error.message}</p>
          )}
          <button
            onClick={this.reset}
            className="bg-primary text-primary-foreground hover:bg-primary/90 rounded px-3 py-1 text-xs"
          >
            Try Again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
