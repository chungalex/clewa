import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

export type Msg = {
  id: string
  sender: 'brand' | 'factory'
  sender_name: string | null
  body: string
  created_at: string
}

/**
 * One thread per order, shared by both sides.
 * Brand mode: reads/writes order_messages directly (RLS-scoped).
 * Factory mode: goes through the token RPCs — no table access.
 */
export default function Messages(props:
  | { mode: 'brand'; orderId: string; owner: string }
  | { mode: 'factory'; token: string; senderName: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const count = useRef(0)

  async function load() {
    if (props.mode === 'brand') {
      const { data } = await supabase.from('order_messages')
        .select('id, sender, sender_name, body, created_at')
        .eq('order_id', props.orderId).order('created_at')
      setMsgs((data as Msg[]) || [])
    } else {
      const { data } = await supabase.rpc('factory_get_messages', { p_token: props.token })
      setMsgs((data as Msg[]) || [])
    }
  }

  useEffect(() => {
    load()
    const tick = setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, 8000)
    return () => clearInterval(tick)
  }, [props.mode === 'brand' ? props.orderId : props.token])

  useEffect(() => {
    if (msgs.length > count.current && count.current > 0) {
      endRef.current?.scrollIntoView({ block: 'nearest' })
    }
    count.current = msgs.length
  }, [msgs.length])

  async function send(e: React.FormEvent) {
    e.preventDefault()
    const body = draft.trim()
    if (!body) return
    setBusy(true)
    if (props.mode === 'brand') {
      await supabase.from('order_messages').insert({
        order_id: props.orderId, owner: props.owner, sender: 'brand', body,
      })
    } else {
      await supabase.rpc('factory_send_message', {
        p_token: props.token, p_name: props.senderName, p_body: body,
      })
    }
    setDraft('')
    setBusy(false)
    load()
  }

  const mine = props.mode === 'brand' ? 'brand' : 'factory'

  return (
    <div className="msgs">
      <div className="msgs-list">
        {msgs.length === 0 && (
          <p className="quiet">
            No messages yet. Everything said here stays attached to the order — no digging through email later.
          </p>
        )}
        {msgs.map(m => (
          <div className={`msg ${m.sender === mine ? 'mine' : ''}`} key={m.id}>
            <div className="msg-bubble">{m.body}</div>
            <div className="msg-meta">
              {m.sender === 'brand' ? (m.sender_name || 'Brand') : (m.sender_name || 'Factory')}
              {' · '}{new Date(m.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form className="msgs-input" onSubmit={send}>
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="Write a message — it stays on the order"
        />
        <button className="btn primary small" type="submit" disabled={busy || !draft.trim()}>Send</button>
      </form>
    </div>
  )
}
