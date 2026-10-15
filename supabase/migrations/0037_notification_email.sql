-- Site messages can also be e-mailed. A message flagged send_email is posted (one batch per
-- INSERT statement) to the site's /api/email endpoint, which sends it through Resend. The call
-- never raises, so a failed e-mail cannot roll back the notification.

alter table public.notifications add column send_email boolean not null default false;

create function public.tg_email_site_messages() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_cfg public.push_config;
  v_msgs jsonb;
begin
  select * into v_cfg from public.push_config;
  if v_cfg.secret = '' then return null; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'to', u.email, 'title', n.title, 'body', n.body, 'link', n.link
         )), '[]'::jsonb)
  into v_msgs
  from new_rows n
  join auth.users u on u.id = n.user_id
  where n.send_email and u.email is not null and not u.is_anonymous;
  if jsonb_array_length(v_msgs) = 0 then return null; end if;
  perform net.http_post(
    url := replace(v_cfg.endpoint_url, '/api/push', '/api/email'),
    body := jsonb_build_object('messages', v_msgs),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_cfg.secret),
    timeout_milliseconds := 20000
  );
  return null;
exception when others then
  return null;
end $$;
revoke execute on function public.tg_email_site_messages() from public, anon, authenticated;

create trigger notifications_email after insert on public.notifications
  referencing new table as new_rows
  for each statement execute function public.tg_email_site_messages();

-- Admin senders gain a send_email flag (default: in-site only).
drop function public.admin_send_notification(text, text, text, text);
create function public.admin_send_notification(
  p_audience text, p_title text, p_body text, p_link text default null,
  p_send_email boolean default false
) returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  insert into public.notifications (user_id, title, body, link, send_email)
  select t, btrim(p_title), btrim(p_body), nullif(btrim(coalesce(p_link, '')), ''), p_send_email
  from public.notification_targets(p_audience) t;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

drop function public.admin_send_notification_to_emails(text[], text, text, text);
create function public.admin_send_notification_to_emails(
  p_emails text[], p_title text, p_body text, p_link text default null,
  p_send_email boolean default false
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_emails text[];
  v_sent integer;
  v_missing text[];
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  select array_agg(distinct lower(btrim(e))) into v_emails
  from unnest(coalesce(p_emails, '{}')) e where btrim(e) <> '';
  if v_emails is null or cardinality(v_emails) > 100 then raise exception 'invalid_emails'; end if;

  with targets as (
    select p.id
    from public.profiles p
    join auth.users u on u.id = p.id
    where not u.is_anonymous and lower(u.email) = any(v_emails)
  ), ins as (
    insert into public.notifications (user_id, title, body, link, send_email)
    select id, btrim(p_title), btrim(p_body), nullif(btrim(coalesce(p_link, '')), ''), p_send_email
    from targets
    returning user_id
  )
  select count(*)::int into v_sent from ins;

  select coalesce(array_agg(e), '{}') into v_missing
  from unnest(v_emails) e
  where not exists (
    select 1 from auth.users u where lower(u.email) = e and not u.is_anonymous
  );
  return jsonb_build_object('sent', v_sent, 'missing', to_jsonb(v_missing));
end $$;

revoke execute on function public.admin_send_notification(text, text, text, text, boolean),
  public.admin_send_notification_to_emails(text[], text, text, text, boolean) from public, anon;
grant execute on function public.admin_send_notification(text, text, text, text, boolean),
  public.admin_send_notification_to_emails(text[], text, text, text, boolean) to authenticated;
