import { useEffect, useState } from 'react'
import { Outlet, NavLink, Link } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../supabase'
import Topbar from '../Topbar'

export default function Shell({ session }: { session: Session }) {
  const [brandName, setBrandName] = useState('')
  const [ordersBadge, setOrdersBadge] = useState(0)
  const [intelBadge, setIntelBadge] = useState(0)
  const [needs, setNeeds] = useState<{ text: string; to: string }[]>([])

  useEffect(() => {
    supabase.from('profiles').select('brand_name').eq('id', session.user.id).single()
      .then(({ data }) => { if (data?.brand_name) setBrandName(data.brand_name) })
  }, [session.user.id])

  // Badges: what's waiting on you (Orders) and what's urgent (Intelligence).
  useEffect(() => {
    async function computeBadges() {
      const [o, l, sm, qc] = await Promise.all([
        supabase.from('orders').select('id, name, stage, ship_by').is('archived_at', null),
        supabase.from('record_lines').select('order_id, factory_signed_at, superseded_by'),
        supabase.from('samples').select('order_id, status'),
        supabase.from('qc_checks').select('order_id, brand_status, factory_status'),
      ])
      const active = (o.data || []).filter(x => !['delivered', 'closed'].includes(x.stage))
      const needsYou = new Set<string>()
      const items: { text: string; to: string }[] = []
      for (const x of active) {
        const withName = x as { id: string; name?: string }
        if ((sm.data || []).some(s2 => s2.order_id === x.id && s2.status === 'submitted')) {
          needsYou.add(x.id)
          items.push({ text: `Sample awaits your review — ${withName.name || 'order'}`, to: `/orders/${x.id}` })
        }
        if ((l.data || []).some(l2 => l2.order_id === x.id && !l2.superseded_by && !l2.factory_signed_at)) {
          needsYou.add(x.id)
          items.push({ text: `Record lines unconfirmed — ${withName.name || 'order'}`, to: `/orders/${x.id}` })
        }
      }
      setNeeds(items.slice(0, 8))
      setOrdersBadge(needsYou.size)
      let urgent = 0
      for (const x of active) {
        if (x.ship_by && new Date(x.ship_by).getTime() - 50 * 86400000 < Date.now() && ['techpack', 'quote', 'po', 'sampling'].includes(x.stage)) urgent++
        if ((qc.data || []).some(c => c.order_id === x.id &&
          ((c.brand_status === 'pass' && c.factory_status === 'fail') || (c.brand_status === 'fail' && c.factory_status === 'pass')))) urgent++
      }
      setIntelBadge(urgent)
    }
    computeBadges()
    const tick = setInterval(() => { if (document.visibilityState === 'visible') computeBadges() }, 60000)
    return () => clearInterval(tick)
  }, [session.user.id])

  useEffect(() => {
    try {
      document.body.classList.toggle('pro-mode', localStorage.getItem('clewa-mode') === 'pro')
    } catch { /* private mode */ }
  }, [])

  const cls = ({ isActive }: { isActive: boolean }) => (isActive ? 'active' : '')
  const initial = (brandName || session.user.email || 'C').slice(0, 1).toUpperCase()

  return (
    <div className="shell">
      <aside className="side">
        <a className="brand" href="../" title="Back to clewa site" aria-label="Clewa — back to site">Cle<em>w</em>a</a>
        <div className="side-new">
          <Link to="/orders/new" className="btn primary">+ New order</Link>
        </div>
        <nav>
          <NavLink to="/" end className={cls}>Home</NavLink>
          <NavLink to="/orders" className={cls}>Orders{ordersBadge > 0 && <span className="ni-badge">{ordersBadge}</span>}</NavLink>
          <NavLink to="/calendar" className={cls}>Calendar</NavLink>
          <NavLink to="/messages" className={cls}>Messages</NavLink>
          <NavLink to="/finances" className={cls}>Finances</NavLink>
          <div className="side-sec">Make &amp; plan</div>
          <NavLink to="/styles" className={cls}>Styles</NavLink>
          <NavLink to="/planning" className={cls}>Planning</NavLink>
          <div className="side-sec">Track</div>
          <NavLink to="/inventory" className={cls}>Inventory</NavLink>
          <NavLink to="/contacts" className={cls}>Contacts</NavLink>
          {session.user.email === 'chungalexvo@gmail.com' && (
            <NavLink to="/sourcing" className={cls}>Sourcing</NavLink>
          )}
          <div className="side-sec">Intelligence</div>
          <NavLink to="/intelligence" className={cls}>Intelligence{intelBadge > 0 && <span className="ni-badge">{intelBadge}</span>}</NavLink>
        </nav>
        <div className="spacer" />
        <div className="foot">
          <Link to="/settings" className="avatar" title="Settings">{initial}</Link>
          <span className="who">
            <Link to="/settings" style={{ color: 'inherit' }}><div>{brandName || session.user.email}</div></Link>
            <button onClick={() => supabase.auth.signOut()}>Sign out</button>
          </span>
        </div>
      </aside>
      <div className="main-col">
        <Topbar brandName={brandName} needs={needs} />
        <main className="main">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
