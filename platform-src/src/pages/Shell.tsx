import { useEffect, useState } from 'react'
import { Outlet, NavLink } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../supabase'

export default function Shell({ session }: { session: Session }) {
  const [brandName, setBrandName] = useState('')

  useEffect(() => {
    supabase.from('profiles').select('brand_name').eq('id', session.user.id).single()
      .then(({ data }) => { if (data?.brand_name) setBrandName(data.brand_name) })
  }, [session.user.id])

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">Cle<em>w</em>a</div>
        <nav>
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>Orders</NavLink>
          <NavLink to="/orders/new" className={({ isActive }) => (isActive ? 'active' : '')}>+ New order</NavLink>
        </nav>
        <div className="foot">
          <div>{brandName || session.user.email}</div>
          <button onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
