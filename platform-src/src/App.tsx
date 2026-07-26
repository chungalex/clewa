import { lazy, Suspense, useEffect, useState } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import Loading from './Loading'
const Auth = lazy(() => import('./pages/Auth'))
const Welcome = lazy(() => import('./pages/Welcome'))
const Shell = lazy(() => import('./pages/Shell'))
const Orders = lazy(() => import('./pages/Orders'))
const Home = lazy(() => import('./pages/Home'))
const Calendar = lazy(() => import('./pages/Calendar'))
const Finances = lazy(() => import('./pages/Finances'))
const Sourcing = lazy(() => import('./pages/Sourcing'))
const Styles = lazy(() => import('./pages/Styles'))
const NewStyle = lazy(() => import('./pages/NewStyle'))
const StyleDetail = lazy(() => import('./pages/StyleDetail'))
const Inventory = lazy(() => import('./pages/Inventory'))
const Contacts = lazy(() => import('./pages/Contacts'))
const Intelligence = lazy(() => import('./pages/Intelligence'))
const Settings = lazy(() => import('./pages/Settings'))
const Planning = lazy(() => import('./pages/Planning'))
const Inbox = lazy(() => import('./pages/Inbox'))
const Integrations = lazy(() => import('./pages/Integrations'))
const NewOrder = lazy(() => import('./pages/NewOrder'))
const OrderDetail = lazy(() => import('./pages/OrderDetail'))
const FactoryView = lazy(() => import('./pages/FactoryView'))

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
      <Suspense fallback={<div className="fv-wrap"><div className="fv-card"><Loading variant="plain" /></div></div>}>
        <Routes>
          <Route path="/f/:token" element={<FactoryView />} />
        </Routes>
      </Suspense>
    )
  }

  if (!session) {
    if (location.pathname !== '/auth') return <Navigate to="/auth" replace />
    return (
      <Suspense fallback={<div className="auth-wrap"><Loading variant="plain" /></div>}>
        <Routes>
          <Route path="/auth" element={<Auth />} />
        </Routes>
      </Suspense>
    )
  }

  if (!profileReady) return null

  if (needsWelcome) {
    return (
      <Suspense fallback={<div className="auth-wrap"><Loading variant="plain" /></div>}>
        <Welcome userId={session.user.id} onDone={() => setNeedsWelcome(false)} />
      </Suspense>
    )
  }

  return (
    <Suspense fallback={<div style={{ padding: '40px' }}><Loading /></div>}>
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
        <Route path="/messages" element={<Inbox />} />
        <Route path="/integrations" element={<Integrations />} />
        <Route path="/orders/new" element={<NewOrder />} />
        <Route path="/orders/:id" element={<OrderDetail />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  )
}
