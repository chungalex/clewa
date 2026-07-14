import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase, Order, RecordLine, STAGES, STAGE_LABELS } from '../supabase'

type Invite = {
  id: string
  token: string
  accepted_at: string | null
  accepted_by_name: string | null
}

export default function OrderDetail() {
  const { id } = useParams()
  const [order, setOrder] = useState<Order | null>(null)
  const [lines, setLines] = useState<RecordLine[]>([])
  const [invite, setInvite] = useState<Invite | null>(null)
  const [newLine, setNewLine] = useState('')
  const [newCat, setNewCat] = useState<'spec' | 'price' | 'terms'>('spec')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  async function load() {
    const [{ data: o }, { data: l }, { data: inv }] = await Promise.all([
      supabase.from('orders').select('*').eq('id', id).single(),
      supabase.from('record_lines').select('*').eq('order_id', id).order('created_at'),
      supabase.from('order_invites').select('id, token, accepted_at, accepted_by_name').eq('order_id', id).limit(1).maybeSingle(),
    ])
    setOrder(o as Order)
    setLines((l as RecordLine[]) || [])
    setInvite(inv as Invite | null)
  }

  useEffect(() => { load() }, [id])

  // Refresh when the tab regains focus, so factory confirmations appear.
  useEffect(() => {
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [id])

  async function createInvite() {
    if (!order) return
    const { data } = await supabase
      .from('order_invites')
      .insert({ order_id: order.id, owner: order.owner })
      .select('id, token, accepted_at, accepted_by_name')
      .single()
    setInvite(data as Invite)
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

  async function setStage(stage: Order['stage']) {
    if (!order) return
    await supabase.from('orders').update({ stage }).eq('id', order.id)
    load()
  }

  if (!order) return null
  const stageIdx = STAGES.indexOf(order.stage)

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
        <span className={`stage-pill ${order.stage}`}>{STAGE_LABELS[order.stage]}</span>
      </div>

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
            <p style={{ color: 'var(--ink-3)', fontSize: 12.5, marginTop: 10, marginBottom: 0 }}>
              {invite.accepted_at
                ? <>Opened by <strong>{invite.accepted_by_name || 'the factory'}</strong> · confirmations land on the record below as they happen</>
                : 'Not opened yet — send it to your factory contact by email or WhatsApp.'}
            </p>
          </>
        )}
      </div>

      <div className="section-label">The Record</div>
      <div className="card">
        {lines.length === 0 && (
          <p style={{ color: 'var(--ink-3)', paddingBottom: 12 }}>
            Nothing on the record yet. Every spec, price and term you add here is dated and signed — if the bulk arrives wrong, it's not a he-said-she-said.
          </p>
        )}
        {lines.map(l => (
          <div className="rec-line" key={l.id}>
            <span className="rec-cat">{l.category}</span>
            <span className="rec-content">{l.content}</span>
            <span className={`rec-sign ${l.factory_signed_at ? '' : 'pending'}`}>
              {l.factory_signed_at ? '✓ both signed' : `you signed ${l.brand_signed_at?.slice(0, 10)} · awaiting factory`}
            </span>
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
    </>
  )
}
