create unique index if not exists uq_dict_type_type_code
  on public.dict_type (type_code);

create unique index if not exists uq_dict_item_type_code
  on public.dict_item (dict_type_id, item_code);

create index if not exists idx_dict_type_enabled_sort
  on public.dict_type (is_enabled, sort_order);

create index if not exists idx_dict_item_enabled_sort
  on public.dict_item (dict_type_id, is_enabled, sort_order);
