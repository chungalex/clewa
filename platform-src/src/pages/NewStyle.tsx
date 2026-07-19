import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { CATEGORIES } from '../styleRules'

const START_METHODS = [
  { key: 'describe', title: 'Describe it', sub: 'A sentence or a paragraph — the builder structures it from there.' },
  { key: 'references', title: 'Upload references', sub: 'Photos of similar garments, sketches, mood images. Add them on the next screen.' },
  { key: 'import', title: 'I have a tech pack', sub: 'Bring what exists; attach the file and fill the gaps the factory will ask about.' },
] as const

export default function NewStyle() {
  const nav = useNavigate()
  const [name, setName] = useState('')
  const [category, setCategory] = useState<string>('')
  const [method, setMethod] = useState<string>('describe')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { data: userData } = await supabase.auth.getUser()
    const owner = userData.user?.id
    if (!owner) { setError('Session expired — sign in again.'); setBusy(false); return }
    const { data, error } = await supabase.from('styles').insert({
      owner, name: name.trim(), category: category || null,
      start_method: method, description: description.trim() || null,
    }).select('id').single()
    if (error || !data) { setError(error?.message || 'Could not create the style.'); setBusy(false); return }
    // Seed the overview from the description so nothing typed is lost.
    if (description.trim()) {
      await supabase.from('style_sections').upsert({
        style_id: data.id, owner, section: 'overview',
        content: { summary: description.trim() },
      }, { onConflict: 'style_id,section' })
    }
    nav(`/styles/${data.id}`)
  }

  return (
    <>
      <div className="main-head"><h1>New style</h1></div>
      <div className="card" style={{ maxWidth: 620 }}>
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="name">What are you calling it?</label>
            <input id="name" required autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Heavyweight Boxy Tee" />
          </div>
          <div className="field">
            <label htmlFor="cat">Category</label>
            <select id="cat" value={category} onChange={e => setCategory(e.target.value)}>
              <option value="">Choose — this tailors the whole builder</option>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
            <p className="field-hint">A printed tee and a tailored coat need different information — the builder adapts.</p>
          </div>
          <div className="field">
            <label>How do you want to start?</label>
            <div className="sit-grid">
              {START_METHODS.map(m => (
                <button type="button" key={m.key} className={`sit-card ${method === m.key ? 'on' : ''}`} onClick={() => setMethod(m.key)}>
                  <strong>{m.title}</strong>
                  <span>{m.sub}</span>
                </button>
              ))}
            </div>
          </div>
          {method === 'describe' && (
            <div className="field">
              <label htmlFor="desc">Describe the product</label>
              <textarea id="desc" value={description} onChange={e => setDescription(e.target.value)} rows={4}
                placeholder="Boxy heavyweight tee, 240gsm organic cotton, dropped shoulder, vintage garment-dye wash, tonal chest embroidery…" />
              <p className="field-hint">This becomes your product overview — the builder breaks the rest into guided sections.</p>
            </div>
          )}
          <button className="btn gold" type="submit" disabled={busy || !name.trim()}>
            {busy ? 'Creating…' : 'Open the builder →'}
          </button>
          {error && <p className="err-note">{error}</p>}
        </form>
      </div>
    </>
  )
}
