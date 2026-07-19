create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  owner uuid not null references auth.users(id) on delete cascade,
  source text not null default 'brand' check (source in ('brand','factory')),
  factory_name text,
  quantity integer,
  unit_price numeric(12,2) not null,
  currency text not null default 'USD',
  lead_time_days integer,
  notes text,
  status text not null default 'open' check (status in ('open','accepted','declined')),
  created_at timestamptz not null default now()
);
alter table public.quotes enable row level security;
drop policy if exists quotes_own on public.quotes;
create policy quotes_own on public.quotes for all to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());
revoke all on public.quotes from anon;

create or replace function public.factory_submit_quote(
  p_token uuid, p_quantity integer, p_unit_price numeric, p_currency text,
  p_lead_time_days integer, p_notes text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_invite public.order_invites; v_order public.orders;
begin
  select * into v_invite from public.order_invites where token = p_token and revoked_at is null;
  if v_invite.id is null or p_unit_price is null or p_unit_price <= 0 then
    return jsonb_build_object('ok', false);
  end if;
  select * into v_order from public.orders where id = v_invite.order_id;
  insert into public.quotes (order_id, owner, source, factory_name, quantity, unit_price, currency, lead_time_days, notes)
  values (v_invite.order_id, v_invite.owner, 'factory', v_order.factory_name,
          p_quantity, p_unit_price, coalesce(nullif(trim(p_currency), ''), v_order.currency),
          p_lead_time_days, nullif(trim(p_notes), ''));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.factory_get_quotes(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_invite public.order_invites;
begin
  select * into v_invite from public.order_invites where token = p_token and revoked_at is null;
  if v_invite.id is null then return null; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'source', source, 'quantity', quantity, 'unit_price', unit_price,
    'currency', currency, 'lead_time_days', lead_time_days, 'notes', notes,
    'status', status, 'created_at', created_at) order by created_at), '[]'::jsonb)
    from public.quotes where order_id = v_invite.order_id);
end $$;

revoke all on function public.factory_submit_quote(uuid, integer, numeric, text, integer, text) from public;
revoke all on function public.factory_get_quotes(uuid) from public;
grant execute on function public.factory_submit_quote(uuid, integer, numeric, text, integer, text) to anon, authenticated;
grant execute on function public.factory_get_quotes(uuid) to anon, authenticated;
