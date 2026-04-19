DO $$
DECLARE
  v_table_name text;
  v_tables text[] := ARRAY[
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
BEGIN
  FOREACH v_table_name IN ARRAY v_tables LOOP
    EXECUTE format(
      'create policy "Allow authenticated insert" on public.%I for insert to authenticated with check (true);',
      v_table_name
    );
    EXECUTE format(
      'create policy "Allow authenticated update" on public.%I for update to authenticated using (true) with check (true);',
      v_table_name
    );
    EXECUTE format(
      'create policy "Allow authenticated delete" on public.%I for delete to authenticated using (true);',
      v_table_name
    );
  END LOOP;
END;
$$;
