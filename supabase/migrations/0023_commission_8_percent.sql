-- Platform sales commission raised from 5% to 8% (withdrawal fee stays 5%).
-- Keep in sync with src/lib/subscription.ts.

create or replace function public.wallet_totals(p_seller uuid)
returns table(earned bigint, withdrawn bigint, balance bigint)
language sql stable security definer set search_path = public as $$
  with e as (
    select coalesce(sum(o.amount - round(o.amount * 0.08)::bigint), 0)::bigint as v
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

create or replace function public.my_bots()
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
      sum(o.amount - round(o.amount * 0.08)::bigint) filter (
        where o.status in ('paid', 'delivering', 'done')
          and (o.refund_requested_at is null or o.refund_resolution = 'rejected')
      ) as earned
    from public.orders o
    where o.bot_id = b.id
  ) s on true
  where b.seller_id = auth.uid()
  order by b.created_at desc;
$$;

create or replace function public.my_wallet()
returns table (earned bigint, withdrawn bigint, balance bigint, held bigint)
language sql stable security definer set search_path = public as $$
  select t.earned, t.withdrawn, t.balance,
    (select coalesce(sum(o.amount - round(o.amount * 0.08)::bigint), 0)::bigint
     from public.orders o
     where o.seller_id = auth.uid()
       and o.status in ('paid', 'delivering', 'done')
       and o.paid_at > now() - interval '24 hours'
       and (o.refund_requested_at is null or o.refund_resolution = 'rejected'))
  from public.wallet_totals(auth.uid()) t;
$$;

create or replace function public.admin_stats()
returns table(users bigint, sellers bigint, bots_total bigint, bots_published bigint, orders_paid bigint, sales_total bigint, sale_commission bigint, fee_paid bigint, fee_pending bigint)
language plpgsql stable security definer set search_path = public as $$
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
    (select coalesce(sum(round(amount * 0.08)), 0)::bigint from public.orders
      where status in ('paid', 'delivering', 'done')),
    (select coalesce(sum(fee), 0)::bigint from public.withdrawals where status = 'paid'),
    (select coalesce(sum(fee), 0)::bigint from public.withdrawals where status = 'pending');
end $$;
