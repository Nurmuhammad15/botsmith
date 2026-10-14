-- Super admin: the only kind of admin who can change other users' roles (make admins, demote them).
-- A super admin's own role can never be changed from the app.

alter table public.profiles add column is_super_admin boolean not null default false;

-- The owner account.
update public.profiles set is_super_admin = true, role = 'admin'
where id = '8d819e56-6dad-455e-a1bf-71ef649b0f2f';

-- Ids of all super admins; lets the admin panel show who may change roles.
create function public.admin_super_admins()
returns setof uuid language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query select p.id from public.profiles p where p.is_super_admin;
end $$;

create function public.admin_set_user_role(p_user uuid, p_role public.app_role)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin' and is_super_admin
  ) then
    raise exception 'forbidden';
  end if;
  if p_user = auth.uid() then raise exception 'cannot_change_super_admin'; end if;
  if exists (select 1 from public.profiles where id = p_user and is_super_admin) then
    raise exception 'cannot_change_super_admin';
  end if;
  -- Support-chat guests are not accounts.
  if exists (select 1 from auth.users where id = p_user and is_anonymous) then
    raise exception 'user_not_found';
  end if;
  update public.profiles set role = p_role where id = p_user;
  if not found then raise exception 'user_not_found'; end if;
end $$;

revoke execute on function public.admin_super_admins(), public.admin_set_user_role(uuid, public.app_role)
  from public, anon;
grant execute on function public.admin_super_admins(), public.admin_set_user_role(uuid, public.app_role)
  to authenticated;
