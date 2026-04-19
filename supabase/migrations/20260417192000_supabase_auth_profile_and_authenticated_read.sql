create or replace function public.get_current_user_profile()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_email text := nullif(current_setting('request.jwt.claim.email', true), '');
  v_phone text := nullif(current_setting('request.jwt.claim.phone', true), '');
  v_account public.user_account%rowtype;
  v_employee_name text;
  v_role_codes jsonb := '[]'::jsonb;
  v_roles jsonb := '[]'::jsonb;
  v_permissions jsonb := '[]'::jsonb;
begin
  if v_auth_user_id is not null then
    select *
      into v_account
    from public.user_account
    where auth_user_id = v_auth_user_id
      and is_enabled = true
    limit 1;
  end if;

  if v_account.id is null and v_email is not null then
    select *
      into v_account
    from public.user_account
    where username = v_email
      and is_enabled = true
    limit 1;
  end if;

  if v_account.id is null and v_phone is not null then
    select *
      into v_account
    from public.user_account
    where mobile_number = v_phone
      and is_enabled = true
    limit 1;
  end if;

  if v_account.id is null then
    return null;
  end if;

  select e.full_name
    into v_employee_name
  from public.employee e
  where e.id = v_account.employee_id
  limit 1;

  select coalesce(jsonb_agg(distinct r.role_code), '[]'::jsonb)
    into v_role_codes
  from public.user_role ur
  join public.role r on r.id = ur.role_id
  where ur.user_account_id = v_account.id
    and r.is_enabled = true;

  select coalesce(
    jsonb_agg(
      distinct jsonb_build_object(
        'id', r.id,
        'role_code', r.role_code,
        'role_name', r.role_name,
        'role_scope', r.role_scope
      )
    ),
    '[]'::jsonb
  )
    into v_roles
  from public.user_role ur
  join public.role r on r.id = ur.role_id
  where ur.user_account_id = v_account.id
    and r.is_enabled = true;

  select coalesce(
    jsonb_agg(
      distinct jsonb_build_object(
        'id', p.id,
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
  where ur.user_account_id = v_account.id
    and p.is_enabled = true;

  return jsonb_build_object(
    'id', v_account.id,
    'auth_user_id', v_account.auth_user_id,
    'username', coalesce(v_account.username, v_account.id::text),
    'display_name', coalesce(v_employee_name, v_account.username, '未命名账号'),
    'employee_id', v_account.employee_id,
    'employee_name', v_employee_name,
    'account_status', v_account.account_status,
    'role_codes', v_role_codes,
    'roles', v_roles,
    'permissions', v_permissions,
    'is_admin', coalesce(v_role_codes ? 'admin', false)
  );
end;
$$;

grant execute on function public.get_current_user_profile() to anon, authenticated, service_role;

do $$
declare
  v_table_name text;
  v_tables text[] := array[
    'dict_type',
    'dict_item',
    'scene',
    'department',
    'channel',
    'employee',
    'skill',
    'labor_rule',
    'project',
    'task',
    'device',
    'schedule_version',
    'schedule',
    'shift_change_request',
    'announcement',
    'employee_work_metric',
    'schedule_import_batch',
    'user_account',
    'role',
    'permission',
    'user_role',
    'role_permission'
  ];
begin
  foreach v_table_name in array v_tables loop
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = v_table_name
        and policyname = 'Allow authenticated read all'
    ) then
      execute format(
        'create policy %I on public.%I for select to authenticated using (true)',
        'Allow authenticated read all',
        v_table_name
      );
    end if;
  end loop;
end;
$$;
