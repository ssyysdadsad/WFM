create or replace function public.get_current_user_permissions()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
  v_user_account_id uuid;
  v_role_codes jsonb := '[]'::jsonb;
  v_permissions jsonb := '[]'::jsonb;
begin
  v_username := nullif(current_setting('request.jwt.claim.email', true), '');

  if v_username is null then
    return jsonb_build_object(
      'user_account_id', null,
      'role_codes', v_role_codes,
      'permissions', v_permissions
    );
  end if;

  select id
    into v_user_account_id
  from public.user_account
  where username = v_username
    and is_enabled = true
  limit 1;

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
