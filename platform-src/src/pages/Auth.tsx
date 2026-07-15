import { useState } from 'react'
import { supabase } from '../supabase'

export default function Auth() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signup')
  const [email, setEmail] = useState(() => {
    try { return localStorage.getItem('clewa-start-email') || '' } catch { return '' }
  })
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const fn = mode === 'signup'
      ? supabase.auth.signUp({ email, password })
      : supabase.auth.signInWithPassword({ email, password })
    const { error } = await fn
    if (error) { setError(error.message); setBusy(false); return }
    setBusy(false)
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <a className="auth-brand" href="../">Cle<em>w</em>a</a>
        <div className="card">
          <div className="eyebrow">{mode === 'signup' ? 'Start free' : 'Welcome back'}</div>
          <h1>{mode === 'signup' ? <>Your first order is <em style={{ color: 'var(--gold)' }}>on us.</em></> : 'Sign in'}</h1>
          <p className="sub">
            {mode === 'signup'
              ? 'One complete production order, every protection. No card.'
              : 'Pick up where you left off.'}
          </p>
          <form onSubmit={submit}>
            <div className="field">
              <label htmlFor="email">Work email</label>
              <input id="email" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@yourbrand.com" autoComplete="email" />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input id="password" type="password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
            </div>
            <button className="btn gold" type="submit" disabled={busy} style={{ width: '100%', justifyContent: 'center' }}>
              {busy ? 'One moment…' : mode === 'signup' ? 'Create your account →' : 'Sign in →'}
            </button>
            {error && <p className="err-note">{error}</p>}
          </form>
        </div>
        <p className="auth-switch">
          {mode === 'signup' ? (
            <>Already have an account? <a href="#" onClick={e => { e.preventDefault(); setMode('signin'); setError('') }}>Sign in</a></>
          ) : (
            <>New to Clewa? <a href="#" onClick={e => { e.preventDefault(); setMode('signup'); setError('') }}>Start free</a></>
          )}
        </p>
        <p className="auth-switch" style={{ marginTop: 6 }}>
          Run a factory? You don't need an account — the brand you work with sends you a link.
        </p>
      </div>
    </div>
  )
}
