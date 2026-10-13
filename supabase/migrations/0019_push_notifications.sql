-- Browser push notifications (Web Push). The browser registers a subscription through
-- save_push_subscription(); database triggers call notify_user(), which posts the message and the
-- recipient's subscriptions to the site's /api/push endpoint (via pg_net). That endpoint, which
-- knows the VAPID private key, signs and delivers the push. The endpoint is protected by a shared
-- secret kept in push_config, which clients can never read.

create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------- config (locked)
create table public.push_config (
  id boolean primary key default true check (id),
  public_key text not null default '',
  secret text not null default '',
  endpoint_url text not null default 'https://bothub.work/api/push'
);
insert into public.push_config default values;
alter table public.push_config enable row level security;
revoke all on public.push_config from anon, authenticated;

-- The VAPID public key is not secret; the browser needs it to subscribe.
create function public.get_push_public_key() returns text
language sql stable security definer set search_path = public as $$
  select nullif(public_key, '') from public.push_config;
$$;
revoke execute on function public.get_push_public_key() from public, anon;
grant execute on function public.get_push_public_key() to authenticated;

-- ---------------------------------------------------------------- subscriptions
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;

create function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_endpoint !~ '^https://' then raise exception 'invalid_subscription'; end if;
  -- A device keeps one subscription; re-subscribing as another user moves it.
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
  -- At most 10 devices per user: drop the oldest ones.
  delete from public.push_subscriptions
  where user_id = auth.uid()
    and id not in (
      select id from public.push_subscriptions where user_id = auth.uid()
      order by created_at desc limit 10
    );
end $$;

create function public.delete_push_subscription(p_endpoint text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
end $$;

revoke execute on function
  public.save_push_subscription(text, text, text), public.delete_push_subscription(text)
from public, anon;
grant execute on function
  public.save_push_subscription(text, text, text), public.delete_push_subscription(text)
to authenticated;

-- ---------------------------------------------------------------- sending
-- Never raises: a failed notification must not roll back the sale or message that caused it.
create function public.notify_user(p_user uuid, p_title text, p_body text, p_url text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_cfg public.push_config;
  v_subs jsonb;
begin
  select * into v_cfg from public.push_config;
  if v_cfg.secret = '' or v_cfg.public_key = '' then return; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'endpoint', s.endpoint, 'keys', jsonb_build_object('p256dh', s.p256dh, 'auth', s.auth)
         )), '[]'::jsonb)
  into v_subs from public.push_subscriptions s where s.user_id = p_user;
  if jsonb_array_length(v_subs) = 0 then return; end if;
  perform net.http_post(
    url := v_cfg.endpoint_url,
    body := jsonb_build_object(
      'title', left(p_title, 80), 'body', left(p_body, 200), 'url', p_url, 'subscriptions', v_subs
    ),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_cfg.secret),
    timeout_milliseconds := 5000
  );
exception when others then
  null;
end $$;
revoke execute on function public.notify_user(uuid, text, text, text) from public, anon, authenticated;

create function public.notify_admins(p_title text, p_body text, p_url text)
returns void language plpgsql security definer set search_path = public as $$
declare v_admin uuid;
begin
  for v_admin in select id from public.profiles where role = 'admin' loop
    perform public.notify_user(v_admin, p_title, p_body, p_url);
  end loop;
end $$;
revoke execute on function public.notify_admins(text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- triggers
create function public.tg_notify_order() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.notify_user(new.seller_id, 'Yangi buyurtma',
      new.bot_title || ' — ' || new.amount || ' so‘m', '/seller-orders');
  elsif new.status = 'paid' and old.status is distinct from 'paid' then
    perform public.notify_user(new.seller_id, 'Yangi sotuv!',
      new.bot_title || ' — ' || new.amount || ' so‘m to‘landi', '/seller-orders');
    perform public.notify_user(new.buyer_id, 'To‘lov tasdiqlandi',
      new.bot_title || ' buyurtmangiz faollashdi', '/dashboard/purchases');
  end if;
  return null;
end $$;
create trigger orders_notify after insert or update of status on public.orders
  for each row execute function public.tg_notify_order();

create function public.tg_notify_crypto() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'submitted' and old.status is distinct from 'submitted' then
    perform public.notify_admins('USDT to‘lov tekshirilishi kerak',
      new.amount_usdt || ' USDT', '/admin?tab=orders');
  end if;
  return null;
end $$;
create trigger crypto_payments_notify after update of status on public.crypto_payments
  for each row execute function public.tg_notify_crypto();

create function public.tg_notify_bot() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'pending' then
    perform public.notify_admins('Yangi bot moderatsiyada', new.title, '/admin?tab=bots');
  end if;
  return null;
end $$;
create trigger bots_notify after insert on public.bots
  for each row execute function public.tg_notify_bot();

create function public.tg_notify_withdrawal() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_admins('Yangi yechish so‘rovi', new.amount || ' so‘m', '/admin?tab=withdrawals');
  return null;
end $$;
create trigger withdrawals_notify after insert on public.withdrawals
  for each row execute function public.tg_notify_withdrawal();

create function public.tg_notify_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_conv public.conversations;
begin
  select * into v_conv from public.conversations where id = new.conversation_id;
  if found then
    perform public.notify_user(
      case when new.sender_id = v_conv.buyer_id then v_conv.seller_id else v_conv.buyer_id end,
      'Yangi xabar', left(new.body, 120), '/messages?c=' || v_conv.id);
  end if;
  return null;
end $$;
create trigger messages_notify after insert on public.messages
  for each row execute function public.tg_notify_message();

create function public.tg_notify_support() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.from_staff then
    perform public.notify_user(new.thread_user_id, 'Yordam xizmatidan javob', left(new.body, 120),
      '/support-chat');
  else
    perform public.notify_admins('Yangi murojaat', left(new.body, 120), '/admin?tab=support');
  end if;
  return null;
end $$;
create trigger support_messages_notify after insert on public.support_messages
  for each row execute function public.tg_notify_support();
