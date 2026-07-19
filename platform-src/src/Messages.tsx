import { useEffect, useRef, useState } from 'react'
import { supabase, SUPABASE_URL, SUPABASE_KEY } from './supabase'

export type Msg = {
  id: string
  sender: 'brand' | 'factory'
  sender_name: string | null
  body: string
  translated_body?: string | null
  translated_lang?: string | null
  translation_status?: string
  created_at: string
}

/**
 * One thread per order, shared by both sides.
 * Brand mode: reads/writes order_messages directly (RLS-scoped).
 * Factory mode: goes through the token RPCs — no table access.
 * Every send fires a translate request; the original is always delivered
 * immediately and never altered — the translation arrives via polling.
 */
export default function Messages(props:
  | { mode: 'brand'; orderId: string; owner: string }
  | { mode: 'factory'; token: string; senderName: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [showOriginal, setShowOriginal] = useState<Record<string, boolean>>({})
  const endRef = useRef<HTMLDivElement>(null)
  const count = useRef(0)

  async function load() {
    if (props.mode === 'brand') {
      const { data } = await supabase.from('order_messages')
        .select('id, sender, sender_name, body, translated_body, translated_lang, translation_status, created_at')
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

  async function requestTranslation(messageId: string) {
    // Fire-and-forget: translation must never block or break messaging.
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json', apikey: SUPABASE_KEY }
      const payload: Record<string, string> = { message_id: messageId }
      if (props.mode === 'factory') {
        payload.invite_token = props.token
      } else {
        const { data } = await supabase.auth.getSession()
        if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`
      }
      fetch(`${SUPABASE_URL}/functions/v1/translate-message`, {
        method: 'POST', headers, body: JSON.stringify(payload),
      }).catch(() => {})
    } catch { /* translation plumbing never surfaces as an error */ }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault()
    const body = draft.trim()
    if (!body) return
    setBusy(true)
    let newId: string | null = null
    if (props.mode === 'brand') {
      const { data } = await supabase.from('order_messages').insert({
        order_id: props.orderId, owner: props.owner, sender: 'brand', body,
      }).select('id').single()
      newId = data?.id || null
    } else {
      const { data } = await supabase.rpc('factory_send_message', {
        p_token: props.token, p_name: props.senderName, p_body: body,
      })
      newId = (data as { id?: string })?.id || null
    }
    if (newId) requestTranslation(newId)
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
        {msgs.map(m => {
          const theirs = m.sender !== mine
          const hasTranslation = theirs && m.translation_status === 'done' && m.translated_body
          const original = showOriginal[m.id]
          return (
            <div className={`msg ${m.sender === mine ? 'mine' : ''}`} key={m.id}>
              <div className="msg-bubble">{hasTranslation && !original ? m.translated_body : m.body}</div>
              <div className="msg-meta">
                {m.sender === 'brand' ? (m.sender_name || 'Brand') : (m.sender_name || 'Factory')}
                {' · '}{new Date(m.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                {hasTranslation && (
                  <>
                    {' · '}<span className="msg-translated">{original ? 'showing original' : 'translated'}</span>
                    {' · '}
                    <a href="#" onClick={e => { e.preventDefault(); setShowOriginal({ ...showOriginal, [m.id]: !original }) }}>
                      {original ? 'show translation' : 'show original'}
                    </a>
                  </>
                )}
                {theirs && m.translation_status === 'pending' && <> · <span className="msg-translated">translating…</span></>}
                {theirs && m.translation_status === 'failed' && (
                  <> · <a href="#" onClick={e => { e.preventDefault(); requestTranslation(m.id) }}>retry translation</a></>
                )}
              </div>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>
      <form className="msgs-input" onSubmit={send}>
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="Write in your language — it stays on the order"
        />
        <button className="btn primary small" type="submit" disabled={busy || !draft.trim()}>Send</button>
      </form>
    </div>
  )
}
