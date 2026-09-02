alter table public.message_queue
  add column if not exists created_by uuid references auth.users(id) on delete set null;

create index if not exists message_queue_created_by_idx
  on public.message_queue (created_by);

create or replace function private.sync_message_status_timestamps()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.status in ('sent', 'delivered', 'read') and new.sent_at is null then new.sent_at := now(); end if;
    if new.status in ('delivered', 'read') and new.delivered_at is null then new.delivered_at := now(); end if;
    if new.status = 'read' and new.read_at is null then new.read_at := now(); end if;
    if new.status = 'failed' and new.failed_at is null then new.failed_at := now(); end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    if new.status in ('sent', 'delivered', 'read') and new.sent_at is null then new.sent_at := now(); end if;
    if new.status in ('delivered', 'read') and new.delivered_at is null then new.delivered_at := now(); end if;
    if new.status = 'read' and new.read_at is null then new.read_at := now(); end if;
    if new.status = 'failed' and new.failed_at is null then new.failed_at := now(); end if;
  end if;
  return new;
end;
$$;

drop trigger if exists message_queue_sync_status_timestamps on public.message_queue;
create trigger message_queue_sync_status_timestamps
before insert or update on public.message_queue
for each row execute function private.sync_message_status_timestamps();

create or replace function public.prepare_manual_communication(
  p_approval_id uuid,
  p_channel text,
  p_template_key text
)
returns public.message_queue
language plpgsql
security invoker
set search_path = public, private, auth
as $$
declare
  v_approval public.approvals%rowtype;
  v_client public.clients%rowtype;
  v_template public.message_templates%rowtype;
  v_existing public.message_queue%rowtype;
  v_message public.message_queue%rowtype;
  v_recipient text;
  v_prepared_text text;
  v_subject text;
  v_contact_name text;
  v_due_text text;
begin
  if not private.is_app_member() then raise exception 'Acesso negado.'; end if;
  if p_channel not in ('whatsapp', 'email') then raise exception 'Canal de comunicação inválido.'; end if;

  select * into v_approval from public.approvals where id = p_approval_id;
  if not found then raise exception 'Aprovação não encontrada.'; end if;

  select * into v_client from public.clients where id = v_approval.client_id and is_active = true;
  if not found then raise exception 'Cliente não encontrado ou inativo.'; end if;

  select * into v_template
  from public.message_templates
  where template_key = p_template_key and channel = p_channel and is_active = true;
  if not found then raise exception 'Modelo de mensagem não encontrado ou inativo.'; end if;

  if p_template_key in ('reminder_1', 'reminder_2', 'final_notice') and v_approval.status <> 'awaiting_approval' then
    raise exception 'Esta aprovação não está mais aguardando retorno.';
  end if;

  if p_channel = 'whatsapp' then
    v_recipient := coalesce(nullif(trim(v_client.whatsapp_e164), ''), nullif(trim(v_client.phone), ''));
  else
    v_recipient := nullif(trim(v_client.email), '');
  end if;
  if v_recipient is null then
    raise exception 'O cliente não possui % cadastrado.', case when p_channel = 'whatsapp' then 'WhatsApp' else 'e-mail' end;
  end if;

  v_contact_name := coalesce(nullif(trim(v_client.contact_name), ''), nullif(trim(v_client.company_name), ''), 'cliente');
  v_due_text := case when v_approval.due_at is null then '' else to_char(v_approval.due_at at time zone 'America/Cuiaba', 'DD/MM/YYYY HH24:MI') end;

  v_prepared_text := coalesce(v_template.body, '');
  v_prepared_text := replace(v_prepared_text, '{{nome}}', v_contact_name);
  v_prepared_text := replace(v_prepared_text, '{{conteudo}}', coalesce(v_approval.title, ''));
  v_prepared_text := replace(v_prepared_text, '{{link}}', coalesce(v_approval.approval_url, ''));
  v_prepared_text := replace(v_prepared_text, '{{prazo}}', v_due_text);

  v_subject := coalesce(v_template.subject, '');
  v_subject := replace(v_subject, '{{nome}}', v_contact_name);
  v_subject := replace(v_subject, '{{conteudo}}', coalesce(v_approval.title, ''));
  v_subject := replace(v_subject, '{{link}}', coalesce(v_approval.approval_url, ''));
  v_subject := replace(v_subject, '{{prazo}}', v_due_text);
  if p_channel = 'whatsapp' then v_subject := null; end if;

  select * into v_existing
  from public.message_queue
  where approval_id = v_approval.id and template_id = v_template.id
  limit 1;

  if found then
    if v_existing.status in ('sent', 'delivered', 'read') then
      raise exception 'Esta comunicação já foi registrada como enviada.';
    end if;
    update public.message_queue
    set client_id = v_client.id, channel = p_channel, delivery_mode = 'manual', scheduled_at = now(),
        status = 'ready_manual', prepared_text = v_prepared_text, provider = null, recipient = v_recipient,
        subject = v_subject, provider_message_id = null, sent_at = null, delivered_at = null, read_at = null,
        failed_at = null, error_message = null, created_by = auth.uid()
    where id = v_existing.id
    returning * into v_message;
  else
    insert into public.message_queue (
      approval_id, client_id, template_id, channel, delivery_mode, scheduled_at, status,
      prepared_text, recipient, subject, created_by
    ) values (
      v_approval.id, v_client.id, v_template.id, p_channel, 'manual', now(), 'ready_manual',
      v_prepared_text, v_recipient, v_subject, auth.uid()
    ) returning * into v_message;
  end if;

  return v_message;
end;
$$;

create or replace function public.confirm_manual_communication_sent(p_message_id uuid)
returns public.message_queue
language plpgsql
security invoker
set search_path = public, private, auth
as $$
declare
  v_message public.message_queue%rowtype;
  v_template_key text;
  v_target_stage smallint;
  v_approval_status text;
begin
  if not private.is_app_member() then raise exception 'Acesso negado.'; end if;

  select * into v_message from public.message_queue where id = p_message_id;
  if not found then raise exception 'Comunicação não encontrada.'; end if;
  select template_key into v_template_key from public.message_templates where id = v_message.template_id;

  if v_message.status in ('sent', 'delivered', 'read') then return v_message; end if;
  if v_message.delivery_mode <> 'manual' then raise exception 'Esta comunicação não utiliza envio manual.'; end if;

  select status into v_approval_status from public.approvals where id = v_message.approval_id;
  if v_template_key in ('reminder_1', 'reminder_2', 'final_notice') and v_approval_status <> 'awaiting_approval' then
    raise exception 'Esta aprovação não está mais aguardando retorno.';
  end if;

  update public.message_queue
  set status = 'sent', sent_at = coalesce(sent_at, now()), error_message = null
  where id = p_message_id
  returning * into v_message;

  v_target_stage := case v_template_key when 'reminder_1' then 1 when 'reminder_2' then 2 when 'final_notice' then 3 else 0 end;
  if v_target_stage > 0 then
    update public.approvals
    set followup_stage = greatest(followup_stage, v_target_stage)
    where id = v_message.approval_id and status = 'awaiting_approval';
  end if;
  return v_message;
end;
$$;

create or replace function public.cancel_manual_communication(p_message_id uuid)
returns public.message_queue
language plpgsql
security invoker
set search_path = public, private
as $$
declare
  v_message public.message_queue%rowtype;
begin
  if not private.is_app_member() then raise exception 'Acesso negado.'; end if;
  update public.message_queue
  set status = 'cancelled'
  where id = p_message_id and delivery_mode = 'manual' and status not in ('sent', 'delivered', 'read')
  returning * into v_message;
  if not found then raise exception 'Comunicação não encontrada ou já finalizada.'; end if;
  return v_message;
end;
$$;

revoke execute on function public.prepare_manual_communication(uuid, text, text) from public, anon;
revoke execute on function public.confirm_manual_communication_sent(uuid) from public, anon;
revoke execute on function public.cancel_manual_communication(uuid) from public, anon;

grant execute on function public.prepare_manual_communication(uuid, text, text) to authenticated;
grant execute on function public.confirm_manual_communication_sent(uuid) to authenticated;
grant execute on function public.cancel_manual_communication(uuid) to authenticated;
