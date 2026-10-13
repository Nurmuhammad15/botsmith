-- Security Advisor clean-up that cannot change app behaviour:
-- * trigger functions are fired by the database, never called through /rest/v1/rpc, so nobody
--   needs EXECUTE on them (a trigger does not check EXECUTE when it fires);
-- * review_images_ok gets a fixed search_path.
revoke execute on function
  public.handle_new_user(), public.tg_notify_bot(), public.tg_notify_crypto(),
  public.tg_notify_message(), public.tg_notify_order(), public.tg_notify_support(),
  public.tg_notify_withdrawal()
  from public, anon, authenticated;

alter function public.review_images_ok(uuid, text[]) set search_path = public;
