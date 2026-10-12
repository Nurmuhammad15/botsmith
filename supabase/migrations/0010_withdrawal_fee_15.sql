-- Withdrawal fee raised from 3% to 15% (keep in sync with src/lib/wallet.ts).
create or replace function public.request_withdrawal(p_amount bigint, p_card text, p_holder text)
returns public.withdrawals
language plpgsql security definer set search_path = public as $$
declare
  c_min constant bigint := 100000;
  c_retained constant bigint := 500000;
  v_card text := regexp_replace(coalesce(p_card, ''), '\s', '', 'g');
  v_balance bigint;
  v_fee bigint;
  v_row public.withdrawals;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  -- Serialise concurrent requests from the same seller.
  perform 1 from public.profiles where id = auth.uid() and role = 'seller' for update;
  if not found then raise exception 'not_a_seller'; end if;
  if v_card !~ '^[0-9]{16}$' then raise exception 'invalid_card'; end if;
  if p_amount is null or p_amount < c_min then raise exception 'amount_too_small'; end if;

  select t.balance into v_balance from public.wallet_totals(auth.uid()) t;
  if p_amount > greatest(0, v_balance - c_retained) then
    raise exception 'amount_exceeds_available';
  end if;

  v_fee := round(p_amount * 0.15);
  insert into public.withdrawals (seller_id, amount, fee, payout, card_number, card_holder)
  values (auth.uid(), p_amount, v_fee, p_amount - v_fee, v_card, btrim(p_holder))
  returning * into v_row;
  return v_row;
end $$;
