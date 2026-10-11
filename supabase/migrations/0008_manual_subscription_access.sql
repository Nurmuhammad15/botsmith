-- BotSmith manages payments, subscription dates, and refunds. Sellers grant and revoke access
-- manually from their order list, so the marketplace does not need seller webhook endpoints.

drop trigger if exists orders_subscription_webhook on public.orders;
drop function if exists public.enqueue_subscription_webhook();
drop function if exists public.process_expired_subscriptions();
drop function if exists public.claim_subscription_webhooks(integer);
drop function if exists public.finish_subscription_webhook(uuid, boolean, text);
drop view if exists public.bots_public;
drop table if exists public.subscription_webhook_outbox;
drop table if exists public.bot_subscription_webhooks;

drop function if exists public.set_bot_subscription_webhook(uuid, text, text);
drop function if exists public.create_sponsored_bot(text, text, text, bigint, bigint, bigint, text, text);
drop function if exists public.configure_bot_subscription(uuid, bigint, bigint, bigint, text, text);

create function public.create_sponsored_bot(
  p_title text, p_description text, p_category text,
  p_price_1_day bigint, p_price_7_days bigint, p_price_30_days bigint
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
  return v_id;
end $$;
revoke execute on function public.create_sponsored_bot(text, text, text, bigint, bigint, bigint)
  from public, anon;
grant execute on function public.create_sponsored_bot(text, text, text, bigint, bigint, bigint)
  to authenticated;

create function public.configure_bot_subscription(
  p_bot uuid, p_price_1_day bigint, p_price_7_days bigint, p_price_30_days bigint
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
end $$;
revoke execute on function public.configure_bot_subscription(uuid, bigint, bigint, bigint)
  from public, anon;
grant execute on function public.configure_bot_subscription(uuid, bigint, bigint, bigint)
  to authenticated;

create or replace function public.create_order(p_bot_id uuid, p_subscription_days integer)
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
revoke execute on function public.create_order(uuid, integer) from public, anon;
grant execute on function public.create_order(uuid, integer) to authenticated;

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
  and b.price_7_days is not null and b.price_30_days is not null;
revoke select on public.bots_public from anon, authenticated;
grant select on public.bots_public to anon, authenticated;
