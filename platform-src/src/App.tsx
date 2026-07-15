import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import Auth from './pages/Auth'
import Welcome from './pages/Welcome'
import Shell from './pages/Shell'
import Orders from './pages/Orders'
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
        <Route path="/" element={<Orders />} />
        <Route path="/orders/new" element={<NewOrder />} />
        <Route path="/orders/:id" element={<OrderDetail />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
