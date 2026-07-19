-- Milestone A.1: Concept-to-Production foundation
create table if not exists public.styles (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category text,
  status text not null default 'draft' check (status in ('draft','in_review','approved','archived')),
  start_method text check (start_method in ('describe','references','sketch','import','template')),
  description text,
  current_version integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.styles enable row level security;
drop policy if exists styles_own on public.styles;
create policy styles_own on public.styles for all to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());

create table if not exists public.style_sections (
  id uuid primary key default gen_random_uuid(),
  style_id uuid not null references public.styles(id) on delete cascade,
  owner uuid not null references auth.users(id) on delete cascade,
  section text not null,
  content jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (style_id, section)
);
alter table public.style_sections enable row level security;
drop policy if exists style_sections_own on public.style_sections;
create policy style_sections_own on public.style_sections for all to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());

create table if not exists public.style_images (
  id uuid primary key default gen_random_uuid(),
  style_id uuid not null references public.styles(id) on delete cascade,
  owner uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'reference' check (kind in ('reference','sketch','generated')),
  storage_path text not null,
  caption text,
  approved boolean not null default false,
  ai_generated boolean not null default false,
  generation_meta jsonb,
  created_at timestamptz not null default now()
);
alter table public.style_images enable row level security;
drop policy if exists style_images_own on public.style_images;
create policy style_images_own on public.style_images for all to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());

create table if not exists public.style_versions (
  id uuid primary key default gen_random_uuid(),
  style_id uuid not null references public.styles(id) on delete cascade,
  owner uuid not null references auth.users(id) on delete cascade,
  version integer not null,
  snapshot jsonb not null,
  note text,
  created_at timestamptz not null default now(),
  unique (style_id, version)
);
alter table public.style_versions enable row level security;
drop policy if exists style_versions_own on public.style_versions;
create policy style_versions_own on public.style_versions for all to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());

create table if not exists public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  style_id uuid not null references public.styles(id) on delete cascade,
  owner uuid not null references auth.users(id) on delete cascade,
  provider text,
  model text,
  prompt text,
  status text not null default 'queued' check (status in ('queued','running','done','failed','setup_required')),
  error text,
  created_at timestamptz not null default now()
);
alter table public.generation_jobs enable row level security;
drop policy if exists generation_jobs_own on public.generation_jobs;
create policy generation_jobs_own on public.generation_jobs for all to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());

-- Link sourcing requests to styles (pre-filled briefs)
alter table public.sourcing_requests add column if not exists style_id uuid references public.styles(id);
-- Link orders to styles (style -> production)
alter table public.orders add column if not exists style_id uuid references public.styles(id);

-- Private storage bucket for style imagery; owner-scoped by path prefix
insert into storage.buckets (id, name, public) values ('style-images','style-images', false)
on conflict (id) do nothing;
drop policy if exists style_img_rw on storage.objects;
create policy style_img_rw on storage.objects for all to authenticated
  using (bucket_id = 'style-images' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'style-images' and (storage.foldername(name))[1] = auth.uid()::text);
