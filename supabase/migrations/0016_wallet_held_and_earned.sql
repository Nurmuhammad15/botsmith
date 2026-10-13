-- Seller totals now show sales that are still inside the 24-hour hold: "earned" on my_bots counts
-- every paid sale, and my_wallet() also returns the amount that is still held (not yet withdrawable).

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
      sum(o.amount - round(o.amount * 0.05)::bigint) filter (
        where o.status in ('paid', 'delivering', 'done')
          and (o.refund_requested_at is null or o.refund_resolution = 'rejected')
      ) as earned
    from public.orders o
    where o.bot_id = b.id
  ) s on true
  where b.seller_id = auth.uid()
  order by b.created_at desc;
$$;

drop function public.my_wallet();
create function public.my_wallet()
returns table (earned bigint, withdrawn bigint, balance bigint, held bigint)
language sql stable security definer set search_path = public as $$
  select t.earned, t.withdrawn, t.balance,
    (select coalesce(sum(o.amount - round(o.amount * 0.05)::bigint), 0)::bigint
     from public.orders o
     where o.seller_id = auth.uid()
       and o.status in ('paid', 'delivering', 'done')
       and o.paid_at > now() - interval '24 hours'
       and (o.refund_requested_at is null or o.refund_resolution = 'rejected'))
  from public.wallet_totals(auth.uid()) t;
$$;
revoke execute on function public.my_wallet() from public, anon;
grant execute on function public.my_wallet() to authenticated;
