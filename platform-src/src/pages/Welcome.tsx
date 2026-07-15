import { useState } from 'react'
import { supabase } from '../supabase'

const SITUATIONS = [
  {
    key: 'have_factory',
    title: 'I have a factory',
    sub: 'You’ll invite them onto your first order — they confirm your terms line by line, no account needed on their side.',
  },
  {
    key: 'in_talks',
    title: 'I’m talking to factories',
    sub: 'Put your specs on the record now. When you choose a factory, they see exactly what they’re agreeing to.',
  },
  {
    key: 'no_factory',
    title: 'No factory yet',
    sub: 'Start with the product itself — specs, quantities, target price. The record becomes your brief when you approach factories.',
  },
] as const

export default function Welcome({ userId, onDone }: { userId: string; onDone: (brandName: string) => void }) {
  const [brandName, setBrandName] = useState('')
  const [situation, setSituation] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!brandName.trim() || !situation) return
    setBusy(true)
    await supabase.from('profiles')
      .update({ brand_name: brandName.trim(), factory_situation: situation })
      .eq('id', userId)
    onDone(brandName.trim())
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card" style={{ maxWidth: 560 }}>
        <span className="auth-brand">Cle<em>w</em>a</span>
        <div className="card">
          <div className="eyebrow">Welcome — one minute of setup</div>
          <h1>First, who's producing?</h1>
          <p className="sub">
            Clewa is built around one idea: you write the terms, your factory confirms them,
            and everything both sides agree to goes on a dated record.
          </p>
          <form onSubmit={submit}>
            <div className="field">
              <label htmlFor="brand">Your brand's name</label>
              <input
                id="brand" autoFocus value={brandName}
                onChange={e => setBrandName(e.target.value)}
                placeholder="What your factory knows you as"
              />
              <p className="field-hint">This is the name your factory sees on shared orders.</p>
            </div>
            <div className="field">
              <label>Where are you with factories today?</label>
              <div className="sit-grid">
                {SITUATIONS.map(s => (
                  <button
                    type="button" key={s.key}
                    className={`sit-card ${situation === s.key ? 'on' : ''}`}
                    onClick={() => setSituation(s.key)}
                  >
                    <strong>{s.title}</strong>
                    <span>{s.sub}</span>
                  </button>
                ))}
              </div>
            </div>
            <button
              className="btn gold" type="submit"
              disabled={busy || !brandName.trim() || !situation}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              {busy ? 'One moment…' : 'Set up my workspace →'}
            </button>
          </form>
        </div>
        <p className="auth-switch">
          Run a factory? You don't need an account — the brand you work with sends you a link.
        </p>
      </div>
    </div>
  )
}
