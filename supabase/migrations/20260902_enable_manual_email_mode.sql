update public.agency_settings
set email_mode = 'manual',
    updated_at = now()
where id = 1
  and email_mode = 'disabled';
