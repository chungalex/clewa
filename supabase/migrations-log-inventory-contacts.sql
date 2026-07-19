-- Finished goods
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id) on delete cascade,
  name text not null,
  sku text,
  on_hand integer not null default 0,
  weekly_sales numeric(10,2) not null default 0,
  safety_stock integer not null default 0,
  order_id uuid references public.orders(id),
  created_at timestamptz not null default now()
);
alter table public.products enable row level security;
drop policy if exists products_own on public.products;
create policy products_own on public.products for all to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());
revoke all on public.products from anon;

-- Components & materials
create table if not exists public.components (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id) on delete cascade,
  name text not null,
  unit text not null default 'pcs',
  on_hand numeric(12,2) not null default 0,
  on_order numeric(12,2) not null default 0,
  location text,
  created_at timestamptz not null default now()
);
alter table public.components enable row level security;
drop policy if exists components_own on public.components;
create policy components_own on public.components for all to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());
revoke all on public.components from anon;

-- Recipe: what one unit of an order consumes
create table if not exists public.boms (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  component_id uuid not null references public.components(id) on delete cascade,
  qty_per_unit numeric(12,4) not null,
  unique (order_id, component_id)
);
alter table public.boms enable row level security;
drop policy if exists boms_own on public.boms;
create policy boms_own on public.boms for all to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());
revoke all on public.boms from anon;

-- Production reports: factory says "N units sewn" -> components auto-deduct
create table if not exists public.production_reports (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  owner uuid not null references auth.users(id) on delete cascade,
  source text not null default 'brand' check (source in ('brand','factory')),
  reported_by text,
  units integer not null check (units > 0),
  note text,
  created_at timestamptz not null default now()
);
alter table public.production_reports enable row level security;
drop policy if exists prod_reports_own on public.production_reports;
create policy prod_reports_own on public.production_reports for all to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());
revoke all on public.production_reports from anon;

-- Factory reports progress from their link; BOM components deduct automatically.
create or replace function public.factory_report_production(p_token uuid, p_units integer, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_invite public.order_invites; r record;
begin
  select * into v_invite from public.order_invites where token = p_token and revoked_at is null;
  if v_invite.id is null or p_units is null or p_units <= 0 then
    return jsonb_build_object('ok', false);
  end if;
  insert into public.production_reports (order_id, owner, source, reported_by, units, note)
  values (v_invite.order_id, v_invite.owner, 'factory', v_invite.accepted_by_name, p_units, nullif(trim(p_note), ''));
  for r in select component_id, qty_per_unit from public.boms where order_id = v_invite.order_id loop
    update public.components
       set on_hand = greatest(0, on_hand - (r.qty_per_unit * p_units))
     where id = r.component_id;
  end loop;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.factory_get_production(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_invite public.order_invites;
begin
  select * into v_invite from public.order_invites where token = p_token and revoked_at is null;
  if v_invite.id is null then return null; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
    'units', units, 'note', note, 'source', source, 'reported_by', reported_by,
    'created_at', created_at) order by created_at desc), '[]'::jsonb)
    from public.production_reports where order_id = v_invite.order_id);
end $$;

revoke all on function public.factory_report_production(uuid, integer, text) from public;
revoke all on function public.factory_get_production(uuid) from public;
grant execute on function public.factory_report_production(uuid, integer, text) to anon, authenticated;
grant execute on function public.factory_get_production(uuid) to anon, authenticated;

-- Factory rolodex
create table if not exists public.factories (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id) on delete cascade,
  name text not null,
  country text,
  specialty text,
  moq text,
  key_person text,
  languages text,
  certifications text,
  notes text,
  created_at timestamptz not null default now()
);
alter table public.factories enable row level security;
drop policy if exists factories_own on public.factories;
create policy factories_own on public.factories for all to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());
revoke all on public.factories from anon;
