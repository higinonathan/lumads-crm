alter table public.clients
  add column if not exists whatsapp_group_url text;

comment on column public.clients.whatsapp_group_url is
  'Link de convite do grupo principal de WhatsApp do cliente, usado apenas internamente pelo CRM.';
