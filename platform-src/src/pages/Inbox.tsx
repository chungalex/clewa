import Loading from '../Loading'
import React, { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, SUPABASE_URL, SUPABASE_KEY, Order } from '../supabase'
import '../parity/messages.css'

type Msg = {
  id: string
  order_id: string
  sender: 'brand' | 'factory'
  sender_name: string | null
  body: string
  translated_body: string | null
  translated_lang: string | null
  translation_status: string
  created_at: string
}

function listTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (d >= startOfToday) return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })
  if (d >= new Date(startOfToday.getTime() - 86400000)) return 'Yest'
  if (d >= new Date(startOfToday.getTime() - 6 * 86400000)) return d.toLocaleDateString('en-US', { weekday: 'short' })
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function dayLabel(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (d >= startOfToday) return 'Today'
  if (d >= new Date(startOfToday.getTime() - 86400000)) return 'Yesterday'
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
}

/** Every conversation in one place — demo's two-pane chat, bound to real order threads. */
export default function Inbox() {
  const [orders, setOrders] = useState<Order[]>([])
  const [msgs, setMsgs] = useState<Msg[] | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [showOrig, setShowOrig] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const lastCount = useRef(0)

  async function load() {
    const [o, m] = await Promise.all([
      supabase.from('orders').select('*').is('archived_at', null),
      supabase.from('order_messages')
        .select('id, order_id, sender, sender_name, body, translated_body, translated_lang, translation_status, created_at')
        .order('created_at', { ascending: false }).limit(500),
    ])
    setOrders((o.data as Order[]) || [])
    setMsgs(((m.data as Msg[]) || []).reverse())
  }

  useEffect(() => {
    load()
    const tick = setInterval(() => { if (document.visibilityState === 'visible') load() }, 10000)
    return () => clearInterval(tick)
  }, [])

  // Pin the conversation to its newest message on thread change or new arrivals.
  useEffect(() => {
    if (msgs && msgs.length !== lastCount.current) lastCount.current = msgs.length
    endRef.current?.scrollIntoView({ block: 'nearest' })
  }, [msgs?.length, selected])

  if (msgs === null) return <Loading variant="detail" />

  // One thread per order, newest activity first.
  const threads = new Map<string, { latest: Msg; count: number }>()
  for (const m of msgs) {
    const t = threads.get(m.order_id)
    if (!t) threads.set(m.order_id, { latest: m, count: 1 })
    else { t.count++; if (m.created_at > t.latest.created_at) t.latest = m }
  }
  const rows = [...threads.entries()]
    .map(([orderId, t]) => ({ orderId, order: orders.find(o => o.id === orderId), ...t }))
    .filter((r): r is typeof r & { order: Order } => !!r.order)
    .sort((a, b) => (a.latest.created_at < b.latest.created_at ? 1 : -1))

  const current = rows.find(r => r.orderId === selected) || rows[0] || null
  const currentMsgs = current ? msgs.filter(m => m.order_id === current.orderId) : []

  async function requestTranslation(messageId: string) {
    // Fire-and-forget: translation must never block or break messaging.
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json', apikey: SUPABASE_KEY }
      const { data } = await supabase.auth.getSession()
      if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`
      fetch(`${SUPABASE_URL}/functions/v1/translate-message`, {
        method: 'POST', headers, body: JSON.stringify({ message_id: messageId }),
      }).catch(() => {})
    } catch { /* translation plumbing never surfaces as an error */ }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault()
    const body = draft.trim()
    if (!body || !current) return
    setBusy(true)
    const { data } = await supabase.from('order_messages').insert({
      order_id: current.orderId, owner: current.order.owner, sender: 'brand', body,
    }).select('id').single()
    if (data?.id) requestTranslation(data.id)
    setDraft('')
    setBusy(false)
    load()
  }

  function preview(m: Msg): string {
    return (m.sender === 'factory' && m.translation_status === 'done' && m.translated_body) ? m.translated_body : m.body
  }

  return (
    <div className="page-w">
      <div className="pg-bar">
        <div>
          <h2 className="pg-h">Messages</h2>
          <div className="pg-sub">Chat with any factory in your language — they read and reply in theirs. Every message translated both ways, kept on the order.</div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card empty">
          <h2>No conversations yet.</h2>
          <p>Messages start on an order — open one, write to your factory, and the thread appears here.</p>
        </div>
      ) : (
        <div className={`chat-grid${showOrig ? ' show-orig' : ''}`}>
          <div className="chat-list">
            {rows.map(r => (
              <div
                className={`chat-litem${current && r.orderId === current.orderId ? ' on' : ''}`}
                key={r.orderId}
                role="button"
                tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(r.orderId) } }}
                onClick={() => setSelected(r.orderId)}
              >
                <span className="chat-av">{(r.order.factory_name || r.order.name).charAt(0).toUpperCase()}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="chat-li-name">{r.order.factory_name ? `${r.order.factory_name} · ${r.order.name}` : r.order.name}</div>
                  <div className="chat-li-snip">{preview(r.latest)}</div>
                </div>
                <div className="chat-li-meta">
                  <div className="chat-li-time">{listTime(r.latest.created_at)}</div>
                </div>
              </div>
            ))}
          </div>

          {current && (
            <div className="chat-main">
              <div className="chat-top">
                <div className="ct-who">
                  <span className="chat-av">{(current.order.factory_name || current.order.name).charAt(0).toUpperCase()}</span>
                  <div>
                    <div className="ct-name"><Link to={`/orders/${current.orderId}`}>{current.order.factory_name || current.order.name}</Link></div>
                    <div className="ct-sub">
                      {current.order.factory_name ? `${current.order.name}` : 'Order thread'}
                      {current.order.factory_country ? ` · ${current.order.factory_country}` : ''}
                      {' · saved on the order record'}
                    </div>
                  </div>
                </div>
                <button
                  className="chat-xlate"
                  type="button"
                  title="Show original language alongside translations"
                  onClick={() => setShowOrig(v => !v)}
                >
                  <span className="cx-sw"></span>
                  <span className="cx-state">{showOrig ? 'Showing original' : 'Translation on'}</span>
                </button>
              </div>

              <div className="chat-body">
                {currentMsgs.map((m, i) => {
                  const mine = m.sender === 'brand'
                  const translated = m.sender === 'factory' && m.translation_status === 'done' && !!m.translated_body
                  const bubble = translated ? m.translated_body! : m.body
                  // The "original" pane: for factory messages it's what they typed; for yours,
                  // the translated version that was delivered to the factory.
                  const orig = translated ? m.body : (mine && m.translated_body ? m.translated_body : null)
                  const newDay = i === 0 || dayLabel(m.created_at) !== dayLabel(currentMsgs[i - 1].created_at)
                  const time = new Date(m.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })
                  return (
                    <React.Fragment key={m.id}>
                      {newDay && <div className="chat-day">{dayLabel(m.created_at)}</div>}
                      <div className={`msg ${mine ? 'me' : 'them'}`}>
                        <div className="msg-bubble">
                          {bubble}
                          {orig && <div className="msg-orig">{orig}</div>}
                        </div>
                        <div className="msg-meta">
                          {mine ? (
                            <>
                              {m.translated_body && m.translated_lang && <span className="mm-x">sent in {m.translated_lang}</span>}
                              {m.translated_body && m.translated_lang ? ' · ' : ''}{time}
                            </>
                          ) : (
                            <>
                              {m.sender_name || 'Factory'} · {time}
                              {translated && <> · <span className="mm-x">translated{m.translated_lang ? ` from ${m.translated_lang}` : ''}</span></>}
                              {m.translation_status === 'pending' && <> · <span className="mm-x">translating…</span></>}
                              {m.translation_status === 'failed' && (
                                <> · <a onClick={e => { e.preventDefault(); requestTranslation(m.id) }} href="#">retry translation</a></>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </React.Fragment>
                  )
                })}
                <div ref={endRef} />
              </div>

              <div className="chat-compose">
                <form className="chat-inwrap" onSubmit={send}>
                  <input
                    type="text"
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    placeholder={current.order.factory_name
                      ? `Write in your language — ${current.order.factory_name} reads it in theirs`
                      : 'Write in your language — it stays on the order'}
                  />
                  <button className="chat-send" type="submit" disabled={busy || !draft.trim()} aria-label="Send">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" /></svg>
                  </button>
                </form>
                <div className="chat-cnote">
                  <span className="cc-x">⇄</span>
                  Every message translated both ways · both originals saved to the order record.
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
