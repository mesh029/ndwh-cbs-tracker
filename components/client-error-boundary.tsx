"use client"

import { Component, type ErrorInfo, type ReactNode } from "react"

interface Props {
  children: ReactNode
  fallback?: ReactNode
  title?: string
}

interface State {
  hasError: boolean
}

export class ClientErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ClientErrorBoundary]", error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            <p className="font-medium text-foreground">{this.props.title || "This section failed to load."}</p>
            <p className="mt-1">Refresh the page or try again in a moment.</p>
          </div>
        )
      )
    }
    return this.props.children
  }
}
