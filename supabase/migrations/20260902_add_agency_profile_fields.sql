alter table public.agency_settings
  add column if not exists agency_display_name text,
  add column if not exists agency_phone text,
  add column if not exists agency_email text;

update public.agency_settings
set agency_display_name = coalesce(nullif(agency_display_name, ''), agency_name)
where id = 1;
