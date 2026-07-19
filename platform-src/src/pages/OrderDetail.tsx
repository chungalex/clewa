import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase, Order, RecordLine, STAGES, STAGE_LABELS } from '../supabase'
import Messages from '../Messages'
import Samples from '../Samples'
import Qc, { QcCheck } from '../Qc'
import Quotes from '../Quotes'
import Documents from '../Documents'

type Invite = {
  id: string
  token: string
  accepted_at: string | null
  accepted_by_name: string | null
  language: string | null
}

const FACTORY_LANGUAGES = [
  'Portuguese', 'Vietnamese', 'Chinese (Simplified)', 'Turkish', 'Italian',
  'Spanish', 'Hindi', 'Bengali', 'Urdu', 'Indonesian', 'Thai', 'Korean', 'Japanese',
]

export default function OrderDetail() {
  const { id } = useParams()
  const [order, setOrder] = useState<Order | null>(null)
  const [lines, setLines] = useState<RecordLine[]>([])
  const [invite, setInvite] = useState<Invite | null>(null)
  const [sampleStates, setSampleStates] = useState<string[]>([])
  const [qcChecks, setQcChecks] = useState<QcCheck[]>([])
  const [brandName, setBrandName] = useState('')
  const [newLine, setNewLine] = useState('')
  const [newCat, setNewCat] = useState<'spec' | 'price' | 'terms'>('spec')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [reviseId, setReviseId] = useState<string | null>(null)
  const [reviseText, setReviseText] = useState('')
  const [showHistory, setShowHistory] = useState(false)

  async function load() {
    const [{ data: o }, { data: l }, { data: inv }, { data: smp }, { data: qc }] = await Promise.all([
      supabase.from('orders').select('*').eq('id', id).single(),
      supabase.from('record_lines').select('*').eq('order_id', id).order('created_at'),
      supabase.from('order_invites').select('id, token, accepted_at, accepted_by_name, language')
        .eq('order_id', id).is('revoked_at', null).limit(1).maybeSingle(),
      supabase.from('samples').select('status').eq('order_id', id),
      supabase.from('qc_checks').select('*').eq('order_id', id),
    ])
    setOrder(o as Order)
    setLines((l as RecordLine[]) || [])
    setInvite(inv as Invite | null)
    setSampleStates(((smp as { status: string }[]) || []).map(x => x.status))
    setQcChecks((qc as QcCheck[]) || [])
  }

  useEffect(() => { load() }, [id])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return
      supabase.from('profiles').select('brand_name').eq('id', data.user.id).single()
        .then(({ data: p }) => setBrandName(p?.brand_name || ''))
    })
  }, [])

  // Keep the record live: refresh on focus and poll quietly while the
  // page is open, so factory confirmations appear without a reload.
  useEffect(() => {
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    const tick = setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, 8000)
    return () => {
      window.removeEventListener('focus', onFocus)
      clearInterval(tick)
    }
  }, [id])

  async function createInvite() {
    if (!order) return
    const { data } = await supabase
      .from('order_invites')
      .insert({ order_id: order.id, owner: order.owner })
      .select('id, token, accepted_at, accepted_by_name, language')
      .single()
    setInvite(data as Invite)
  }

  async function revokeInvite() {
    if (!order || !invite) return
    await supabase.from('order_invites')
      .update({ revoked_at: new Date().toISOString() }).eq('id', invite.id)
    setInvite(null)
    await createInvite()
  }

  async function setInviteLanguage(lang: string) {
    if (!invite) return
    const language = lang || null
    await supabase.from('order_invites').update({ language }).eq('id', invite.id)
    setInvite({ ...invite, language })
  }

  function inviteUrl(i: Invite) {
    const base = location.href.split('#')[0]
    return `${base}#/f/${i.token}`
  }

  async function copyInvite() {
    if (!invite) return
    try {
      await navigator.clipboard.writeText(inviteUrl(invite))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard blocked — the link is visible to copy manually */ }
  }

  async function addLine(e: React.FormEvent) {
    e.preventDefault()
    if (!newLine.trim() || !order) return
    setBusy(true)
    await supabase.from('record_lines').insert({
      order_id: order.id,
      owner: order.owner,
      category: newCat,
      content: newLine.trim(),
      brand_signed_at: new Date().toISOString(),
    })
    setNewLine('')
    setBusy(false)
    load()
  }

  // Revising a line never edits history: the old line is preserved and marked
  // superseded; the new version starts brand-signed, awaiting the factory again.
  async function reviseLine(old: RecordLine) {
    if (!order || !reviseText.trim()) return
    setBusy(true)
    const { data: fresh } = await supabase.from('record_lines').insert({
      order_id: order.id,
      owner: order.owner,
      category: old.category,
      content: reviseText.trim(),
      brand_signed_at: new Date().toISOString(),
    }).select('id').single()
    if (fresh) {
      await supabase.from('record_lines').update({ superseded_by: fresh.id }).eq('id', old.id)
    }
    setReviseId(null)
    setReviseText('')
    setBusy(false)
    load()
  }

  async function setStage(stage: Order['stage']) {
    if (!order) return
    await supabase.from('orders').update({ stage }).eq('id', order.id)
    load()
  }

  if (!order) return null
  const stageIdx = STAGES.indexOf(order.stage)
  const activeLines = lines.filter(l => !l.superseded_by)
  const supersededLines = lines.filter(l => l.superseded_by)

  return (
    <>
      <div className="main-head">
        <div>
          <Link to="/" style={{ fontSize: 12, color: 'var(--ink-3)' }}>← Orders</Link>
          <h1 style={{ marginTop: 4 }}>{order.name}</h1>
          <div style={{ color: 'var(--ink-3)', fontSize: 13, marginTop: 2 }}>
            {order.quantity ? `${order.quantity.toLocaleString()} units` : 'Quantity TBD'}
            {order.factory_name ? ` · ${order.factory_name}` : ''}
            {order.factory_country ? `, ${order.factory_country}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="btn ghost small no-print" onClick={() => window.print()}>Export PO (PDF)</button>
          <span className={`stage-pill ${order.stage}`}>{STAGE_LABELS[order.stage]}</span>
        </div>
      </div>

      {(() => {
        const hasLines = activeLines.length > 0
        const hasInvite = !!invite
        const allConfirmed = hasLines && activeLines.every(l => l.factory_signed_at)
        if (allConfirmed && hasInvite) return null
        const steps = [
          { done: hasLines, title: 'Put your agreement on the Record', sub: 'Specs, price, terms — you write them below, dated and signed by you.' },
          { done: hasInvite, title: 'Invite your factory', sub: "One link, no account needed on their side. They can't edit your terms — only confirm them." },
          { done: allConfirmed, title: 'They confirm, line by line', sub: 'Each confirmation is a dated countersignature. When every line is signed by both sides, you have the agreement of record.' },
        ]
        return (
          <div className="card steps-card">
            <div className="eyebrow">How this works</div>
            {steps.map((s, i) => (
              <div className={`step ${s.done ? 'done' : ''}`} key={i}>
                <span className="step-dot">{s.done ? '✓' : i + 1}</span>
                <div>
                  <strong>{s.title}</strong>
                  <span>{s.sub}</span>
                </div>
              </div>
            ))}
          </div>
        )
      })()}

      <div className="section-label">Stage</div>
      <div className="card" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {STAGES.map((s, i) => (
          <button
            key={s}
            className={`btn small ${i === stageIdx ? 'primary' : 'ghost'}`}
            onClick={() => setStage(s)}
          >
            {STAGE_LABELS[s]}
          </button>
        ))}
      </div>

      <div className="section-label">Your factory</div>
      <div className="card">
        {!invite && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <p style={{ color: 'var(--ink-3)', fontSize: 13.5, margin: 0, flex: 1, minWidth: 220 }}>
              Invite {order.factory_name || 'your factory'} onto this order. One link, no account needed on their side — they see the record and confirm it line by line.
              {' '}No factory yet? <a href="../sourcing-apply.html">Clewa Sourcing finds one for you →</a>
            </p>
            <button className="btn primary small" onClick={createInvite}>Create invite link</button>
          </div>
        )}
        {invite && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <code style={{ flex: 1, minWidth: 240, fontSize: 12, padding: '9px 12px', background: 'var(--paper-2)', border: '1px solid var(--hair)', borderRadius: 9, overflowX: 'auto', whiteSpace: 'nowrap' }}>{inviteUrl(invite)}</code>
              <button className="btn primary small" onClick={copyInvite}>{copied ? 'Copied ✓' : 'Copy link'}</button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
              <label style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>Their language:</label>
              <select
                value={invite.language || ''}
                onChange={e => setInviteLanguage(e.target.value)}
                style={{ padding: '6px 9px', border: '1px solid var(--hair-2)', borderRadius: 8, background: 'var(--paper)', fontSize: 12.5 }}
              >
                <option value="">English (no translation)</option>
                {FACTORY_LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
              <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Messages translate both ways once set.</span>
              <button
                className="btn ghost small" style={{ marginLeft: 'auto' }}
                onClick={revokeInvite}
                title="The old link stops working immediately; a fresh one is created"
              >
                Revoke & regenerate
              </button>
            </div>
            <p style={{ color: 'var(--ink-3)', fontSize: 12.5, marginTop: 10, marginBottom: 0 }}>
              {invite.accepted_at
                ? <>Opened by <strong>{invite.accepted_by_name || 'the factory'}</strong> · confirmations land on the record below as they happen</>
                : 'Not opened yet — send it to your factory contact by email or WhatsApp.'}
            </p>
          </>
        )}
      </div>

      <div className="section-label">Quotes</div>
      <div className="card">
        <p style={{ color: 'var(--ink-3)', fontSize: 12.5, marginBottom: 12 }}>
          The negotiation, kept. Accepting a quote writes the price to the record and updates this order.
        </p>
        <Quotes mode="brand" orderId={order.id} owner={order.owner} onAccepted={load} />
      </div>

      <div className="section-label">The Record</div>
      <div className="card">
        {activeLines.length === 0 && (
          <p style={{ color: 'var(--ink-3)', paddingBottom: 12 }}>
            Nothing on the record yet. Every spec, price and term you add here is dated and signed — if the bulk arrives wrong, it's not a he-said-she-said.
          </p>
        )}
        {activeLines.map(l => (
          <div className="rec-line" key={l.id}>
            <span className="rec-cat">{l.category}</span>
            {reviseId === l.id ? (
              <span className="rec-content" style={{ display: 'flex', gap: 8 }}>
                <input
                  value={reviseText}
                  onChange={e => setReviseText(e.target.value)}
                  autoFocus
                  style={{ flex: 1, padding: '7px 10px', border: '1px solid var(--hair-2)', borderRadius: 8 }}
                />
                <button className="btn primary small" disabled={busy || !reviseText.trim()} onClick={() => reviseLine(l)}>Publish revision</button>
                <button className="btn ghost small" onClick={() => { setReviseId(null); setReviseText('') }}>Cancel</button>
              </span>
            ) : (
              <span className="rec-content">{l.content}</span>
            )}
            {reviseId !== l.id && (
              <span className={`rec-sign ${l.factory_signed_at ? '' : 'pending'}`}>
                {l.factory_signed_at ? '✓ both signed' : `you signed ${l.brand_signed_at?.slice(0, 10)} · awaiting factory`}
                {' · '}
                <a href="#" onClick={e => { e.preventDefault(); setReviseId(l.id); setReviseText(l.content) }}>revise</a>
              </span>
            )}
          </div>
        ))}
        {supersededLines.length > 0 && (
          <p style={{ fontSize: 12.5, marginTop: 10 }}>
            <a href="#" onClick={e => { e.preventDefault(); setShowHistory(!showHistory) }}>
              {showHistory ? 'Hide' : 'Show'} change history ({supersededLines.length} superseded line{supersededLines.length === 1 ? '' : 's'})
            </a>
          </p>
        )}
        {showHistory && supersededLines.map(l => (
          <div className="rec-line superseded" key={l.id}>
            <span className="rec-cat">{l.category}</span>
            <span className="rec-content">{l.content}</span>
            <span className="rec-sign">superseded · was {l.factory_signed_at ? 'both-signed' : 'brand-signed'}</span>
          </div>
        ))}
        <form onSubmit={addLine} style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <select value={newCat} onChange={e => setNewCat(e.target.value as any)} style={{ padding: '9px 10px', border: '1px solid var(--hair-2)', borderRadius: 9, background: 'var(--paper)' }}>
            <option value="spec">Spec</option>
            <option value="price">Price</option>
            <option value="terms">Terms</option>
          </select>
          <input
            value={newLine}
            onChange={e => setNewLine(e.target.value)}
            placeholder="e.g. 420gsm wool twill, colour 19-4008 TCX"
            style={{ flex: 1, padding: '9px 12px', border: '1px solid var(--hair-2)', borderRadius: 9 }}
          />
          <button className="btn primary small" type="submit" disabled={busy || !newLine.trim()}>Add to record</button>
        </form>
      </div>

      {(() => {
        const recordSigned = activeLines.length > 0 && activeLines.every(l => l.factory_signed_at)
        const sampleApproved = sampleStates.includes('approved')
        const qcReached = STAGES.indexOf(order.stage) >= STAGES.indexOf('qc')
        const qcPassed = qcChecks.length > 0
          ? qcChecks.every(c => c.brand_status === 'pass')
          : qcReached
        const qcSub = qcChecks.length > 0
          ? (qcPassed ? 'Every item on your checklist passed.' : `${qcChecks.filter(c => c.brand_status === 'pass').length}/${qcChecks.length} checklist items passed — the list below drives this.`)
          : (qcReached ? 'Stage reached — add the QC checklist below to verify item by item.' : 'Balance payments are safest after QC — the checklist below drives this.')
        const conds = [
          { ok: recordSigned, title: 'The record is complete and dual-signed', sub: recordSigned ? 'Every line countersigned by the factory.' : 'Lines are still awaiting factory confirmation — nothing is agreed until both sides sign.' },
          { ok: sampleApproved, title: 'A sample round is approved', sub: sampleApproved ? 'Approval (and any condition) is on the record.' : 'No approved sample yet — paying a balance before an approved sample is where most disputes start.' },
          { ok: qcPassed, title: qcChecks.length > 0 ? 'QC checklist passed' : 'Production has reached QC', sub: qcSub },
        ]
        const met = conds.filter(c => c.ok).length
        return (
          <>
            <div className="section-label">Payment readiness</div>
            <div className="card">
              <p style={{ color: 'var(--ink-3)', fontSize: 12.5, marginBottom: 10 }}>
                Clewa never holds or moves money — you pay your factory directly. These are the conditions
                worth verifying before you do. <strong style={{ color: met === 3 ? 'var(--sage)' : 'var(--thread)' }}>{met}/3 verified.</strong>
              </p>
              {conds.map((c, i) => (
                <div className={`step ${c.ok ? 'done' : ''}`} key={i}>
                  <span className="step-dot">{c.ok ? '✓' : '·'}</span>
                  <div>
                    <strong>{c.title}</strong>
                    <span>{c.sub}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="section-label">Samples</div>
      <div className="card">
        <p style={{ color: 'var(--ink-3)', fontSize: 12.5, marginBottom: 12 }}>
          The approval ladder — each round is visible to your factory, and an approval condition is written to the record.
        </p>
        <Samples mode="brand" orderId={order.id} owner={order.owner} />
      </div>
          </>
        )
      })()}

      <div className="section-label">Quality control</div>
      <div className="card">
        <p style={{ color: 'var(--ink-3)', fontSize: 12.5, marginBottom: 12 }}>
          One checklist, two verdicts — {order.factory_name || 'your factory'} inspects the same list on their link. Disagreements surface here, not at the port.
        </p>
        <Qc mode="brand" orderId={order.id} owner={order.owner} />
      </div>

      <div className="section-label">Documents</div>
      <div className="card">
        <Documents orderId={order.id} owner={order.owner} />
      </div>

      <div className="section-label">Messages</div>
      <div className="card">
        <p style={{ color: 'var(--ink-3)', fontSize: 12.5, marginBottom: 12 }}>
          Your factory sees this thread on their order link — one conversation, attached to the order{invite?.language ? `, translated to ${invite.language} for them` : ''}.
        </p>
        <Messages mode="brand" orderId={order.id} owner={order.owner} />
      </div>

      {/* Print-only: the purchase order document */}
      <div className="print-pack">
        <h1>Purchase Order</h1>
        <p className="pp-meta">
          {brandName || 'Brand'} → {order.factory_name || 'Factory'}{order.factory_country ? `, ${order.factory_country}` : ''} · issued {new Date().toISOString().slice(0, 10)} · via Clewa
        </p>
        <section>
          <h2>Order</h2>
          <p><strong>Product:</strong> {order.name}</p>
          {order.quantity && <p><strong>Quantity:</strong> {order.quantity.toLocaleString()} units</p>}
          {order.unit_price && <p><strong>Unit price:</strong> {order.currency} {Number(order.unit_price).toFixed(2)}</p>}
          {order.quantity && order.unit_price && <p><strong>Order total:</strong> {order.currency} {(order.quantity * Number(order.unit_price)).toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>}
          {order.ship_by && <p><strong>Ship by:</strong> {order.ship_by}</p>}
        </section>
        <section>
          <h2>The agreed record</h2>
          {activeLines.map(l => (
            <p key={l.id}>
              <strong>{l.category.toUpperCase()}:</strong> {l.content}
              {' '}[{l.factory_signed_at ? `dual-signed ${l.factory_signed_at.slice(0, 10)}` : `brand-signed ${l.brand_signed_at?.slice(0, 10)} — awaiting factory`}]
            </p>
          ))}
          {activeLines.length === 0 && <p>No record lines yet.</p>}
        </section>
        <section>
          <h2>Signatures</h2>
          <p style={{ marginTop: 18 }}>Brand: ______________________ date ______</p>
          <p style={{ marginTop: 14 }}>Factory: _____________________ date ______</p>
        </section>
        <p className="pp-foot">Generated by Clewa from the dual-signed record. Line-level signature timestamps are stored and exportable. clewa.io</p>
      </div>
    </>
  )
}
