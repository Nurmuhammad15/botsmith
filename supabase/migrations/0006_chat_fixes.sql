-- BotSmith 0006: chat fixes found in review.
--  * A seller who opens a chat with a buyer (from an order) now sees that conversation before the
--    buyer has written anything.
--  * A buyer can still message the seller about a bot they ordered after the bot left the
--    catalogue (for example when it went back to moderation).

alter table public.conversations add column opened_by uuid references public.profiles (id) on delete set null;
update public.conversations set opened_by = buyer_id where opened_by is null;

create or replace function public.open_conversation(p_bot uuid, p_buyer uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_bot public.bots;
  v_buyer uuid;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into v_bot from public.bots where id = p_bot;
  if not found then raise exception 'bot_not_found'; end if;

  if p_buyer is null then
    if v_bot.seller_id = auth.uid() then raise exception 'own_bot'; end if;
    if v_bot.status <> 'published'
       and not exists (select 1 from public.orders o where o.bot_id = p_bot and o.buyer_id = auth.uid()) then
      raise exception 'bot_not_found';
    end if;
    v_buyer := auth.uid();
  else
    if v_bot.seller_id <> auth.uid() then raise exception 'forbidden'; end if;
    if not exists (select 1 from public.orders o where o.bot_id = p_bot and o.buyer_id = p_buyer) then
      raise exception 'forbidden';
    end if;
    v_buyer := p_buyer;
  end if;

  insert into public.conversations (bot_id, buyer_id, seller_id, opened_by)
  values (p_bot, v_buyer, v_bot.seller_id, auth.uid())
  on conflict (bot_id, buyer_id) do nothing;
  select id into v_id from public.conversations where bot_id = p_bot and buyer_id = v_buyer;
  return v_id;
end $$;

create or replace function public.my_conversations()
returns table (
  id uuid, bot_id uuid, bot_title text, other_name text, as_seller boolean,
  last_body text, last_at timestamptz, unread integer
)
language sql stable security definer set search_path = public as $$
  select c.id, c.bot_id, b.title,
         coalesce(nullif(op.username, ''), nullif(op.full_name, ''), 'Foydalanuvchi'),
         (c.seller_id = auth.uid()),
         lm.body,
         coalesce(lm.created_at, c.created_at),
         (select count(*) from public.messages m
            where m.conversation_id = c.id and m.sender_id <> auth.uid() and m.read_at is null)::int
  from public.conversations c
  join public.bots b on b.id = c.bot_id
  join public.profiles op on op.id = case when c.buyer_id = auth.uid() then c.seller_id else c.buyer_id end
  left join lateral (
    select m.body, m.created_at from public.messages m
    where m.conversation_id = c.id order by m.created_at desc limit 1
  ) lm on true
  where (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
    -- a seller sees chats the buyer wrote in, or that the seller opened themselves
    and (c.buyer_id = auth.uid() or lm.body is not null or c.opened_by = auth.uid())
  order by coalesce(lm.created_at, c.created_at) desc;
$$;

revoke execute on function public.open_conversation(uuid, uuid), public.my_conversations()
  from public, anon;
grant execute on function public.open_conversation(uuid, uuid), public.my_conversations()
  to authenticated;
