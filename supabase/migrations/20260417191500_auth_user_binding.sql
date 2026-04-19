alter table public.user_account
  add column if not exists auth_user_id uuid;

comment on column public.user_account.auth_user_id is 'Supabase Auth users.id 绑定字段';

create unique index if not exists user_account_auth_user_id_uidx
  on public.user_account (auth_user_id)
  where auth_user_id is not null;

create or replace function public.get_current_user_permissions()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_email text := nullif(current_setting('request.jwt.claim.email', true), '');
  v_phone text := nullif(current_setting('request.jwt.claim.phone', true), '');
  v_user_account_id uuid;
  v_role_codes jsonb := '[]'::jsonb;
  v_permissions jsonb := '[]'::jsonb;
begin
  if v_auth_user_id is not null then
    select id
      into v_user_account_id
    from public.user_account
    where auth_user_id = v_auth_user_id
      and is_enabled = true
    limit 1;
  end if;

  if v_user_account_id is null and v_email is not null then
    select id
      into v_user_account_id
    from public.user_account
    where username = v_email
      and is_enabled = true
    limit 1;
  end if;

  if v_user_account_id is null and v_phone is not null then
    select id
      into v_user_account_id
    from public.user_account
    where mobile_number = v_phone
      and is_enabled = true
    limit 1;
  end if;

  if v_user_account_id is null then
    return jsonb_build_object(
      'user_account_id', null,
      'role_codes', v_role_codes,
      'permissions', v_permissions
    );
  end if;

  select coalesce(jsonb_agg(distinct r.role_code), '[]'::jsonb)
    into v_role_codes
  from public.user_role ur
  join public.role r on r.id = ur.role_id
  where ur.user_account_id = v_user_account_id
    and r.is_enabled = true;

  select coalesce(
    jsonb_agg(
      distinct jsonb_build_object(
        'permission_code', p.permission_code,
        'permission_name', p.permission_name,
        'platform_code', p.platform_code,
        'module_code', p.module_code,
        'action_code', p.action_code
      )
    ),
    '[]'::jsonb
  )
    into v_permissions
  from public.user_role ur
  join public.role_permission rp on rp.role_id = ur.role_id
  join public.permission p on p.id = rp.permission_id
  where ur.user_account_id = v_user_account_id
    and p.is_enabled = true;

  return jsonb_build_object(
    'user_account_id', v_user_account_id,
    'role_codes', v_role_codes,
    'permissions', v_permissions
  );
end;
$$;

grant execute on function public.get_current_user_permissions() to anon, authenticated, service_role;
