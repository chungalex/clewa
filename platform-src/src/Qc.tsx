import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export type QcCheck = {
  id: string
  item: string
  brand_status: 'pending' | 'pass' | 'fail'
  factory_status: 'pending' | 'pass' | 'fail'
  brand_note: string | null
  factory_note: string | null
}

const DEFAULT_ITEMS = [
  'Measurements match the record (spot-check 10%)',
  'Fabric hand-feel and weight match the approved sample',
  'Color matches the approved lab dip / sample',
  'Stitching clean — no skipped stitches or untrimmed threads',
  'Labels, care and origin correct',
  'Packaging as specified',
]

/**
 * One checklist, two verdicts — brand and factory each inspect the same list.
 * Disagreement is visible, not discovered at the port.
 */
export default function Qc(props:
  | { mode: 'brand'; orderId: string; owner: string }
  | { mode: 'factory'; token: string }) {
  const [checks, setChecks] = useState<QcCheck[]>([])
  const [newItem, setNewItem] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  async function load() {
    if (props.mode === 'brand') {
      const { data } = await supabase.from('qc_checks').select('*')
        .eq('order_id', props.orderId).order('created_at')
      setChecks((data as QcCheck[]) || [])
    } else {
      const { data } = await supabase.rpc('factory_get_qc', { p_token: props.token })
      setChecks((data as QcCheck[]) || [])
    }
  }

  useEffect(() => {
    load()
    const tick = setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, 8000)
    return () => clearInterval(tick)
  }, [props.mode === 'brand' ? props.orderId : props.token])

  async function addItem(item: string) {
    if (props.mode !== 'brand' || !item.trim()) return
    setBusy('add')
    await supabase.from('qc_checks').insert({
      order_id: props.orderId, owner: props.owner, item: item.trim(),
    })
    setNewItem('')
    setBusy(null)
    load()
  }

  async function addDefaults() {
    if (props.mode !== 'brand') return
    setBusy('add')
    await supabase.from('qc_checks').insert(DEFAULT_ITEMS.map(item => ({
      order_id: props.orderId, owner: props.owner, item,
    })))
    setBusy(null)
    load()
  }

  async function setStatus(c: QcCheck, status: 'pass' | 'fail') {
    setBusy(c.id)
    if (props.mode === 'brand') {
      // toggling the same verdict resets to pending
      const next = c.brand_status === status ? 'pending' : status
      await supabase.from('qc_checks').update({ brand_status: next }).eq('id', c.id)
    } else {
      const next = c.factory_status === status ? 'pending' : status
      await supabase.rpc('factory_set_qc', { p_token: props.token, p_check: c.id, p_status: next, p_note: '' })
    }
    setBusy(null)
    load()
  }

  const mineKey = props.mode === 'brand' ? 'brand_status' : 'factory_status'
  const theirsKey = props.mode === 'brand' ? 'factory_status' : 'brand_status'
  const theirsName = props.mode === 'brand' ? 'factory' : 'brand'

  return (
    <div>
      {checks.length === 0 && props.mode === 'brand' && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <p className="quiet" style={{ flex: 1, minWidth: 220, margin: 0 }}>
            No checklist yet. Both sides inspect the same list — disagreements surface here, not at the port.
          </p>
          <button className="btn primary small" disabled={busy === 'add'} onClick={addDefaults}>
            Start with the standard 6 checks
          </button>
        </div>
      )}
      {checks.length === 0 && props.mode === 'factory' && (
        <p className="quiet">The brand hasn't set up the inspection checklist yet.</p>
      )}
      {checks.map(c => {
        const mine = c[mineKey]
        const theirs = c[theirsKey]
        const conflict = (mine === 'pass' && theirs === 'fail') || (mine === 'fail' && theirs === 'pass')
        return (
          <div className={`qc-row ${conflict ? 'conflict' : ''}`} key={c.id}>
            <div className="qc-item">
              {c.item}
              <span className="qc-theirs">
                {theirsName}: {theirs === 'pending' ? 'not checked yet' : theirs}
                {conflict ? ' — disagreement, talk it through in Messages' : ''}
              </span>
            </div>
            <div className="qc-verdict">
              <button className={`qc-btn pass ${mine === 'pass' ? 'on' : ''}`} disabled={busy === c.id} onClick={() => setStatus(c, 'pass')}>Pass</button>
              <button className={`qc-btn fail ${mine === 'fail' ? 'on' : ''}`} disabled={busy === c.id} onClick={() => setStatus(c, 'fail')}>Fail</button>
            </div>
          </div>
        )
      })}
      {props.mode === 'brand' && checks.length > 0 && (
        <form style={{ display: 'flex', gap: 8, marginTop: 12 }} onSubmit={e => { e.preventDefault(); addItem(newItem) }}>
          <input value={newItem} onChange={e => setNewItem(e.target.value)} placeholder="Add a check — e.g. zipper runs smoothly ×10 units"
            style={{ flex: 1, padding: '8px 11px', border: '1px solid var(--hair-2)', borderRadius: 9, fontSize: 13 }} />
          <button className="btn ghost small" type="submit" disabled={busy === 'add' || !newItem.trim()}>Add</button>
        </form>
      )}
    </div>
  )
}
