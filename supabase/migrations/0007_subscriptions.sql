-- Bot subscriptions replace one-time bot-file sales. Sellers set 1/7/30-day prices and
-- connect their service to the signed webhook events below.

alter table public.bots
  add column price_7_days bigint check (price_7_days is null or price_7_days > 0),
  add column price_30_days bigint check (price_30_days is null or price_30_days > 0);

alter table public.orders
  add column subscription_days integer not null default 1 check (subscription_days in (1, 7, 30)),
  add column terms_accepted_at timestamptz,
  add column terms_version text,
  add column paid_at timestamptz,
  add column subscription_expires_at timestamptz,
  add column refund_requested_at timestamptz,
  add column refund_reason text,
  add column refund_resolved_at timestamptz,
  add column refund_resolution text check (refund_resolution in ('refunded', 'rejected'));

update public.orders o
set paid_at = coalesce(pt.performed_at, o.updated_at),
    subscription_expires_at = coalesce(pt.performed_at, o.updated_at) + interval '1 day'
from public.payment_transactions pt
where pt.order_id = o.id and pt.state = 2 and o.status in ('paid', 'delivering', 'done');

update public.orders
set paid_at = updated_at,
    subscription_expires_at = updated_at + interval '1 day'
where status in ('paid', 'delivering', 'done') and paid_at is null;

create or replace function public.admin_set_order_status(
  p_order uuid, p_status public.order_status
) returns void language plpgsql security definer set search_path = public as $$
declare v_order public.orders;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  select * into v_order from public.orders where id = p_order for update;
  if not found then raise exception 'order_not_found'; end if;

  if v_order.status = 'pending_payment' and p_status = 'paid' then
    if v_order.terms_accepted_at is null then raise exception 'terms_not_accepted'; end if;
    update public.orders
    set status = 'paid', paid_at = now(),
        subscription_expires_at = now() + make_interval(days => subscription_days),
        updated_at = now()
    where id = p_order;
  elsif v_order.status = 'pending_payment' and p_status = 'cancelled' then
    update public.orders set status = 'cancelled', updated_at = now() where id = p_order;
  else
    raise exception 'invalid_transition';
  end if;
end $$;

create or replace function public.seller_advance_order(
  p_order uuid, p_status public.order_status
) returns public.orders language plpgsql security definer set search_path = public as $$
begin
  raise exception 'subscription_orders_do_not_use_delivery_states';
end $$;

create table public.subscription_webhook_outbox (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  event text not null check (event in (
    'subscription.activated',
    'subscription.expired',
    'subscription.refund_requested',
    'subscription.refunded',
    'subscription.reactivated'
  )),
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'sending', 'delivered', 'failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (order_id, event)
);
create index subscription_webhook_outbox_due_idx
  on public.subscription_webhook_outbox (next_attempt_at, created_at)
  where status in ('pending', 'sending');
alter table public.subscription_webhook_outbox enable row level security;
revoke all on public.subscription_webhook_outbox from public, anon, authenticated;
grant all on public.subscription_webhook_outbox to service_role;

create table public.bot_subscription_webhooks (
  bot_id uuid primary key references public.bots (id) on delete cascade,
  endpoint_url text not null,
  signing_secret text not null,
  updated_at timestamptz not null default now()
);
alter table public.bot_subscription_webhooks enable row level security;
revoke all on public.bot_subscription_webhooks from public, anon, authenticated;
grant all on public.bot_subscription_webhooks to service_role;

create function public.set_bot_subscription_webhook(
  p_bot uuid, p_url text, p_secret text
) returns void language plpgsql security definer set search_path = public as $$
declare v_host text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if length(coalesce(p_secret, '')) < 32 then raise exception 'webhook_secret_too_short'; end if;
  if p_url !~ '^https://' or length(p_url) > 2048 then raise exception 'invalid_webhook_url'; end if;
  v_host := lower(split_part(split_part(p_url, '://', 2), '/', 1));
  if v_host = '' or v_host like '%@%' or v_host like '[%'
     or v_host in ('localhost', '127.0.0.1', '::1')
     or v_host ~ '^(0[.]|10[.]|100[.](6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])[.]|127[.]|169[.]254[.]|192[.]168[.]|172[.](1[6-9]|2[0-9]|3[01])[.]|224[.])'
     or v_host like '%.local' then
    raise exception 'invalid_webhook_url';
  end if;
  if not exists (select 1 from public.bots where id = p_bot and seller_id = auth.uid()) then
    raise exception 'bot_not_found';
  end if;
  insert into public.bot_subscription_webhooks (bot_id, endpoint_url, signing_secret)
  values (p_bot, p_url, p_secret)
  on conflict (bot_id) do update
  set endpoint_url = excluded.endpoint_url,
      signing_secret = excluded.signing_secret,
      updated_at = now();
end $$;

revoke execute on function public.set_bot_subscription_webhook(uuid, text, text) from public, anon;
grant execute on function public.set_bot_subscription_webhook(uuid, text, text) to authenticated;

create function public.create_sponsored_bot(
  p_title text, p_description text, p_category text,
  p_price_1_day bigint, p_price_7_days bigint, p_price_30_days bigint,
  p_webhook_url text, p_webhook_secret text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not exists (
    select 1 from public.profiles where id = auth.uid() and role = 'seller'
  ) then raise exception 'not_a_seller'; end if;
  if p_price_1_day <= 0 or p_price_7_days <= 0 or p_price_30_days <= 0 then
    raise exception 'invalid_subscription_price';
  end if;
  insert into public.bots (seller_id, title, description, price, price_7_days, price_30_days, category)
  values (
    auth.uid(), btrim(p_title), btrim(p_description), p_price_1_day,
    p_price_7_days, p_price_30_days, p_category
  ) returning id into v_id;
  perform public.set_bot_subscription_webhook(v_id, p_webhook_url, p_webhook_secret);
  return v_id;
end $$;
revoke execute on function public.create_sponsored_bot(text, text, text, bigint, bigint, bigint, text, text)
  from public, anon;
grant execute on function public.create_sponsored_bot(text, text, text, bigint, bigint, bigint, text, text)
  to authenticated;

create function public.configure_bot_subscription(
  p_bot uuid, p_price_1_day bigint, p_price_7_days bigint, p_price_30_days bigint,
  p_webhook_url text, p_webhook_secret text
) returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_price_1_day <= 0 or p_price_7_days <= 0 or p_price_30_days <= 0 then
    raise exception 'invalid_subscription_price';
  end if;
  update public.bots set price = p_price_1_day, price_7_days = p_price_7_days,
    price_30_days = p_price_30_days
  where id = p_bot and seller_id = auth.uid();
  if not found then raise exception 'bot_not_found'; end if;
  perform public.set_bot_subscription_webhook(p_bot, p_webhook_url, p_webhook_secret);
end $$;
revoke execute on function public.configure_bot_subscription(uuid, bigint, bigint, bigint, text, text)
  from public, anon;
grant execute on function public.configure_bot_subscription(uuid, bigint, bigint, bigint, text, text)
  to authenticated;

create function public.create_order(p_bot_id uuid, p_subscription_days integer)
returns public.orders language plpgsql security definer set search_path = public as $$
declare
  v_bot public.bots;
  v_amount bigint;
  v_order public.orders;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_subscription_days not in (1, 7, 30) then raise exception 'invalid_subscription'; end if;
  select * into v_bot from public.bots where id = p_bot_id and status = 'published';
  if not found then raise exception 'bot_not_found'; end if;
  if v_bot.seller_id = auth.uid() then raise exception 'own_bot'; end if;
  if not exists (select 1 from public.bot_subscription_webhooks where bot_id = v_bot.id) then
    raise exception 'subscription_not_configured';
  end if;
  v_amount := case p_subscription_days
    when 1 then v_bot.price
    when 7 then v_bot.price_7_days
    when 30 then v_bot.price_30_days
  end;
  if v_amount is null or v_amount <= 0 then raise exception 'subscription_unavailable'; end if;

  select * into v_order from public.orders
  where bot_id = p_bot_id and buyer_id = auth.uid()
    and status = 'pending_payment' and subscription_days = p_subscription_days;
  if found then
    update public.orders
    set amount = v_amount, bot_title = v_bot.title, seller_id = v_bot.seller_id, updated_at = now()
    where id = v_order.id returning * into v_order;
    return v_order;
  end if;

  insert into public.orders (
    bot_id, bot_title, buyer_id, seller_id, amount, subscription_days
  ) values (
    v_bot.id, v_bot.title, auth.uid(), v_bot.seller_id, v_amount, p_subscription_days
  ) returning * into v_order;
  return v_order;
end $$;

drop function public.create_order(uuid);
revoke execute on function public.create_order(uuid, integer) from public, anon;
grant execute on function public.create_order(uuid, integer) to authenticated;

create function public.accept_subscription_terms(p_order uuid, p_version text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_version <> '2026-10-11' then raise exception 'terms_version_invalid'; end if;
  update public.orders
  set terms_accepted_at = now(), terms_version = p_version
  where id = p_order and buyer_id = auth.uid() and status = 'pending_payment';
  if not found then raise exception 'order_not_found'; end if;
end $$;
revoke execute on function public.accept_subscription_terms(uuid, text) from public, anon;
grant execute on function public.accept_subscription_terms(uuid, text) to authenticated;

create function public.request_subscription_refund(p_order uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_order public.orders;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into v_order from public.orders
  where id = p_order and buyer_id = auth.uid() for update;
  if not found then raise exception 'order_not_found'; end if;
  if v_order.status <> 'paid' or v_order.paid_at is null then
    raise exception 'refund_not_available';
  end if;
  if clock_timestamp() > v_order.paid_at + interval '24 hours' then
    raise exception 'refund_window_expired';
  end if;
  if v_order.refund_requested_at is not null then raise exception 'refund_already_requested'; end if;
  if length(btrim(coalesce(p_reason, ''))) not between 3 and 1000 then
    raise exception 'invalid_refund_reason';
  end if;

  update public.orders
  set refund_requested_at = now(), refund_reason = btrim(p_reason), updated_at = now()
  where id = p_order;
  insert into public.support_messages (thread_user_id, sender_id, from_staff, body)
  values (
    auth.uid(), auth.uid(), false,
    'Obunani qaytarish so‘rovi · ' || coalesce(v_order.bot_title, 'Bot') || E'\\n' ||
    btrim(p_reason) || E'\\nBuyurtma: ' || p_order::text
  );
end $$;
revoke execute on function public.request_subscription_refund(uuid, text) from public, anon;
grant execute on function public.request_subscription_refund(uuid, text) to authenticated;

create function public.admin_complete_subscription_refund(p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.orders
  set status = 'cancelled', refund_resolution = 'refunded',
      refund_resolved_at = now(), updated_at = now()
  where id = p_order and status = 'paid'
    and refund_requested_at is not null and refund_resolution is null;
  if not found then raise exception 'refund_not_available'; end if;
  update public.payment_transactions
  set state = -2, reason = 5, cancelled_at = now()
  where order_id = p_order and state = 2;
end $$;
revoke execute on function public.admin_complete_subscription_refund(uuid) from public, anon;
grant execute on function public.admin_complete_subscription_refund(uuid) to authenticated;

create function public.admin_reject_subscription_refund(p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.orders
  set refund_resolution = 'rejected', refund_resolved_at = now(), updated_at = now()
  where id = p_order and status = 'paid'
    and refund_requested_at is not null and refund_resolution is null;
  if not found then raise exception 'refund_not_available'; end if;
end $$;
revoke execute on function public.admin_reject_subscription_refund(uuid) from public, anon;
grant execute on function public.admin_reject_subscription_refund(uuid) to authenticated;

create or replace function public.wallet_totals(p_seller uuid)
returns table (earned bigint, withdrawn bigint, balance bigint)
language sql stable security definer set search_path = public as $$
  with e as (
    select coalesce(sum(o.amount - round(o.amount * 0.15)::bigint), 0)::bigint as v
    from public.orders o
    where o.seller_id = p_seller
      and o.status in ('paid', 'delivering', 'done')
      and o.paid_at <= now() - interval '24 hours'
      and (o.refund_requested_at is null or o.refund_resolution = 'rejected')
  ), w as (
    select coalesce(sum(amount), 0)::bigint as v from public.withdrawals
    where seller_id = p_seller and status <> 'rejected'
  )
  select e.v, w.v, e.v - w.v from e, w;
$$;
revoke all on function public.wallet_totals(uuid) from public, anon, authenticated;

drop function public.my_bots();
create function public.my_bots()
returns table (
  id uuid, title text, description text, price bigint, category text, status public.bot_status,
  views integer, sales integer, earned bigint, created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select b.id, b.title, b.description, b.price, b.category, b.status, b.views,
         coalesce(s.sales, 0)::int, coalesce(s.earned, 0)::bigint, b.created_at
  from public.bots b
  left join lateral (
    select
      count(*) filter (where o.status in ('paid', 'delivering', 'done')) as sales,
      sum(o.amount - round(o.amount * 0.15)::bigint) filter (
        where o.status in ('paid', 'delivering', 'done')
          and o.paid_at <= now() - interval '24 hours'
          and (o.refund_requested_at is null or o.refund_resolution = 'rejected')
      ) as earned
    from public.orders o
    where o.bot_id = b.id
  ) s on true
  where b.seller_id = auth.uid()
  order by b.created_at desc;
$$;
revoke execute on function public.my_bots() from public, anon;
grant execute on function public.my_bots() to authenticated;

create or replace function public.request_withdrawal(p_amount bigint, p_card text, p_holder text)
returns public.withdrawals
language plpgsql security definer set search_path = public as $$
declare
  c_min constant bigint := 100000;
  v_card text := regexp_replace(coalesce(p_card, ''), '\s', '', 'g');
  v_balance bigint;
  v_fee bigint;
  v_row public.withdrawals;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  perform 1 from public.profiles where id = auth.uid() and role = 'seller' for update;
  if not found then raise exception 'not_a_seller'; end if;
  if v_card !~ '^[0-9]{16}$' then raise exception 'invalid_card'; end if;
  if p_amount is null or p_amount < c_min then raise exception 'amount_too_small'; end if;
  select t.balance into v_balance from public.wallet_totals(auth.uid()) t;
  if p_amount > greatest(0, v_balance) then raise exception 'amount_exceeds_available'; end if;

  v_fee := round(p_amount * 0.03);
  insert into public.withdrawals (seller_id, amount, fee, payout, card_number, card_holder)
  values (auth.uid(), p_amount, v_fee, p_amount - v_fee, v_card, btrim(p_holder))
  returning * into v_row;
  return v_row;
end $$;
revoke execute on function public.request_withdrawal(bigint, text, text) from public, anon;
grant execute on function public.request_withdrawal(bigint, text, text) to authenticated;

create or replace function public.payme_check_perform(p_order uuid, p_amount_tiyin bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order;
  if not found then return jsonb_build_object('error', 'order_not_found'); end if;
  if v_order.status <> 'pending_payment' then return jsonb_build_object('error', 'order_not_payable'); end if;
  if v_order.terms_accepted_at is null then return jsonb_build_object('error', 'terms_not_accepted'); end if;
  if v_order.amount * 100 <> p_amount_tiyin then return jsonb_build_object('error', 'invalid_amount'); end if;
  return jsonb_build_object('ok', true, 'title', v_order.bot_title);
end $$;

create or replace function public.payme_create_transaction(
  p_id text, p_time_ms bigint, p_amount_tiyin bigint, p_order uuid
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c_timeout constant bigint := 43200000;
  v_now_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_tx public.payment_transactions;
  v_order public.orders;
begin
  select * into v_tx from public.payment_transactions
  where provider = 'payme' and provider_tx_id = p_id for update;
  if found then
    if v_tx.state = 1 and v_now_ms - v_tx.provider_time_ms > c_timeout then
      update public.payment_transactions set state = -1, reason = 4, cancelled_at = now() where id = v_tx.id;
      return jsonb_build_object('error', 'cannot_perform');
    end if;
    if v_tx.state <> 1 then return jsonb_build_object('error', 'cannot_perform'); end if;
    return jsonb_build_object('tx', to_jsonb(v_tx));
  end if;

  select * into v_order from public.orders where id = p_order for update;
  if not found then return jsonb_build_object('error', 'order_not_found'); end if;
  if v_order.status <> 'pending_payment' then return jsonb_build_object('error', 'order_not_payable'); end if;
  if v_order.terms_accepted_at is null then return jsonb_build_object('error', 'terms_not_accepted'); end if;
  if v_order.amount * 100 <> p_amount_tiyin then return jsonb_build_object('error', 'invalid_amount'); end if;

  update public.payment_transactions
  set state = -1, reason = 4, cancelled_at = now()
  where order_id = p_order and provider = 'payme' and state = 1
    and v_now_ms - provider_time_ms > c_timeout;
  if exists (select 1 from public.payment_transactions where order_id = p_order and provider = 'payme' and state = 1) then
    return jsonb_build_object('error', 'cannot_perform');
  end if;
  insert into public.payment_transactions
    (order_id, provider, provider_tx_id, amount_tiyin, state, provider_time_ms)
  values (p_order, 'payme', p_id, p_amount_tiyin, 1, p_time_ms)
  returning * into v_tx;
  return jsonb_build_object('tx', to_jsonb(v_tx));
end $$;

create or replace function public.payme_perform_transaction(p_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c_timeout constant bigint := 43200000;
  v_now_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_tx public.payment_transactions;
  v_order public.orders;
begin
  select * into v_tx from public.payment_transactions
  where provider = 'payme' and provider_tx_id = p_id for update;
  if not found then return jsonb_build_object('error', 'tx_not_found'); end if;
  if v_tx.state = 2 then return jsonb_build_object('tx', to_jsonb(v_tx)); end if;
  if v_tx.state <> 1 or v_now_ms - v_tx.provider_time_ms > c_timeout then
    if v_tx.state = 1 then
      update public.payment_transactions set state = -1, reason = 4, cancelled_at = now() where id = v_tx.id;
    end if;
    return jsonb_build_object('error', 'cannot_perform');
  end if;
  select * into v_order from public.orders where id = v_tx.order_id for update;
  if v_order.status <> 'pending_payment' or v_order.terms_accepted_at is null then
    return jsonb_build_object('error', 'cannot_perform');
  end if;
  update public.orders
  set status = 'paid', paid_at = now(),
      subscription_expires_at = now() + make_interval(days => subscription_days),
      updated_at = now()
  where id = v_order.id;
  update public.payment_transactions set state = 2, performed_at = now()
  where id = v_tx.id returning * into v_tx;
  return jsonb_build_object('tx', to_jsonb(v_tx));
end $$;

create or replace function public.payme_cancel_transaction(p_id text, p_reason integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_tx public.payment_transactions;
  v_order public.orders;
begin
  select * into v_tx from public.payment_transactions
  where provider = 'payme' and provider_tx_id = p_id for update;
  if not found then return jsonb_build_object('error', 'tx_not_found'); end if;
  if v_tx.state = 1 then
    update public.payment_transactions set state = -1, reason = p_reason, cancelled_at = now()
    where id = v_tx.id returning * into v_tx;
    return jsonb_build_object('tx', to_jsonb(v_tx));
  end if;
  if v_tx.state = 2 then
    select * into v_order from public.orders where id = v_tx.order_id for update;
    if v_order.status <> 'paid' or v_order.paid_at is null
       or (clock_timestamp() > v_order.paid_at + interval '24 hours' and v_order.refund_requested_at is null) then
      return jsonb_build_object('error', 'cannot_cancel');
    end if;
    update public.orders
    set status = 'cancelled',
        refund_resolution = case when refund_requested_at is not null then 'refunded' else null end,
        refund_resolved_at = case when refund_requested_at is not null then now() else null end,
        updated_at = now()
    where id = v_order.id;
    update public.payment_transactions set state = -2, reason = p_reason, cancelled_at = now()
    where id = v_tx.id returning * into v_tx;
  end if;
  return jsonb_build_object('tx', to_jsonb(v_tx));
end $$;

create or replace function public.click_prepare(
  p_click_trans_id text, p_paydoc_id text, p_order uuid, p_amount_tiyin bigint
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_order public.orders; v_tx public.payment_transactions;
begin
  select * into v_order from public.orders where id = p_order for update;
  if not found then return jsonb_build_object('error', 'order_not_found'); end if;
  if v_order.status in ('paid', 'delivering', 'done') then return jsonb_build_object('error', 'already_paid'); end if;
  if v_order.status = 'cancelled' then return jsonb_build_object('error', 'cancelled'); end if;
  if v_order.terms_accepted_at is null then return jsonb_build_object('error', 'terms_not_accepted'); end if;
  if v_order.amount * 100 <> p_amount_tiyin then return jsonb_build_object('error', 'invalid_amount'); end if;
  select * into v_tx from public.payment_transactions
  where provider = 'click' and provider_tx_id = p_click_trans_id for update;
  if found then
    if v_tx.order_id <> p_order then return jsonb_build_object('error', 'tx_not_found'); end if;
    if v_tx.state < 0 then return jsonb_build_object('error', 'cancelled'); end if;
    if v_tx.state = 2 then return jsonb_build_object('error', 'already_paid'); end if;
    return jsonb_build_object('tx', to_jsonb(v_tx));
  end if;
  insert into public.payment_transactions
    (order_id, provider, provider_tx_id, provider_doc_id, amount_tiyin, state)
  values (p_order, 'click', p_click_trans_id, p_paydoc_id, p_amount_tiyin, 1)
  returning * into v_tx;
  return jsonb_build_object('tx', to_jsonb(v_tx));
end $$;

create or replace function public.click_complete(
  p_click_trans_id text, p_prepare_seq bigint, p_order uuid,
  p_amount_tiyin bigint, p_click_error integer
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_order public.orders; v_tx public.payment_transactions;
begin
  select * into v_order from public.orders where id = p_order for update;
  if not found then return jsonb_build_object('error', 'order_not_found'); end if;
  select * into v_tx from public.payment_transactions
  where provider = 'click' and seq = p_prepare_seq for update;
  if not found or v_tx.order_id <> p_order or v_tx.provider_tx_id <> p_click_trans_id then
    return jsonb_build_object('error', 'tx_not_found');
  end if;
  if v_tx.state = 2 or v_order.status in ('paid', 'delivering', 'done') then
    return jsonb_build_object('error', 'already_paid');
  end if;
  if v_tx.amount_tiyin <> p_amount_tiyin or v_order.amount * 100 <> p_amount_tiyin then
    return jsonb_build_object('error', 'invalid_amount');
  end if;
  if v_tx.state < 0 or v_order.status = 'cancelled' then return jsonb_build_object('error', 'cancelled'); end if;
  if v_order.terms_accepted_at is null then return jsonb_build_object('error', 'terms_not_accepted'); end if;
  if p_click_error < 0 then
    update public.payment_transactions set state = -1, reason = 3, cancelled_at = now() where id = v_tx.id;
    return jsonb_build_object('error', 'cancelled');
  end if;
  update public.orders
  set status = 'paid', paid_at = now(),
      subscription_expires_at = now() + make_interval(days => subscription_days),
      updated_at = now()
  where id = v_order.id;
  update public.payment_transactions set state = 2, performed_at = now()
  where id = v_tx.id returning * into v_tx;
  return jsonb_build_object('tx', to_jsonb(v_tx));
end $$;

create or replace view public.bots_public as
select
  b.id,
  b.title,
  b.description,
  b.price,
  b.category,
  b.languages,
  b.delivery_hours,
  b.created_at,
  coalesce(nullif(p.username, ''), p.full_name) as seller_name,
  coalesce((select round(avg(r.rating)::numeric, 1) from public.reviews r where r.bot_id = b.id), 0)
    as rating,
  (select count(*) from public.reviews r where r.bot_id = b.id)::int as review_count,
  (select count(*) from public.orders o
     where o.bot_id = b.id and o.status in ('paid', 'delivering', 'done'))::int as sales,
  b.image_paths,
  (select count(*)::int from public.bot_files f where f.bot_id = b.id) as file_count,
  b.seller_id,
  b.price_7_days,
  b.price_30_days
from public.bots b
join public.profiles p on p.id = b.seller_id
where b.status = 'published'
  and b.price_7_days is not null and b.price_30_days is not null
  and exists (select 1 from public.bot_subscription_webhooks w where w.bot_id = b.id);

revoke select on public.bots_public from anon, authenticated;
grant select on public.bots_public to anon, authenticated;

drop policy bot_files_select on public.bot_files;
drop policy bot_files_insert on storage.objects;
drop policy bot_files_delete on storage.objects;
drop policy bot_files_read_owner on storage.objects;
drop policy bot_files_read_buyer on storage.objects;
revoke all on public.bot_files from anon, authenticated;

create function public.process_expired_subscriptions()
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  insert into public.subscription_webhook_outbox (order_id, event, payload)
  select o.id, 'subscription.expired',
    jsonb_build_object(
      'event', 'subscription.expired', 'order_id', o.id, 'bot_id', o.bot_id,
      'buyer_id', o.buyer_id, 'subscription_days', o.subscription_days,
      'started_at', o.paid_at, 'expires_at', o.subscription_expires_at,
      'refund_reason', null
    )
  from public.orders o
  where o.status = 'paid' and o.subscription_expires_at <= now()
  on conflict (order_id, event) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

create function public.claim_subscription_webhooks(p_limit integer default 20)
returns table (
  id uuid, event text, payload jsonb, webhook_url text, webhook_secret text, attempts integer
) language plpgsql security definer set search_path = public as $$
begin
  return query
  with due as (
    select q.id
    from public.subscription_webhook_outbox q
    join public.orders o on o.id = q.order_id
    join public.bot_subscription_webhooks w on w.bot_id = o.bot_id
    where (q.status = 'pending' and q.next_attempt_at <= now())
       or (q.status = 'sending' and q.claimed_at < now() - interval '5 minutes')
    order by q.created_at
    for update skip locked
    limit least(greatest(coalesce(p_limit, 20), 1), 100)
  ), claimed as (
    update public.subscription_webhook_outbox q
    set status = 'sending', attempts = q.attempts + 1, claimed_at = now()
    from due where q.id = due.id
    returning q.id, q.event, q.payload, q.order_id, q.attempts
  )
  select c.id, c.event, c.payload, w.endpoint_url,
         w.signing_secret, c.attempts
  from claimed c
  join public.orders o on o.id = c.order_id
  join public.bot_subscription_webhooks w on w.bot_id = o.bot_id;
end $$;

create function public.finish_subscription_webhook(
  p_id uuid, p_success boolean, p_error text default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_attempts integer;
begin
  select attempts into v_attempts from public.subscription_webhook_outbox
  where id = p_id and status = 'sending' for update;
  if not found then raise exception 'webhook_delivery_not_found'; end if;
  if p_success then
    update public.subscription_webhook_outbox
    set status = 'delivered', delivered_at = now(), claimed_at = null, last_error = null
    where id = p_id;
  else
    update public.subscription_webhook_outbox
    set status = case when v_attempts >= 10 then 'failed' else 'pending' end,
        next_attempt_at = now() + make_interval(secs => least(3600, 15 * (2 ^ least(v_attempts, 8))::integer)),
        claimed_at = null, last_error = left(coalesce(p_error, 'delivery_failed'), 1000)
    where id = p_id;
  end if;
end $$;

revoke execute on function public.process_expired_subscriptions(),
  public.claim_subscription_webhooks(integer), public.finish_subscription_webhook(uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function public.process_expired_subscriptions(),
  public.claim_subscription_webhooks(integer), public.finish_subscription_webhook(uuid, boolean, text)
  to service_role;

create function public.enqueue_subscription_webhook() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_event text; v_payload jsonb;
begin
  if old.status <> 'paid' and new.status = 'paid' then
    v_event := 'subscription.activated';
  elsif old.refund_requested_at is null and new.refund_requested_at is not null then
    v_event := 'subscription.refund_requested';
  elsif old.status <> 'cancelled' and new.status = 'cancelled'
     and old.status in ('paid', 'delivering', 'done') then
    v_event := 'subscription.refunded';
  elsif old.refund_resolution is distinct from new.refund_resolution
     and new.refund_resolution = 'rejected'
     and new.subscription_expires_at > now() then
    v_event := 'subscription.reactivated';
  else
    return new;
  end if;
  v_payload := jsonb_build_object(
    'event', v_event, 'order_id', new.id, 'bot_id', new.bot_id,
    'buyer_id', new.buyer_id, 'subscription_days', new.subscription_days,
    'started_at', new.paid_at, 'expires_at', new.subscription_expires_at,
    'refund_reason', case when v_event = 'subscription.refund_requested' then new.refund_reason else null end
  );
  insert into public.subscription_webhook_outbox (order_id, event, payload)
  values (new.id, v_event, v_payload)
  on conflict (order_id, event) do nothing;
  return new;
end $$;
create trigger orders_subscription_webhook
after update on public.orders
for each row execute function public.enqueue_subscription_webhook();
