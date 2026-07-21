create table if not exists public.planning_items (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id) on delete cascade,
  season text not null,
  name text not null,
  style_id uuid references public.styles(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  planned_qty integer,
  target_cost numeric(12,2),
  target_retail numeric(12,2),
  currency text not null default 'USD',
  status text not null default 'planned' check (status in ('planned','in_development','ordered','dropped')),
  created_at timestamptz not null default now()
);
alter table public.planning_items enable row level security;
drop policy if exists planning_own on public.planning_items;
create policy planning_own on public.planning_items for all to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());
revoke all on public.planning_items from anon;
