import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import Auth from './pages/Auth'
import Welcome from './pages/Welcome'
import Shell from './pages/Shell'
import Orders from './pages/Orders'
import Home from './pages/Home'
import Calendar from './pages/Calendar'
import Finances from './pages/Finances'
import Sourcing from './pages/Sourcing'
import Styles from './pages/Styles'
import NewStyle from './pages/NewStyle'
import StyleDetail from './pages/StyleDetail'
import Inventory from './pages/Inventory'
import Contacts from './pages/Contacts'
import Intelligence from './pages/Intelligence'
import Settings from './pages/Settings'
import Planning from './pages/Planning'
import NewOrder from './pages/NewOrder'
import OrderDetail from './pages/OrderDetail'
import FactoryView from './pages/FactoryView'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [profileReady, setProfileReady] = useState(false)
  const [needsWelcome, setNeedsWelcome] = useState(false)
  const location = useLocation()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  // Once signed in, check whether onboarding (brand name) is done.
  useEffect(() => {
    if (!session) { setProfileReady(false); setNeedsWelcome(false); return }
    supabase.from('profiles').select('brand_name').eq('id', session.user.id).single()
      .then(({ data }) => {
        setNeedsWelcome(!data?.brand_name)
        setProfileReady(true)
      })
  }, [session?.user.id])

  if (!ready) return null

  // Factory share-link: works with no account, before any auth gate.
  if (location.pathname.startsWith('/f/')) {
    return (
      <Routes>
        <Route path="/f/:token" element={<FactoryView />} />
      </Routes>
    )
  }

  if (!session) {
    if (location.pathname !== '/auth') return <Navigate to="/auth" replace />
    return (
      <Routes>
        <Route path="/auth" element={<Auth />} />
      </Routes>
    )
  }

  if (!profileReady) return null

  if (needsWelcome) {
    return <Welcome userId={session.user.id} onDone={() => setNeedsWelcome(false)} />
  }

  return (
    <Routes>
      <Route path="/auth" element={<Navigate to="/" replace />} />
      <Route element={<Shell session={session} />}>
        <Route path="/" element={<Home />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/finances" element={<Finances />} />
        <Route path="/sourcing" element={<Sourcing />} />
        <Route path="/styles" element={<Styles />} />
        <Route path="/styles/new" element={<NewStyle />} />
        <Route path="/styles/:id" element={<StyleDetail />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/contacts" element={<Contacts />} />
        <Route path="/intelligence" element={<Intelligence />} />
        <Route path="/settings" element={<Settings session={session} />} />
        <Route path="/planning" element={<Planning />} />
        <Route path="/orders/new" element={<NewOrder />} />
        <Route path="/orders/:id" element={<OrderDetail />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
