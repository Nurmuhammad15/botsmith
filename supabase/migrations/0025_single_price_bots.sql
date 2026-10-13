-- Bots whose Telegram bot has no tariffs can be sold at one fixed price: price_7_days and
-- price_30_days stay NULL and orders are stored with subscription_days = 0 ("one-time").

alter table public.orders drop constraint if exists orders_subscription_days_check;
alter table public.orders
  add constraint orders_subscription_days_check check (subscription_days in (0, 1, 7, 30));

create or replace function public.create_sponsored_bot(
  p_title text, p_description text, p_category text,
  p_price_1_day bigint, p_price_7_days bigint, p_price_30_days bigint
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not exists (
    select 1 from public.profiles where id = auth.uid() and role = 'seller'
  ) then raise exception 'not_a_seller'; end if;
  if p_price_1_day is null or p_price_1_day <= 0
     or (p_price_7_days is null) <> (p_price_30_days is null)
     or p_price_7_days <= 0 or p_price_30_days <= 0 then
    raise exception 'invalid_subscription_price';
  end if;
  insert into public.bots (seller_id, title, description, price, price_7_days, price_30_days, category)
  values (
    auth.uid(), btrim(p_title), btrim(p_description), p_price_1_day,
    p_price_7_days, p_price_30_days, p_category
  ) returning id into v_id;
  return v_id;
end $$;

create or replace function public.configure_bot_subscription(
  p_bot uuid, p_price_1_day bigint, p_price_7_days bigint, p_price_30_days bigint
) returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_price_1_day is null or p_price_1_day <= 0
     or (p_price_7_days is null) <> (p_price_30_days is null)
     or p_price_7_days <= 0 or p_price_30_days <= 0 then
    raise exception 'invalid_subscription_price';
  end if;
  update public.bots set price = p_price_1_day, price_7_days = p_price_7_days,
    price_30_days = p_price_30_days
  where id = p_bot and seller_id = auth.uid();
  if not found then raise exception 'bot_not_found'; end if;
end $$;

create or replace function public.create_order(p_bot_id uuid, p_subscription_days integer)
returns public.orders language plpgsql security definer set search_path = public as $$
declare
  v_bot public.bots;
  v_amount bigint;
  v_single boolean;
  v_order public.orders;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_subscription_days not in (0, 1, 7, 30) then raise exception 'invalid_subscription'; end if;
  select * into v_bot from public.bots where id = p_bot_id and status = 'published';
  if not found then raise exception 'bot_not_found'; end if;
  if v_bot.seller_id = auth.uid() then raise exception 'own_bot'; end if;
  v_single := v_bot.price_7_days is null and v_bot.price_30_days is null;
  -- A single-price bot is bought with 0 days, a tariff bot with 1/7/30.
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

-- Catalog: tariff bots (both prices) and single-price bots (neither) are listed.
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
  b.price_30_days,
  p.avatar_path as seller_avatar,
  p.headline as seller_headline,
  p.location as seller_location,
  p.experience_years as seller_experience,
  p.bio as seller_bio,
  p.website as seller_website,
  p.cv_path as seller_cv,
  p.cv_name as seller_cv_name
from public.bots b
join public.profiles p on p.id = b.seller_id
where b.status = 'published'
  and (b.price_7_days is null) = (b.price_30_days is null);
