-- Platform commission lowered to 5%: 5% kept from each sale and 5% fee on withdrawals.
-- Keep in sync with src/lib/subscription.ts and src/lib/wallet.ts.

CREATE OR REPLACE FUNCTION public.wallet_totals(p_seller uuid)
 RETURNS TABLE(earned bigint, withdrawn bigint, balance bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with e as (
    select coalesce(sum(o.amount - round(o.amount * 0.05)::bigint), 0)::bigint as v
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
$function$
;

CREATE OR REPLACE FUNCTION public.my_bots()
 RETURNS TABLE(id uuid, title text, description text, price bigint, category text, status bot_status, views integer, sales integer, earned bigint, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select b.id, b.title, b.description, b.price, b.category, b.status, b.views,
         coalesce(s.sales, 0)::int, coalesce(s.earned, 0)::bigint, b.created_at
  from public.bots b
  left join lateral (
    select
      count(*) filter (where o.status in ('paid', 'delivering', 'done')) as sales,
      sum(o.amount - round(o.amount * 0.05)::bigint) filter (
        where o.status in ('paid', 'delivering', 'done')
          and o.paid_at <= now() - interval '24 hours'
          and (o.refund_requested_at is null or o.refund_resolution = 'rejected')
      ) as earned
    from public.orders o
    where o.bot_id = b.id
  ) s on true
  where b.seller_id = auth.uid()
  order by b.created_at desc;
$function$
;

CREATE OR REPLACE FUNCTION public.request_withdrawal(p_amount bigint, p_card text, p_holder text)
 RETURNS withdrawals
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c_min constant bigint := 1;
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

  v_fee := round(p_amount * 0.05);
  insert into public.withdrawals (seller_id, amount, fee, payout, card_number, card_holder)
  values (auth.uid(), p_amount, v_fee, p_amount - v_fee, v_card, btrim(p_holder))
  returning * into v_row;
  return v_row;
end $function$
;

CREATE OR REPLACE FUNCTION public.admin_stats()
 RETURNS TABLE(users bigint, sellers bigint, bots_total bigint, bots_published bigint, orders_paid bigint, sales_total bigint, sale_commission bigint, fee_paid bigint, fee_pending bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query select
    (select count(*) from public.profiles),
    (select count(*) from public.profiles where role = 'seller'),
    (select count(*) from public.bots),
    (select count(*) from public.bots where status = 'published'),
    (select count(*) from public.orders where status in ('paid', 'delivering', 'done')),
    (select coalesce(sum(amount), 0)::bigint from public.orders
      where status in ('paid', 'delivering', 'done')),
    (select coalesce(sum(round(amount * 0.05)), 0)::bigint from public.orders
      where status in ('paid', 'delivering', 'done')),
    (select coalesce(sum(fee), 0)::bigint from public.withdrawals where status = 'paid'),
    (select coalesce(sum(fee), 0)::bigint from public.withdrawals where status = 'pending');
end $function$
;

