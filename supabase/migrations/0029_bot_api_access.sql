-- Issue a private integration key when a bot is approved. The raw key is available
-- to its seller only once; only its SHA-256 hash is retained for API authentication.
create table public.bot_api_keys (
  bot_id uuid primary key references public.bots (id) on delete cascade,
  key_hash text not null unique,
  key_prefix text not null,
  secret_once text,
  issued_at timestamptz not null default now(),
  revoked_at timestamptz
);
alter table public.bot_api_keys enable row level security;
revoke all on public.bot_api_keys from public, anon, authenticated, service_role;

-- digest() and gen_random_bytes() live in the "extensions" schema on Supabase.
create function public.issue_bot_api_key_on_moderation()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  v_key text;
begin
  if new.status = 'published' and old.status <> 'published' then
    v_key := 'bsk_' || encode(gen_random_bytes(32), 'hex');
    insert into public.bot_api_keys (bot_id, key_hash, key_prefix, secret_once, revoked_at)
    values (
      new.id,
      encode(digest(v_key, 'sha256'), 'hex'),
      left(v_key, 12),
      v_key,
      null
    )
    on conflict (bot_id) do update
    set key_hash = excluded.key_hash,
        key_prefix = excluded.key_prefix,
        secret_once = excluded.secret_once,
        issued_at = now(),
        revoked_at = null;
  elsif old.status = 'published' and new.status <> 'published' then
    update public.bot_api_keys
    set secret_once = null, revoked_at = now()
    where bot_id = new.id;
  end if;
  return new;
end $$;
revoke execute on function public.issue_bot_api_key_on_moderation()
  from public, anon, authenticated, service_role;

create trigger bots_issue_api_key_on_moderation
  after update of status on public.bots
  for each row execute function public.issue_bot_api_key_on_moderation();

-- One distinct key per already-published bot. MATERIALIZED makes the random key be generated
-- once per bot (not once per reference, and not once for all bots).
with new_keys as materialized (
  select b.id as bot_id, 'bsk_' || encode(gen_random_bytes(32), 'hex') as api_key
  from public.bots b
  where b.status = 'published'
)
insert into public.bot_api_keys (bot_id, key_hash, key_prefix, secret_once)
select bot_id, encode(digest(api_key, 'sha256'), 'hex'), left(api_key, 12), api_key
from new_keys;

-- Keys the seller has not confirmed yet. The app shows them in a window that cannot be closed
-- until the seller confirms the key was added to their bot, so the key survives page reloads.
create function public.pending_bot_api_keys()
returns table (bot_id uuid, title text, api_key text)
language sql stable security definer set search_path = public as $$
  select b.id, b.title, k.secret_once
  from public.bot_api_keys k
  join public.bots b on b.id = k.bot_id
  where b.seller_id = auth.uid()
    and b.status = 'published'
    and k.revoked_at is null
    and k.secret_once is not null
  order by k.issued_at;
$$;
revoke execute on function public.pending_bot_api_keys() from public, anon;
grant execute on function public.pending_bot_api_keys() to authenticated;

-- The seller confirms the key is in their bot: the raw key is erased, only its hash remains.
create function public.confirm_bot_api_key(p_bot uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  update public.bot_api_keys k
  set secret_once = null
  from public.bots b
  where k.bot_id = p_bot and b.id = k.bot_id and b.seller_id = auth.uid() and b.status = 'published';
  if not found then raise exception 'bot_not_found'; end if;
end $$;
revoke execute on function public.confirm_bot_api_key(uuid) from public, anon;
grant execute on function public.confirm_bot_api_key(uuid) to authenticated;

create function public.rotate_bot_api_key(p_bot uuid)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare
  v_key text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not exists (
    select 1 from public.bots
    where id = p_bot and seller_id = auth.uid() and status = 'published'
  ) then
    raise exception 'bot_not_found';
  end if;

  v_key := 'bsk_' || encode(gen_random_bytes(32), 'hex');
  update public.bot_api_keys
  set key_hash = encode(digest(v_key, 'sha256'), 'hex'),
      key_prefix = left(v_key, 12),
      secret_once = v_key,
      issued_at = now(),
      revoked_at = null
  where bot_id = p_bot;
  if not found then raise exception 'bot_not_found'; end if;
  return v_key;
end $$;
revoke execute on function public.rotate_bot_api_key(uuid) from public, anon;
grant execute on function public.rotate_bot_api_key(uuid) to authenticated;

create function public.check_bot_subscription_access(p_key_hash text, p_buyer uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_bot uuid;
  v_days integer;
  v_expires_at timestamptz;
begin
  select b.id into v_bot
  from public.bot_api_keys k
  join public.bots b on b.id = k.bot_id
  where k.key_hash = p_key_hash
    and k.revoked_at is null
    and b.status = 'published';
  if not found then
    return jsonb_build_object('error', 'invalid_api_key');
  end if;

  select o.subscription_days, o.subscription_expires_at
  into v_days, v_expires_at
  from public.orders o
  where o.bot_id = v_bot
    and o.buyer_id = p_buyer
    and o.status = 'paid'
    and (
      (o.subscription_days = 0 and o.subscription_expires_at is null)
      or o.subscription_expires_at > clock_timestamp()
    )
  order by o.subscription_expires_at desc nulls first, o.paid_at desc
  limit 1;

  if not found then
    return jsonb_build_object(
      'active', false,
      'subscription_days', null,
      'expires_at', null
    );
  end if;
  return jsonb_build_object(
    'active', true,
    'subscription_days', v_days,
    'expires_at', v_expires_at
  );
end $$;
revoke execute on function public.check_bot_subscription_access(text, uuid)
  from public, anon, authenticated;
grant execute on function public.check_bot_subscription_access(text, uuid) to service_role;
