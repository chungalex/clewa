import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

type Doc = {
  id: string
  storage_path: string
  filename: string
  size_bytes: number | null
  created_at: string
}

/** Order documents — tech packs, invoices, lab dips. Private storage, signed links. */
export default function Documents({ orderId, owner }: { orderId: string; owner: string }) {
  const [docs, setDocs] = useState<Doc[]>([])
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function load() {
    const { data } = await supabase.from('order_documents').select('*')
      .eq('order_id', orderId).order('created_at', { ascending: false })
    setDocs((data as Doc[]) || [])
  }
  useEffect(() => { load() }, [orderId])

  async function upload(files: FileList | null) {
    if (!files) return
    setUploading(true)
    for (const f of Array.from(files).slice(0, 10)) {
      const path = `${owner}/${orderId}/${Date.now()}-${f.name.replace(/[^\w.-]/g, '_')}`
      const { error } = await supabase.storage.from('order-docs').upload(path, f)
      if (!error) {
        await supabase.from('order_documents').insert({
          order_id: orderId, owner, storage_path: path, filename: f.name, size_bytes: f.size,
        })
      }
    }
    setUploading(false)
    load()
  }

  async function open(d: Doc) {
    const { data } = await supabase.storage.from('order-docs').createSignedUrl(d.storage_path, 600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  async function remove(d: Doc) {
    await supabase.storage.from('order-docs').remove([d.storage_path])
    await supabase.from('order_documents').delete().eq('id', d.id)
    load()
  }

  function fmtSize(b: number | null) {
    if (!b) return ''
    return b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`
  }

  return (
    <div>
      {docs.length === 0 && (
        <p className="quiet">Tech packs, invoices, lab dips, artwork — everything for this order in one place, dated.</p>
      )}
      {docs.map(d => (
        <div className="doc-row" key={d.id}>
          <a href="#" onClick={e => { e.preventDefault(); open(d) }}><strong>{d.filename}</strong></a>
          <span className="quiet" style={{ fontSize: 12 }}>
            {fmtSize(d.size_bytes)} · {d.created_at.slice(0, 10)}
            {' · '}<a href="#" onClick={e => { e.preventDefault(); remove(d) }}>remove</a>
          </span>
        </div>
      ))}
      <button className="btn ghost small" style={{ marginTop: docs.length ? 12 : 10 }}
        onClick={() => fileRef.current?.click()} disabled={uploading}>
        {uploading ? 'Uploading…' : '+ Upload documents'}
      </button>
      <input ref={fileRef} type="file" multiple hidden onChange={e => upload(e.target.files)} />
    </div>
  )
}
