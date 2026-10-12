-- Platform income now includes the 15% commission kept from every sale (see wallet_totals),
-- in addition to the fee taken at withdrawal.
drop function public.admin_stats();
create function public.admin_stats()
returns table (
  users bigint, sellers bigint, bots_total bigint, bots_published bigint,
  orders_paid bigint, sales_total bigint, sale_commission bigint, fee_paid bigint, fee_pending bigint
) language plpgsql stable security definer set search_path = public as $$
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
    (select coalesce(sum(round(amount * 0.15)), 0)::bigint from public.orders
      where status in ('paid', 'delivering', 'done')),
    (select coalesce(sum(fee), 0)::bigint from public.withdrawals where status = 'paid'),
    (select coalesce(sum(fee), 0)::bigint from public.withdrawals where status = 'pending');
end $$;
revoke execute on function public.admin_stats() from public, anon;
grant execute on function public.admin_stats() to authenticated;
