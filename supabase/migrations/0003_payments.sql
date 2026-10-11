-- BotSmith 0003: online payments (Payme Merchant API + Click Shop API).
--
-- The payment providers call our server (src/routes/api.payme.ts, api.click.ts). The server uses
-- the service_role key to run the state machine below; these functions are NOT callable by
-- browsers (anon/authenticated). They return jsonb: {"tx": {...}} on success or {"error": code}
-- for an expected business error, so state changes made before the error (for example an
-- expiry cancellation) are still committed. Unexpected failures raise.
--
-- Amounts are stored in tiyin (1 so'm = 100 tiyin), the unit both providers use or can express.
-- Transaction states follow Payme: 1 created, 2 performed, -1 cancelled, -2 cancelled after
-- being performed (a refund). Click transactions use the same numbers.

create type public.payment_provider as enum ('payme', 'click');

create table public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity unique, -- integer id for Click's merchant_prepare_id
  order_id uuid not null references public.orders (id) on delete restrict,
  provider public.payment_provider not null,
  provider_tx_id text not null, -- Payme transaction id / Click click_trans_id
  provider_doc_id text, -- Click click_paydoc_id
  amount_tiyin bigint not null check (amount_tiyin > 0),
  state smallint not null check (state in (1, 2, -1, -2)),
  reason smallint,
  provider_time_ms bigint, -- Payme: the "time" it sent with CreateTransaction
  created_at timestamptz not null default now(),
  performed_at timestamptz,
  cancelled_at timestamptz,
  unique (provider, provider_tx_id)
);
create index payment_transactions_order_idx on public.payment_transactions (order_id);
-- An order can be paid once.
create unique index payment_transactions_one_performed_idx
  on public.payment_transactions (order_id) where state = 2;

revoke all on public.payment_transactions from anon, authenticated;
grant select on public.payment_transactions to authenticated;
alter table public.payment_transactions enable row level security;
-- Support staff can see payments next to orders; nobody else can read them.
create policy payment_transactions_admin_select on public.payment_transactions
  for select to authenticated using (public.is_admin());

-- =============================================================== Payme
create function public.payme_check_perform(p_order uuid, p_amount_tiyin bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order;
  if not found then return jsonb_build_object('error', 'order_not_found'); end if;
  if v_order.status <> 'pending_payment' then
    return jsonb_build_object('error', 'order_not_payable');
  end if;
  if v_order.amount * 100 <> p_amount_tiyin then
    return jsonb_build_object('error', 'invalid_amount');
  end if;
  -- The title lets the server build the fiscal receipt line Payme asks for.
  return jsonb_build_object('ok', true, 'title', v_order.bot_title);
end $$;

create function public.payme_create_transaction(
  p_id text, p_time_ms bigint, p_amount_tiyin bigint, p_order uuid
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c_timeout constant bigint := 43200000; -- 12 hours, as specified by Payme
  v_now_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_tx public.payment_transactions;
  v_order public.orders;
begin
  select * into v_tx from public.payment_transactions
  where provider = 'payme' and provider_tx_id = p_id for update;
  if found then
    -- Payme re-sent a transaction we already know: answer from our record.
    if v_tx.state = 1 and v_now_ms - v_tx.provider_time_ms > c_timeout then
      update public.payment_transactions
        set state = -1, reason = 4, cancelled_at = now() where id = v_tx.id;
      return jsonb_build_object('error', 'cannot_perform');
    end if;
    if v_tx.state <> 1 then return jsonb_build_object('error', 'cannot_perform'); end if;
    return jsonb_build_object('tx', to_jsonb(v_tx));
  end if;

  select * into v_order from public.orders where id = p_order for update;
  if not found then return jsonb_build_object('error', 'order_not_found'); end if;
  if v_order.status <> 'pending_payment' then
    return jsonb_build_object('error', 'order_not_payable');
  end if;
  if v_order.amount * 100 <> p_amount_tiyin then
    return jsonb_build_object('error', 'invalid_amount');
  end if;

  -- Expired Payme transactions for this order no longer block a new one.
  update public.payment_transactions
    set state = -1, reason = 4, cancelled_at = now()
  where order_id = p_order and provider = 'payme' and state = 1
    and v_now_ms - provider_time_ms > c_timeout;
  if exists (
    select 1 from public.payment_transactions
    where order_id = p_order and provider = 'payme' and state = 1
  ) then
    return jsonb_build_object('error', 'cannot_perform');
  end if;

  insert into public.payment_transactions
    (order_id, provider, provider_tx_id, amount_tiyin, state, provider_time_ms)
  values (p_order, 'payme', p_id, p_amount_tiyin, 1, p_time_ms)
  returning * into v_tx;
  return jsonb_build_object('tx', to_jsonb(v_tx));
end $$;

create function public.payme_perform_transaction(p_id text)
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
  if v_tx.state <> 1 then return jsonb_build_object('error', 'cannot_perform'); end if;

  if v_now_ms - v_tx.provider_time_ms > c_timeout then
    update public.payment_transactions
      set state = -1, reason = 4, cancelled_at = now() where id = v_tx.id;
    return jsonb_build_object('error', 'cannot_perform');
  end if;

  select * into v_order from public.orders where id = v_tx.order_id for update;
  if v_order.status <> 'pending_payment' then
    return jsonb_build_object('error', 'cannot_perform');
  end if;

  update public.orders set status = 'paid', updated_at = now() where id = v_order.id;
  update public.payment_transactions
    set state = 2, performed_at = now() where id = v_tx.id returning * into v_tx;
  return jsonb_build_object('tx', to_jsonb(v_tx));
end $$;

create function public.payme_cancel_transaction(p_id text, p_reason integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_tx public.payment_transactions;
  v_order public.orders;
begin
  select * into v_tx from public.payment_transactions
  where provider = 'payme' and provider_tx_id = p_id for update;
  if not found then return jsonb_build_object('error', 'tx_not_found'); end if;

  if v_tx.state = 1 then
    update public.payment_transactions
      set state = -1, reason = p_reason, cancelled_at = now()
    where id = v_tx.id returning * into v_tx;
    return jsonb_build_object('tx', to_jsonb(v_tx));
  end if;

  if v_tx.state = 2 then
    -- A refund is only possible while the seller has not started delivering.
    select * into v_order from public.orders where id = v_tx.order_id for update;
    if v_order.status in ('delivering', 'done') then
      return jsonb_build_object('error', 'cannot_cancel');
    end if;
    update public.orders set status = 'cancelled', updated_at = now() where id = v_order.id;
    update public.payment_transactions
      set state = -2, reason = p_reason, cancelled_at = now()
    where id = v_tx.id returning * into v_tx;
  end if;
  return jsonb_build_object('tx', to_jsonb(v_tx));
end $$;

create function public.payme_get_transaction(p_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_tx public.payment_transactions;
begin
  select * into v_tx from public.payment_transactions
  where provider = 'payme' and provider_tx_id = p_id;
  if not found then return jsonb_build_object('error', 'tx_not_found'); end if;
  return jsonb_build_object('tx', to_jsonb(v_tx));
end $$;

create function public.payme_statement(p_from_ms bigint, p_to_ms bigint)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(t) order by t.provider_time_ms), '[]'::jsonb)
  from public.payment_transactions t
  where t.provider = 'payme' and t.provider_time_ms between p_from_ms and p_to_ms;
$$;

-- =============================================================== Click
create function public.click_prepare(
  p_click_trans_id text, p_paydoc_id text, p_order uuid, p_amount_tiyin bigint
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
  v_tx public.payment_transactions;
begin
  select * into v_order from public.orders where id = p_order for update;
  if not found then return jsonb_build_object('error', 'order_not_found'); end if;
  if v_order.status in ('paid', 'delivering', 'done') then
    return jsonb_build_object('error', 'already_paid');
  end if;
  if v_order.status = 'cancelled' then return jsonb_build_object('error', 'cancelled'); end if;
  if v_order.amount * 100 <> p_amount_tiyin then
    return jsonb_build_object('error', 'invalid_amount');
  end if;

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

-- Order of checks mirrors Click's reference implementation: order, prepared transaction,
-- already paid, amount, cancelled; then a failed payment reported by Click cancels it.
create function public.click_complete(
  p_click_trans_id text, p_prepare_seq bigint, p_order uuid,
  p_amount_tiyin bigint, p_click_error integer
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
  v_tx public.payment_transactions;
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
  if v_tx.state < 0 or v_order.status = 'cancelled' then
    return jsonb_build_object('error', 'cancelled');
  end if;

  if p_click_error < 0 then
    update public.payment_transactions
      set state = -1, reason = 3, cancelled_at = now() where id = v_tx.id;
    return jsonb_build_object('error', 'cancelled');
  end if;

  update public.orders set status = 'paid', updated_at = now() where id = v_order.id;
  update public.payment_transactions
    set state = 2, performed_at = now() where id = v_tx.id returning * into v_tx;
  return jsonb_build_object('tx', to_jsonb(v_tx));
end $$;

-- =============================================================== privileges
-- Only the server (service_role) may run the payment state machine.
revoke execute on function
  public.payme_check_perform(uuid, bigint),
  public.payme_create_transaction(text, bigint, bigint, uuid),
  public.payme_perform_transaction(text),
  public.payme_cancel_transaction(text, integer),
  public.payme_get_transaction(text),
  public.payme_statement(bigint, bigint),
  public.click_prepare(text, text, uuid, bigint),
  public.click_complete(text, bigint, uuid, bigint, integer)
  from public, anon, authenticated;
grant execute on function
  public.payme_check_perform(uuid, bigint),
  public.payme_create_transaction(text, bigint, bigint, uuid),
  public.payme_perform_transaction(text),
  public.payme_cancel_transaction(text, integer),
  public.payme_get_transaction(text),
  public.payme_statement(bigint, bigint),
  public.click_prepare(text, text, uuid, bigint),
  public.click_complete(text, bigint, uuid, bigint, integer)
  to service_role;
