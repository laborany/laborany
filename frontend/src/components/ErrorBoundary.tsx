/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         Error Boundary 组件                               ║
 * ║                                                                          ║
 * ║  捕获子组件的 JavaScript 错误，防止整个应用崩溃                               ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { Component, ReactNode, ErrorInfo } from 'react'
import { logClientError } from '../lib/client-logger'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           Error Boundary                                  │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] 捕获错误:', error)
    console.error('[ErrorBoundary] 组件栈:', info.componentStack)
    logClientError(
      'react_error_boundary',
      error.message || 'React render error',
      error,
      { componentStack: info.componentStack },
    )
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <div className="max-w-md w-full text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-destructive/10 flex items-center justify-center">
              <svg className="w-8 h-8 text-destructive" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">出错了</h2>
            <p className="text-muted-foreground mb-4">
              应用遇到了一个错误，请尝试刷新页面。
            </p>
            <div className="space-y-2">
              <button
                onClick={this.handleReset}
                className="btn-primary px-4 py-2 w-full"
              >
                重试
              </button>
              <button
                onClick={() => window.location.reload()}
                className="btn-ghost px-4 py-2 w-full"
              >
                刷新页面
              </button>
            </div>
            {this.state.error && (
              <details className="mt-4 text-left">
                <summary className="text-sm text-muted-foreground cursor-pointer">
                  错误详情
                </summary>
                <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-auto max-h-32">
                  {this.state.error.message}
                </pre>
              </details>
            )}
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
