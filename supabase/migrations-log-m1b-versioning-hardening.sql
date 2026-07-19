-- Record versioning: a revised line supersedes its predecessor; history is permanent.
alter table public.record_lines add column if not exists superseded_by uuid references public.record_lines(id);

-- Invite hardening: revocation.
alter table public.order_invites add column if not exists revoked_at timestamptz;

-- All factory RPCs must reject revoked invites.
create or replace function public.factory_get_order(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_invite public.order_invites;
  v_order public.orders;
  v_brand text;
  v_lines jsonb;
begin
  select * into v_invite from public.order_invites where token = p_token and revoked_at is null;
  if v_invite.id is null then return null; end if;
  select * into v_order from public.orders where id = v_invite.order_id;
  select coalesce(brand_name, 'The brand') into v_brand from public.profiles where id = v_invite.owner;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'category', category, 'content', content,
    'brand_signed_at', brand_signed_at, 'factory_signed_at', factory_signed_at,
    'superseded_by', superseded_by, 'created_at', created_at) order by created_at), '[]'::jsonb)
    into v_lines from public.record_lines where order_id = v_order.id;
  return jsonb_build_object(
    'brand', v_brand, 'accepted_at', v_invite.accepted_at,
    'accepted_by_name', v_invite.accepted_by_name, 'language', v_invite.language,
    'order', jsonb_build_object(
      'name', v_order.name, 'quantity', v_order.quantity,
      'unit_price', v_order.unit_price, 'currency', v_order.currency,
      'stage', v_order.stage, 'ship_by', v_order.ship_by),
    'lines', v_lines);
end $$;

create or replace function public.factory_accept(p_token uuid, p_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.order_invites
     set accepted_at = coalesce(accepted_at, now()),
         accepted_by_name = coalesce(nullif(trim(p_name), ''), accepted_by_name)
   where token = p_token and revoked_at is null;
end $$;

create or replace function public.factory_confirm_line(p_token uuid, p_line uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_invite public.order_invites;
begin
  select * into v_invite from public.order_invites where token = p_token and revoked_at is null;
  if v_invite.id is null then return jsonb_build_object('ok', false); end if;
  update public.record_lines
     set factory_signed_at = now()
   where id = p_line and order_id = v_invite.order_id
     and factory_signed_at is null and superseded_by is null;
  update public.order_invites set accepted_at = coalesce(accepted_at, now()) where id = v_invite.id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.factory_get_messages(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_invite public.order_invites;
begin
  select * into v_invite from public.order_invites where token = p_token and revoked_at is null;
  if v_invite.id is null then return null; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'sender', sender, 'sender_name', sender_name, 'body', body,
    'translated_body', translated_body, 'translated_lang', translated_lang,
    'translation_status', translation_status, 'created_at', created_at) order by created_at), '[]'::jsonb)
    from public.order_messages where order_id = v_invite.order_id);
end $$;

create or replace function public.factory_send_message(p_token uuid, p_name text, p_body text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_invite public.order_invites;
  v_id uuid;
begin
  select * into v_invite from public.order_invites where token = p_token and revoked_at is null;
  if v_invite.id is null or coalesce(trim(p_body), '') = '' then
    return jsonb_build_object('ok', false);
  end if;
  insert into public.order_messages (order_id, owner, sender, sender_name, body)
  values (v_invite.order_id, v_invite.owner, 'factory', nullif(trim(p_name), ''), trim(p_body))
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.factory_get_samples(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_invite public.order_invites;
begin
  select * into v_invite from public.order_invites where token = p_token and revoked_at is null;
  if v_invite.id is null then return null; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'round', round, 'kind', kind, 'status', status,
    'brand_note', brand_note, 'factory_note', factory_note,
    'decided_at', decided_at, 'created_at', created_at) order by round), '[]'::jsonb)
    from public.samples where order_id = v_invite.order_id);
end $$;

create or replace function public.factory_submit_sample(p_token uuid, p_sample uuid, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_invite public.order_invites;
begin
  select * into v_invite from public.order_invites where token = p_token and revoked_at is null;
  if v_invite.id is null then return jsonb_build_object('ok', false); end if;
  update public.samples
     set status = 'submitted', factory_note = coalesce(nullif(trim(p_note), ''), factory_note)
   where id = p_sample and order_id = v_invite.order_id and status in ('requested','changes');
  return jsonb_build_object('ok', true);
end $$;
