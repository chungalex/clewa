import { useEffect, useState } from 'react'
import { Outlet, NavLink, Link } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../supabase'

export default function Shell({ session }: { session: Session }) {
  const [brandName, setBrandName] = useState('')

  useEffect(() => {
    supabase.from('profiles').select('brand_name').eq('id', session.user.id).single()
      .then(({ data }) => { if (data?.brand_name) setBrandName(data.brand_name) })
  }, [session.user.id])

  const cls = ({ isActive }: { isActive: boolean }) => (isActive ? 'active' : '')
  const initial = (brandName || session.user.email || 'C').slice(0, 1).toUpperCase()

  return (
    <div className="shell">
      <aside className="side">
        <a className="brand" href="../" title="Back to clewa site">Cle<em>w</em>a</a>
        <div className="side-new">
          <Link to="/orders/new" className="btn primary">+ New order</Link>
        </div>
        <nav>
          <NavLink to="/" end className={cls}>Home</NavLink>
          <NavLink to="/styles" className={cls}>Styles</NavLink>
          <NavLink to="/orders" className={cls}>Orders</NavLink>
          <NavLink to="/calendar" className={cls}>Calendar</NavLink>
          <NavLink to="/finances" className={cls}>Finances</NavLink>
          <NavLink to="/inventory" className={cls}>Inventory</NavLink>
          <NavLink to="/contacts" className={cls}>Contacts</NavLink>
          <NavLink to="/planning" className={cls}>Planning</NavLink>
          <NavLink to="/intelligence" className={cls}>Intelligence</NavLink>
          {session.user.email === 'chungalexvo@gmail.com' && (
            <NavLink to="/sourcing" className={cls}>Sourcing</NavLink>
          )}
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
      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
