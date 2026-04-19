create unique index if not exists uq_employee_skill_employee_skill
  on public.employee_skill (employee_id, skill_id);

create unique index if not exists uq_employee_primary_skill_enabled
  on public.employee_skill (employee_id)
  where is_primary = true and is_enabled = true;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ck_employee_skill_level'
  ) then
    alter table public.employee_skill
      add constraint ck_employee_skill_level
      check (skill_level in (1, 2, 3));
  end if;
end $$;
