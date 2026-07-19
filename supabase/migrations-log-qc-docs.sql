-- Dual-accountability QC: one checklist, both sides record their verdict.
create table if not exists public.qc_checks (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  owner uuid not null references auth.users(id) on delete cascade,
  item text not null,
  brand_status text not null default 'pending' check (brand_status in ('pending','pass','fail')),
  factory_status text not null default 'pending' check (factory_status in ('pending','pass','fail')),
  brand_note text,
  factory_note text,
  created_at timestamptz not null default now()
);
alter table public.qc_checks enable row level security;
drop policy if exists qc_own on public.qc_checks;
create policy qc_own on public.qc_checks for all to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());
revoke all on public.qc_checks from anon;

create or replace function public.factory_get_qc(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_invite public.order_invites;
begin
  select * into v_invite from public.order_invites where token = p_token and revoked_at is null;
  if v_invite.id is null then return null; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'item', item, 'brand_status', brand_status, 'factory_status', factory_status,
    'brand_note', brand_note, 'factory_note', factory_note, 'created_at', created_at) order by created_at), '[]'::jsonb)
    from public.qc_checks where order_id = v_invite.order_id);
end $$;

create or replace function public.factory_set_qc(p_token uuid, p_check uuid, p_status text, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_invite public.order_invites;
begin
  select * into v_invite from public.order_invites where token = p_token and revoked_at is null;
  if v_invite.id is null or p_status not in ('pending','pass','fail') then
    return jsonb_build_object('ok', false);
  end if;
  update public.qc_checks
     set factory_status = p_status,
         factory_note = coalesce(nullif(trim(p_note), ''), factory_note)
   where id = p_check and order_id = v_invite.order_id;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.factory_get_qc(uuid) from public;
revoke all on function public.factory_set_qc(uuid, uuid, text, text) from public;
grant execute on function public.factory_get_qc(uuid) to anon, authenticated;
grant execute on function public.factory_set_qc(uuid, uuid, text, text) to anon, authenticated;

-- Order documents: private bucket, owner-scoped paths.
create table if not exists public.order_documents (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  owner uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  filename text not null,
  size_bytes bigint,
  created_at timestamptz not null default now()
);
alter table public.order_documents enable row level security;
drop policy if exists order_docs_own on public.order_documents;
create policy order_docs_own on public.order_documents for all to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());
revoke all on public.order_documents from anon;

insert into storage.buckets (id, name, public) values ('order-docs','order-docs', false)
on conflict (id) do nothing;
drop policy if exists order_docs_rw on storage.objects;
create policy order_docs_rw on storage.objects for all to authenticated
  using (bucket_id = 'order-docs' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'order-docs' and (storage.foldername(name))[1] = auth.uid()::text);
