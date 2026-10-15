-- An admin can send a site message to specific people, identified by e-mail address.
-- Returns how many were reached and which addresses matched no account.
create function public.admin_send_notification_to_emails(
  p_emails text[], p_title text, p_body text, p_link text default null
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
    insert into public.notifications (user_id, title, body, link)
    select id, btrim(p_title), btrim(p_body), nullif(btrim(coalesce(p_link, '')), '')
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

revoke execute on function public.admin_send_notification_to_emails(text[], text, text, text)
  from public, anon;
grant execute on function public.admin_send_notification_to_emails(text[], text, text, text)
  to authenticated;
