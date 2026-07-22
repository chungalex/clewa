-- Sample photos: public-read bucket (unguessable paths), brand uploads, factory views
insert into storage.buckets (id, name, public) values ('sample-photos','sample-photos', true)
on conflict (id) do nothing;
drop policy if exists sample_photos_rw on storage.objects;
create policy sample_photos_rw on storage.objects for all to authenticated
  using (bucket_id = 'sample-photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'sample-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create table if not exists public.sample_photos (
  id uuid primary key default gen_random_uuid(),
  sample_id uuid not null references public.samples(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  owner uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  caption text,
  created_at timestamptz not null default now()
);
alter table public.sample_photos enable row level security;
drop policy if exists sample_photos_own on public.sample_photos;
create policy sample_photos_own on public.sample_photos for all to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());
revoke all on public.sample_photos from anon;

create or replace function public.factory_get_samples(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_invite public.order_invites;
begin
  select * into v_invite from public.order_invites where token = p_token and revoked_at is null;
  if v_invite.id is null then return null; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id, 'round', s.round, 'kind', s.kind, 'status', s.status,
    'brand_note', s.brand_note, 'factory_note', s.factory_note,
    'decided_at', s.decided_at, 'created_at', s.created_at,
    'photos', (select coalesce(jsonb_agg(jsonb_build_object('path', sp.storage_path, 'caption', sp.caption)), '[]'::jsonb)
               from public.sample_photos sp where sp.sample_id = s.id)
    ) order by s.round), '[]'::jsonb)
    from public.samples s where s.order_id = v_invite.order_id);
end $$;

-- FX snapshot locked at quote-accept
alter table public.orders
  add column if not exists fx_rate numeric(12,6),
  add column if not exists fx_base text,
  add column if not exists fx_captured_at timestamptz;

notify pgrst, 'reload schema';
