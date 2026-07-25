import { Component, ReactNode } from 'react'

/** A crash shows a branded recovery screen, never a white page. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="auth-wrap">
        <div className="auth-card">
          <span className="auth-brand">Cle<em>w</em>a</span>
          <div className="card">
            <div className="eyebrow">Something broke</div>
            <h1 style={{ fontSize: 26 }}>That wasn't supposed to happen.</h1>
            <p className="sub" style={{ marginTop: 8 }}>
              Your data is safe — this is a display error, nothing was lost. Reloading usually clears it.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn gold" onClick={() => location.reload()}>Reload</button>
              <a className="btn ghost" href="#/" onClick={() => setTimeout(() => location.reload(), 50)}>Back to Home</a>
            </div>
            <p className="quiet" style={{ fontSize: 11, marginTop: 14, wordBreak: 'break-all' }}>
              {String(this.state.error)}
            </p>
          </div>
        </div>
      </div>
    )
  }
}
