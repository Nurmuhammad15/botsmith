-- Every in-site notification an admin sends is also delivered as a browser push to the
-- recipient's subscribed devices (notify_user never raises, so a failed push cannot roll back
-- the notification).
create function public.tg_notify_site_message() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_user(new.user_id, new.title, new.body, coalesce(new.link, '/'));
  return null;
end $$;
revoke execute on function public.tg_notify_site_message() from public, anon, authenticated;

create trigger notifications_push after insert on public.notifications
  for each row execute function public.tg_notify_site_message();
