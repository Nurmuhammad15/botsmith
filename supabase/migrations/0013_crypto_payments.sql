-- Manual USDT (TRC-20) payments. The buyer sends USDT to the wallet set by an admin, pastes the
-- transaction hash, and an admin confirms the transfer, which marks the order paid.

-- ---------------------------------------------------------------- settings (single row)
create table public.crypto_settings (
  id boolean primary key default true check (id),
  wallet_address text not null default '' check (char_length(wallet_address) <= 100),
  network text not null default 'USDT (TRC-20)',
  rate_uzs_per_usdt numeric(12, 2) not null default 12800 check (rate_uzs_per_usdt > 0),
  updated_at timestamptz not null default now()
);
insert into public.crypto_settings default values;

alter table public.crypto_settings enable row level security;
revoke all on public.crypto_settings from anon, authenticated;
grant select on public.crypto_settings to authenticated;
create policy crypto_settings_select on public.crypto_settings for select to authenticated
  using (true);

create function public.admin_set_crypto_settings(p_wallet text, p_rate numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_rate is null or p_rate <= 0 then raise exception 'invalid_rate'; end if;
  update public.crypto_settings
  set wallet_address = btrim(coalesce(p_wallet, '')), rate_uzs_per_usdt = p_rate, updated_at = now()
  where id;
end $$;

-- ---------------------------------------------------------------- payments
create table public.crypto_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  buyer_id uuid not null references public.profiles (id) on delete cascade,
  amount_usdt numeric(12, 2) not null check (amount_usdt > 0),
  address text not null,
  network text not null,
  txid text,
  status text not null default 'pending'
    check (status in ('pending', 'submitted', 'confirmed', 'rejected', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '60 minutes'
);
create index crypto_payments_order_idx on public.crypto_payments (order_id);
create unique index crypto_payments_txid_key on public.crypto_payments (lower(txid))
  where txid is not null;

alter table public.crypto_payments enable row level security;
revoke all on public.crypto_payments from anon, authenticated;
grant select on public.crypto_payments to authenticated;
create policy crypto_payments_select on public.crypto_payments for select to authenticated
  using (buyer_id = auth.uid() or public.is_admin());

-- Starts (or returns the still-open) payment for the caller's unpaid order. The amount gets a
-- unique number of cents so two open payments never ask for the same sum.
create function public.create_crypto_payment(p_order uuid)
returns public.crypto_payments language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
  v_set public.crypto_settings;
  v_row public.crypto_payments;
  v_base numeric(12, 2);
  v_amount numeric(12, 2);
  v_n integer := 0;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into v_order from public.orders
  where id = p_order and buyer_id = auth.uid() and status = 'pending_payment' for update;
  if not found then raise exception 'order_not_found'; end if;
  if v_order.terms_accepted_at is null then raise exception 'terms_not_accepted'; end if;

  update public.crypto_payments set status = 'expired'
  where status = 'pending' and expires_at < now();

  select * into v_row from public.crypto_payments
  where order_id = p_order and status in ('pending', 'submitted')
  order by created_at desc limit 1;
  if found then return v_row; end if;

  select * into v_set from public.crypto_settings;
  if v_set.wallet_address = '' then raise exception 'crypto_not_configured'; end if;

  v_base := round(v_order.amount / v_set.rate_uzs_per_usdt, 2);
  loop
    v_amount := v_base + v_n * 0.01;
    exit when not exists (
      select 1 from public.crypto_payments
      where amount_usdt = v_amount and status in ('pending', 'submitted')
    );
    v_n := v_n + 1;
    if v_n > 99 then raise exception 'try_again_later'; end if;
  end loop;

  insert into public.crypto_payments (order_id, buyer_id, amount_usdt, address, network)
  values (p_order, auth.uid(), v_amount, v_set.wallet_address, v_set.network)
  returning * into v_row;
  return v_row;
end $$;

create function public.submit_crypto_txid(p_payment uuid, p_txid text)
returns public.crypto_payments language plpgsql security definer set search_path = public as $$
declare v_row public.crypto_payments; v_txid text := btrim(coalesce(p_txid, ''));
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if v_txid !~ '^[0-9a-fA-F]{64}$' then raise exception 'invalid_txid'; end if;
  if exists (select 1 from public.crypto_payments where lower(txid) = lower(v_txid)) then
    raise exception 'txid_already_used';
  end if;
  update public.crypto_payments
  set txid = v_txid, status = 'submitted', expires_at = greatest(expires_at, now() + interval '48 hours')
  where id = p_payment and buyer_id = auth.uid() and status in ('pending', 'submitted')
  returning * into v_row;
  if not found then raise exception 'payment_not_found'; end if;
  return v_row;
end $$;

create function public.admin_resolve_crypto_payment(p_payment uuid, p_confirm boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_pay public.crypto_payments;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  select * into v_pay from public.crypto_payments where id = p_payment for update;
  if not found or v_pay.status <> 'submitted' then raise exception 'payment_not_found'; end if;
  if p_confirm then
    perform public.admin_set_order_status(v_pay.order_id, 'paid');
    update public.crypto_payments set status = 'confirmed' where id = p_payment;
  else
    update public.crypto_payments set status = 'rejected' where id = p_payment;
  end if;
end $$;

revoke execute on function
  public.admin_set_crypto_settings(text, numeric), public.create_crypto_payment(uuid),
  public.submit_crypto_txid(uuid, text), public.admin_resolve_crypto_payment(uuid, boolean)
from public, anon;
grant execute on function
  public.admin_set_crypto_settings(text, numeric), public.create_crypto_payment(uuid),
  public.submit_crypto_txid(uuid, text), public.admin_resolve_crypto_payment(uuid, boolean)
to authenticated;
