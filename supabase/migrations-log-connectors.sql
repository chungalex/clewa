-- The connector framework: one honest home for every future integration.
-- Providers are reference data; connections are per-user with server-side-only
-- token storage (tokens will live in edge-function-accessible vault columns,
-- never exposed through RLS selects).
create table if not exists public.integration_providers (
  key text primary key,
  name text not null,
  category text not null,
  tier integer not null default 1,
  status text not null default 'coming_later'
    check (status in ('available','setup_required','coming_later')),
  blurb text
);
alter table public.integration_providers enable row level security;
drop policy if exists providers_read on public.integration_providers;
create policy providers_read on public.integration_providers for select to authenticated using (true);
revoke insert, update, delete on public.integration_providers from authenticated;
revoke all on public.integration_providers from anon;

insert into public.integration_providers (key, name, category, tier, status, blurb) values
 ('shopify', 'Shopify', 'Commerce', 1, 'setup_required', 'Sell-through in, incoming production out — powers reorder intelligence. Needs a Shopify app credential.'),
 ('gmail', 'Gmail', 'Communication', 1, 'coming_later', 'Attach factory emails to orders; proposed terms extracted as drafts you confirm. Requires Google restricted-scope review.'),
 ('outlook', 'Outlook', 'Communication', 1, 'coming_later', 'Same email bridge, Microsoft side.'),
 ('whatsapp', 'WhatsApp Business', 'Communication', 1, 'coming_later', 'Conversation import first; full API when Meta business verification is done.'),
 ('gdrive', 'Google Drive', 'Files', 1, 'coming_later', 'Tech packs and artwork attach from Drive; Clewa stays the source of truth.'),
 ('gcal', 'Google Calendar', 'Time', 1, 'coming_later', 'Milestones and factory closures on your own calendar.'),
 ('quickbooks', 'QuickBooks', 'Finance', 2, 'coming_later', 'POs and bills reconciled against the record.'),
 ('xero', 'Xero', 'Finance', 2, 'coming_later', 'Same reconciliation, Xero side.'),
 ('canva', 'Canva', 'Design', 2, 'coming_later', 'Approved artwork, labels and line sheets versioned onto styles.'),
 ('slack', 'Slack', 'Communication', 2, 'coming_later', 'Order events where your team already lives.'),
 ('shipping', 'Shipping & tracking', 'Logistics', 3, 'coming_later', 'Tracking numbers become delivery events on the order.'),
 ('api', 'Clewa API & webhooks', 'Platform', 3, 'coming_later', 'Your data, programmatically — the export promise, automated.')
on conflict (key) do update set name = excluded.name, category = excluded.category,
  tier = excluded.tier, status = excluded.status, blurb = excluded.blurb;

create table if not exists public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id) on delete cascade,
  provider_key text not null references public.integration_providers(key),
  status text not null default 'pending' check (status in ('pending','connected','error','revoked')),
  external_account text,
  last_sync_at timestamptz,
  sync_note text,
  created_at timestamptz not null default now(),
  unique (owner, provider_key)
);
alter table public.integration_connections enable row level security;
drop policy if exists connections_own on public.integration_connections;
create policy connections_own on public.integration_connections for all to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());
revoke all on public.integration_connections from anon;
notify pgrst, 'reload schema';
