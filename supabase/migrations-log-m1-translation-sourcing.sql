-- Translation foundation: original stays immutable in body; translation lives alongside.
alter table public.order_messages
  add column if not exists source_lang text,
  add column if not exists translated_body text,
  add column if not exists translated_lang text,
  add column if not exists translation_status text not null default 'none'
    check (translation_status in ('none','pending','done','failed')),
  add column if not exists translation_meta jsonb;

-- Factory contact's preferred language lives on the invite.
alter table public.order_invites
  add column if not exists language text;

-- Sourcing intake: public insert-only brief, internal pipeline fields.
create table if not exists public.sourcing_requests (
  id uuid primary key default gen_random_uuid(),
  brand_name text not null,
  contact_name text,
  email text not null,
  links text,
  product_category text,
  product_description text,
  target_quantity text,
  target_cost text,
  target_retail text,
  target_region text,
  certifications text,
  materials text,
  dev_stage text,
  target_delivery text,
  has_produced_before text,
  main_challenges text,
  budget_readiness text,
  consent boolean not null default false,
  -- internal pipeline
  status text not null default 'new' check (status in
    ('new','reviewing','discovery_call','brief_confirmed','factory_search',
     'shortlist','sampling','production','won','lost')),
  internal_notes text,
  next_action text,
  follow_up_date date,
  owner_email text,
  created_at timestamptz not null default now()
);
alter table public.sourcing_requests enable row level security;
drop policy if exists sourcing_public_insert on public.sourcing_requests;
create policy sourcing_public_insert on public.sourcing_requests
  for insert to anon with check (consent = true);
revoke select, update, delete on public.sourcing_requests from anon;
-- Only the Clewa team (Alex) can read/manage the pipeline.
drop policy if exists sourcing_admin on public.sourcing_requests;
create policy sourcing_admin on public.sourcing_requests
  for all to authenticated
  using ((auth.jwt() ->> 'email') = 'chungalexvo@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'chungalexvo@gmail.com');
