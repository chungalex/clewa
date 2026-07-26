import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../supabase'
import { toast } from '../toast'
import '../parity/settings.css'

const SITUATIONS = [
  { key: 'have_factory', label: 'I have a factory' },
  { key: 'in_talks', label: "I'm talking to factories" },
  { key: 'no_factory', label: 'No factory yet' },
]

export default function Settings({ session }: { session: Session }) {
  const [brandName, setBrandName] = useState('')
  const [situation, setSituation] = useState('')
  const [savedNote, setSavedNote] = useState('')
  const [pw, setPw] = useState('')
  const [pwNote, setPwNote] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase.from('profiles').select('brand_name, factory_situation').eq('id', session.user.id).single()
      .then(({ data }) => {
        setBrandName(data?.brand_name || '')
        setSituation(data?.factory_situation || '')
      })
  }, [session.user.id])

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    await supabase.from('profiles').update({
      brand_name: brandName.trim() || null,
      factory_situation: situation || null,
    }).eq('id', session.user.id)
    setBusy(false)
    toast('Saved')
    setSavedNote('Saved — your factories see the new name on shared orders.')
    setTimeout(() => setSavedNote(''), 3500)
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault()
    if (pw.length < 8) { setPwNote('At least 8 characters.'); return }
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pw })
    setBusy(false)
    setPw('')
    setPwNote(error ? error.message : 'Password changed.')
    setTimeout(() => setPwNote(''), 3500)
  }

  return (
    <section className="page on" data-page="settings">
      <div className="page-w">
        <div className="pg-bar">
          <div>
            <h2 className="pg-h">Settings</h2>
            <div className="pg-sub">Your workspace, your account, and how Clewa works.</div>
          </div>
        </div>

        <div className="ibx-card" style={{ maxWidth: 640 }}>
          <div className="ibx-head slim"><div>
            <div className="ibx-kick">Brand</div>
            <div className="ibx-sub">Shown to factories on shared orders and on exported POs.</div>
          </div></div>
          <form className="ibx-body" onSubmit={saveProfile}>
            <div className="field">
              <label>Brand name</label>
              <input value={brandName} onChange={e => setBrandName(e.target.value)} placeholder="What your factory knows you as" />
            </div>
            <div className="field">
              <label>Factory situation</label>
              <select value={situation} onChange={e => setSituation(e.target.value)}>
                <option value="">—</option>
                {SITUATIONS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
            <button className="hx-newbtn" type="submit" disabled={busy}>Save</button>
            {savedNote && <p className="ok-note">{savedNote}</p>}
          </form>
        </div>

        <div className="ibx-card" style={{ maxWidth: 640 }}>
          <div className="ibx-head slim"><div>
            <div className="ibx-kick">Interface</div>
            <div className="ibx-sub">How much coaching you want on screen — switch any time.</div>
          </div></div>
          <div className="ibx-body sit-grid">
          {[
            { key: 'guided', title: 'Guided', sub: 'Explanations stay visible on every page — why each step matters and what the factory needs. Right for your first orders.' },
            { key: 'pro', title: 'Pro', sub: 'Hides the coaching copy and checklists. The same product, quieter — for when the workflow is muscle memory.' },
          ].map(m => {
            let current = 'guided'
            try { current = localStorage.getItem('clewa-mode') || 'guided' } catch { /* private mode */ }
            return (
              <button type="button" key={m.key} className={`sit-card ${current === m.key ? 'on' : ''}`} onClick={() => {
                try { localStorage.setItem('clewa-mode', m.key) } catch { /* private mode */ }
                document.body.classList.toggle('pro-mode', m.key === 'pro')
                toast(m.key === 'pro' ? 'Pro mode — coaching hidden' : 'Guided mode — coaching visible')
                setSavedNote(' ')
                setTimeout(() => setSavedNote(''), 100)
              }}>
                <strong>{m.title}</strong>
                <span>{m.sub}</span>
              </button>
            )
          })}
          </div>
        </div>

        <div className="ibx-card" style={{ maxWidth: 640 }}>
          <div className="ibx-head slim"><div>
            <div className="ibx-kick">Integrations</div>
            <div className="ibx-sub">Shopify, email, files, accounting — see the full catalog with honest statuses.</div>
          </div></div>
          <div className="ibx-body">
            <a className="x-btn" href="#/integrations" style={{ textDecoration: 'none' }}>Open integrations →</a>
          </div>
        </div>

        <div className="ibx-card" style={{ maxWidth: 640 }}>
          <div className="ibx-head slim"><div>
            <div className="ibx-kick">Account</div>
            <div className="ibx-sub">Signed in as <strong>{session.user.email}</strong></div>
          </div></div>
          <div className="ibx-body">
            <form onSubmit={changePassword}>
              <div className="field">
                <label>New password</label>
                <input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="At least 8 characters" autoComplete="new-password" />
              </div>
              <button className="x-btn" type="submit" disabled={busy || !pw}>Change password</button>
              {pwNote && <p className={pwNote === 'Password changed.' ? 'ok-note' : 'err-note'}>{pwNote}</p>}
            </form>
            <p className="quiet" style={{ fontSize: 12, marginTop: 14 }}>
              Your data is yours: every order and record line exports from the Orders page (CSV), tech packs and POs export as PDF.
              To close your account entirely, email hello@clewa.io and we delete everything.
            </p>
          </div>
        </div>

        <div className="ibx-card" style={{ maxWidth: 760 }}>
          <div className="ibx-head slim"><div>
            <div className="ibx-kick">How Clewa works — the 60-second guide</div>
          </div></div>
          <div className="ibx-body">
        {[
          {
            t: 'The Record is the spine',
            d: 'Every order has a Record — specs, price, terms as dated lines. You sign by writing them; your factory countersigns from their link. A revision never edits history: the old line is preserved, the new one needs their signature again. If bulk arrives wrong, you have the receipts.',
          },
          {
            t: 'Factories never need an account',
            d: 'Each order has one invite link (Order → Your factory → Copy link). Send it by email or WhatsApp. They see the record, confirm lines, submit quotes and samples, report production progress, run QC and message you — from a phone, no signup. Revoke & regenerate kills a link instantly.',
          },
          {
            t: 'Messages live on the order',
            d: 'One thread per order, visible to both sides — no digging through email later. Set the factory\'s language on the invite and every message is auto-translated both ways: they read yours in their language, you read theirs in English, with "show original" always one click away. Originals are never altered.',
          },
          {
            t: 'Styles are where products begin',
            d: 'Describe an idea in Styles and the guided builder turns it into a factory-ready brief, telling you exactly what\'s missing before a factory can quote, sample, or produce. One click turns it into a sourcing request or an order with the Record pre-seeded.',
          },
          {
            t: 'Money never touches Clewa',
            d: 'You pay factories directly. Payment readiness on each order verifies the three conditions worth checking first: record dual-signed, sample approved, QC passed.',
          },
          {
            t: 'Intelligence cites its sources',
            d: 'The briefing (ship-date risk, QC disagreements, unconfirmed lines, price anomalies) is computed from your own data and links to the order behind every claim. Ask Clewa answers questions the same way — grounded in your data only.',
          },
        ].map((g, i) => (
          <div className="step" key={i}>
            <span className="step-dot">{i + 1}</span>
            <div>
              <strong>{g.t}</strong>
              <span>{g.d}</span>
            </div>
          </div>
        ))}
          </div>
        </div>
      </div>
    </section>
  )
}
