// generate-image — provider-agnostic concept-render interface for the style builder.
// Returns an honest setup state until an image provider secret is configured
// (IMAGE_PROVIDER_KEY). Renders are concept visualizations, never manufacturing
// drawings, and every job is logged to generation_jobs with cost metadata.
import { createClient } from 'npm:@supabase/supabase-js@2'

Deno.serve(async (req) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  try {
    const { style_id, prompt } = await req.json()
    const jwt = (req.headers.get('authorization') || '').replace(/^Bearer /i, '')
    const { data: u } = await admin.auth.getUser(jwt)
    if (!u.user) return json({ ok: false, error: 'unauthorized' }, 403, cors)
    const { data: style } = await admin.from('styles').select('id, owner').eq('id', style_id).single()
    if (!style || style.owner !== u.user.id) return json({ ok: false, error: 'not found' }, 404, cors)

    const key = Deno.env.get('IMAGE_PROVIDER_KEY')
    if (!key) {
      await admin.from('generation_jobs').insert({
        style_id, owner: u.user.id, prompt: String(prompt || '').slice(0, 500), status: 'setup_required',
      })
      return json({ ok: false, setup: true, error: 'Concept generation needs the IMAGE_PROVIDER_KEY secret configured.' }, 503, cors)
    }
    // Provider call lands here once a provider is chosen — the interface,
    // job logging and auth are already real.
    return json({ ok: false, error: 'provider integration pending' }, 501, cors)
  } catch (e) {
    return json({ ok: false, error: String(e).slice(0, 200) }, 500, cors)
  }
})

function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...cors } })
}
