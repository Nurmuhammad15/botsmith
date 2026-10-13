-- The support chat works without registration: a visitor who writes gets an anonymous Supabase
-- Auth session ("guest"). Guests must stay out of the marketplace itself.

-- Guests cannot place orders.
create or replace function public.create_order(p_bot_id uuid, p_subscription_days integer)
returns public.orders language plpgsql security definer set search_path = public as $$
declare
  v_bot public.bots;
  v_amount bigint;
  v_single boolean;
  v_order public.orders;
begin
  if auth.uid() is null
     or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'not_authenticated';
  end if;
  if p_subscription_days not in (0, 1, 7, 30) then raise exception 'invalid_subscription'; end if;
  select * into v_bot from public.bots where id = p_bot_id and status = 'published';
  if not found then raise exception 'bot_not_found'; end if;
  if v_bot.seller_id = auth.uid() then raise exception 'own_bot'; end if;
  v_single := v_bot.price_7_days is null and v_bot.price_30_days is null;
  if v_single <> (p_subscription_days = 0) then raise exception 'invalid_subscription'; end if;
  v_amount := case p_subscription_days
    when 0 then v_bot.price
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

-- Guests are not listed as users in the admin panel.
create or replace function public.admin_users()
returns table (
  id uuid, email text, full_name text, role public.app_role,
  created_at timestamptz, last_sign_in_at timestamptz, email_confirmed boolean,
  bots bigint, purchases bigint, sales bigint, banned_until timestamptz
) language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query
  select p.id, u.email::text, p.full_name, p.role, u.created_at, u.last_sign_in_at,
         u.email_confirmed_at is not null,
         (select count(*) from public.bots b where b.seller_id = p.id),
         (select count(*) from public.orders o
           where o.buyer_id = p.id and o.status in ('paid', 'delivering', 'done')),
         (select count(*) from public.orders o
           where o.seller_id = p.id and o.status in ('paid', 'delivering', 'done')),
         case when u.banned_until > now() then u.banned_until end
  from public.profiles p
  join auth.users u on u.id = p.id
  where not u.is_anonymous
  order by u.created_at desc;
end $$;

create or replace function public.admin_stats()
returns table(users bigint, sellers bigint, bots_total bigint, bots_published bigint, orders_paid bigint, sales_total bigint, sale_commission bigint, fee_paid bigint, fee_pending bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query select
    (select count(*) from public.profiles p join auth.users u on u.id = p.id
      where not u.is_anonymous),
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
