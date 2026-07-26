import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from './supabase'
import { toast } from './toast'

type Hit = { kind: 'order' | 'style' | 'factory'; id: string; title: string; sub: string; to: string }
type NeedItem = { text: string; to: string }

const TITLES: Record<string, string> = {
  '/': 'Home', '/styles': 'Styles', '/orders': 'Orders', '/messages': 'Messages',
  '/calendar': 'Calendar', '/finances': 'Finances', '/inventory': 'Inventory',
  '/contacts': 'Contacts', '/planning': 'Planning', '/intelligence': 'Intelligence',
  '/sourcing': 'Sourcing', '/settings': 'Settings', '/integrations': 'Integrations',
  '/orders/new': 'New order', '/styles/new': 'New style',
}

/** The demo's topbar, real: live search, Guided/Pro pill, a bell that knows. */
export default function Topbar({ brandName, needs }: { brandName: string; needs: NeedItem[] }) {
  const nav = useNavigate()
  const location = useLocation()
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [open, setOpen] = useState(false)
  const [bellOpen, setBellOpen] = useState(false)
  const [mode, setMode] = useState(() => {
    try { return localStorage.getItem('clewa-mode') || 'pro' } catch { return 'pro' }
  })
  const boxRef = useRef<HTMLDivElement>(null)

  const path = location.pathname
  const title = TITLES[path] || (path.startsWith('/orders/') ? 'Order' : path.startsWith('/styles/') ? 'Style' : 'Clewa')

  useEffect(() => {
    const term = q.trim().toLowerCase()
    if (term.length < 2) { setHits([]); return }
    const t = setTimeout(async () => {
      const [o, st, f] = await Promise.all([
        supabase.from('orders').select('id, name, factory_name, stage').is('archived_at', null).ilike('name', `%${term}%`).limit(4),
        supabase.from('styles').select('id, name, category').is('archived_at', null).ilike('name', `%${term}%`).limit(4),
        supabase.from('factories').select('id, name, country').ilike('name', `%${term}%`).limit(3),
      ])
      const res: Hit[] = [
        ...((o.data || []).map(x => ({ kind: 'order' as const, id: x.id, title: x.name, sub: `Order · ${x.stage}${x.factory_name ? ` · ${x.factory_name}` : ''}`, to: `/orders/${x.id}` }))),
        ...((st.data || []).map(x => ({ kind: 'style' as const, id: x.id, title: x.name, sub: `Style${x.category ? ` · ${x.category}` : ''}`, to: `/styles/${x.id}` }))),
        ...((f.data || []).map(x => ({ kind: 'factory' as const, id: x.id, title: x.name, sub: `Factory${x.country ? ` · ${x.country}` : ''}`, to: '/contacts' }))),
      ]
      setHits(res)
      setOpen(true)
    }, 220)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) { setOpen(false); setBellOpen(false) }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  function toggleMode() {
    const next = mode === 'guided' ? 'pro' : 'guided'
    setMode(next)
    try { localStorage.setItem('clewa-mode', next) } catch { /* private mode */ }
    document.body.classList.toggle('pro-mode', next === 'pro')
    document.body.classList.toggle('guided', next === 'guided')
    toast(next === 'pro' ? 'Pro mode — coaching hidden' : 'Guided mode — coaching visible')
  }

  return (
    <header className="topbar no-print" ref={boxRef}>
      <div className="tb-crumb">
        <h2>{title}</h2>
        {brandName && <span className="tb-brand">{brandName}</span>}
      </div>

      <div className="tb-tools">
        <button className={`tb-mode ${mode}`} onClick={toggleMode} title="Switch between Guided and Pro">
          <span className={mode === 'guided' ? 'on' : ''}>Guided</span>
          <span className={mode === 'pro' ? 'on' : ''}>Pro</span>
        </button>

        <div className="tb-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            onFocus={() => q.trim().length >= 2 && setOpen(true)}
            placeholder="Search orders, styles, factories…"
            aria-label="Search"
          />
          {open && hits.length > 0 && (
            <div className="tb-results">
              {hits.map(h => (
                <button key={`${h.kind}-${h.id}`} onClick={() => { setOpen(false); setQ(''); nav(h.to) }}>
                  <strong>{h.title}</strong>
                  <span>{h.sub}</span>
                </button>
              ))}
            </div>
          )}
          {open && q.trim().length >= 2 && hits.length === 0 && (
            <div className="tb-results"><span className="tb-none">Nothing matches "{q.trim()}"</span></div>
          )}
        </div>

        <button className="tb-bell" onClick={() => setBellOpen(!bellOpen)} aria-label={`${needs.length} items need you`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
          {needs.length > 0 && <span className="tb-bell-badge">{needs.length}</span>}
        </button>
        {bellOpen && (
          <div className="tb-results tb-bell-drop">
            {needs.length === 0 && <span className="tb-none">Nothing needs you — you're clear.</span>}
            {needs.map((n, i) => (
              <button key={i} onClick={() => { setBellOpen(false); nav(n.to) }}>
                <strong>{n.text}</strong>
              </button>
            ))}
          </div>
        )}
      </div>
    </header>
  )
}
