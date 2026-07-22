-- WIP stages on production reports; components deduct at CUT only (once per unit)
alter table public.production_reports add column if not exists stage text not null default 'cut'
  check (stage in ('cut','sewn','finished','packed'));

create or replace function public.factory_report_production(p_token uuid, p_units integer, p_note text, p_stage text default 'cut')
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_invite public.order_invites; r record; v_stage text;
begin
  select * into v_invite from public.order_invites where token = p_token and revoked_at is null;
  v_stage := coalesce(nullif(trim(p_stage), ''), 'cut');
  if v_invite.id is null or p_units is null or p_units <= 0
     or v_stage not in ('cut','sewn','finished','packed') then
    return jsonb_build_object('ok', false);
  end if;
  insert into public.production_reports (order_id, owner, source, reported_by, units, note, stage)
  values (v_invite.order_id, v_invite.owner, 'factory', v_invite.accepted_by_name, p_units, nullif(trim(p_note), ''), v_stage);
  if v_stage = 'cut' then
    for r in select component_id, qty_per_unit from public.boms where order_id = v_invite.order_id loop
      update public.components set on_hand = greatest(0, on_hand - (r.qty_per_unit * p_units))
       where id = r.component_id;
    end loop;
  end if;
  return jsonb_build_object('ok', true);
end $$;
-- keep the old 3-arg signature working for any cached bundles
create or replace function public.factory_report_production(p_token uuid, p_units integer, p_note text)
returns jsonb language sql security definer set search_path = public as $$
  select public.factory_report_production(p_token, p_units, p_note, 'cut');
$$;
revoke all on function public.factory_report_production(uuid, integer, text, text) from public;
grant execute on function public.factory_report_production(uuid, integer, text, text) to anon, authenticated;

create or replace function public.factory_get_production(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_invite public.order_invites;
begin
  select * into v_invite from public.order_invites where token = p_token and revoked_at is null;
  if v_invite.id is null then return null; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
    'units', units, 'note', note, 'source', source, 'reported_by', reported_by,
    'stage', stage, 'created_at', created_at) order by created_at desc), '[]'::jsonb)
    from public.production_reports where order_id = v_invite.order_id);
end $$;

-- Open-to-buy: one budget per season
create table if not exists public.season_budgets (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id) on delete cascade,
  season text not null,
  budget numeric(14,2) not null,
  currency text not null default 'USD',
  created_at timestamptz not null default now(),
  unique (owner, season)
);
alter table public.season_budgets enable row level security;
drop policy if exists season_budgets_own on public.season_budgets;
create policy season_budgets_own on public.season_budgets for all to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());
revoke all on public.season_budgets from anon;

-- Document types
alter table public.order_documents add column if not exists doc_type text not null default 'other'
  check (doc_type in ('tech_pack','invoice','lab_dip','artwork','shipping','contract','other'));
