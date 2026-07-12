import { Component, type ReactNode, type ErrorInfo } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-950 px-4">
          <div className="card max-w-md text-center">
            <div className="text-5xl mb-4">😵</div>
            <h2 className="text-lg font-semibold text-gray-100 mb-2">
              页面出错了
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              {this.state.error?.message || '未知错误'}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null })
                window.location.href = '/'
              }}
              className="btn-primary w-full"
            >
              返回首页
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
