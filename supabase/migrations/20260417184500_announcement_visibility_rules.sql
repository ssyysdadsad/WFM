create index if not exists idx_announcement_published_at_desc
  on public.announcement (published_at desc);

create index if not exists idx_announcement_type_published_at_desc
  on public.announcement (announcement_type_dict_item_id, published_at desc);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ck_announcement_visibility_scope_type'
  ) then
    alter table public.announcement
      add constraint ck_announcement_visibility_scope_type
      check (visibility_scope_type in ('all', 'role', 'department', 'custom'));
  end if;
end $$;
