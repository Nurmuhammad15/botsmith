-- In-site notifications that an admin sends in the name of the site (for example to ask users to
-- fill in their Telegram username or a real phone number). Shown through the bell in the header.

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 1000),
  link text check (link is null or link ~ '^/[A-Za-z0-9/_?=&.-]{0,200}$'),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;
revoke all on public.notifications from public, anon, authenticated;
grant select on public.notifications to authenticated;
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = auth.uid());

create function public.mark_notifications_read()
returns void language sql security definer set search_path = public as $$
  update public.notifications set read_at = now()
  where user_id = auth.uid() and read_at is null;
$$;
revoke execute on function public.mark_notifications_read() from public, anon;
grant execute on function public.mark_notifications_read() to authenticated;

-- Who an audience means. Never admins, guests or banned accounts.
--   all / seller / buyer: by role
--   incomplete: a seller without a Telegram username, or whose phone is missing, too short,
--               or just one repeated digit (e.g. +998000000000)
create or replace function public.notification_targets(p_audience text)
returns setof uuid language plpgsql stable security definer set search_path = public as $$
begin
  if p_audience not in ('all', 'seller', 'buyer', 'incomplete') then
    raise exception 'invalid_audience';
  end if;
  return query
  select p.id
  from public.profiles p
  join auth.users u on u.id = p.id
  where not u.is_anonymous
    and p.role <> 'admin'
    and (u.banned_until is null or u.banned_until <= now())
    and case p_audience
      when 'all' then true
      when 'seller' then p.role = 'seller'
      when 'buyer' then p.role = 'buyer'
      else p.role = 'seller' and (
        p.username is null
        or char_length(regexp_replace(p.phone, '\D', '', 'g')) < 9
        or regexp_replace(p.phone, '\D', '', 'g') ~ '^(998)?(\d)\2*$'
      )
    end;
end $$;
revoke execute on function public.notification_targets(text) from public, anon, authenticated;

create function public.admin_notification_audience_count(p_audience text)
returns integer language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return (select count(*)::int from public.notification_targets(p_audience));
end $$;

create function public.admin_send_notification(
  p_audience text, p_title text, p_body text, p_link text default null
) returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  insert into public.notifications (user_id, title, body, link)
  select t, btrim(p_title), btrim(p_body), nullif(btrim(coalesce(p_link, '')), '')
  from public.notification_targets(p_audience) t;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke execute on function public.admin_notification_audience_count(text),
  public.admin_send_notification(text, text, text, text) from public, anon;
grant execute on function public.admin_notification_audience_count(text),
  public.admin_send_notification(text, text, text, text) to authenticated;
