import { supabase } from './supabase.js';

const APPROVAL_SELECT = [
  'id',
  'client_id',
  'title',
  'content_format',
  'item_count',
  'approval_url',
  'sent_at',
  'due_at',
  'status',
  'followup_stage',
  'approved_at',
  'published_at',
  'archived_at',
  'created_by',
  'created_at',
  'updated_at'
].join(',');

function databaseStatusToUiStatus(status, followupStage) {
  if (status === 'awaiting_approval') {
    if (followupStage === 1) return 'reminder_1';
    if (followupStage >= 2) return 'reminder_2';
    return 'waiting_approval';
  }

  if (status === 'changes_requested') return 'adjustment_requested';
  if (status === 'approved') return 'approved';
  if (status === 'published') return 'published';
  if (status === 'archived') return 'closed';
  return 'waiting_approval';
}

function approvalRowToState(row) {
  return {
    id: row.id,
    clientId: row.client_id,
    content: row.title,
    type: row.content_format || 'Conteúdo em aprovação',
    createdAt: row.sent_at || row.created_at,
    dueAt: row.due_at,
    status: databaseStatusToUiStatus(row.status, row.followup_stage),
    statusChangedAt: row.updated_at,
    link: row.approval_url,
    reminders: row.followup_stage,
    approvedAt: row.approved_at || null,
    finalizedAt: row.approved_at || row.archived_at || row.published_at || null,
    publishedAt: row.published_at || null
  };
}

function stateApprovalToEditableRow(approval) {
  return {
    client_id: approval.clientId,
    title: approval.content,
    content_format: approval.type,
    approval_url: approval.link,
    sent_at: approval.createdAt,
    due_at: approval.dueAt
  };
}

function uiStatusToDatabaseRow(uiStatus) {
  if (uiStatus === 'waiting_approval') return { status: 'awaiting_approval', followup_stage: 0 };
  if (uiStatus === 'reminder_1') return { status: 'awaiting_approval', followup_stage: 1 };
  if (uiStatus === 'reminder_2') return { status: 'awaiting_approval', followup_stage: 2 };
  if (uiStatus === 'adjustment_requested') return { status: 'changes_requested' };
  if (uiStatus === 'approved') return { status: 'approved' };
  if (uiStatus === 'published') return { status: 'published' };
  if (uiStatus === 'closed') return { status: 'archived' };
  throw new Error(`Status de aprovação inválido: ${uiStatus}`);
}

export async function loadApprovals() {
  const { data, error } = await supabase
    .from('approvals')
    .select(APPROVAL_SELECT)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(approvalRowToState);
}

export async function createApproval(approval, userId) {
  const payload = {
    ...stateApprovalToEditableRow(approval),
    status: 'awaiting_approval',
    followup_stage: 0,
    created_by: userId
  };
  const { data, error } = await supabase
    .from('approvals')
    .insert(payload)
    .select(APPROVAL_SELECT)
    .single();

  if (error) throw error;
  return approvalRowToState(data);
}

export async function updateApproval(id, approval) {
  const { data, error } = await supabase
    .from('approvals')
    .update(stateApprovalToEditableRow(approval))
    .eq('id', id)
    .select(APPROVAL_SELECT)
    .single();

  if (error) throw error;
  return approvalRowToState(data);
}

export async function setApprovalStatus(id, uiStatus) {
  const { data, error } = await supabase
    .from('approvals')
    .update(uiStatusToDatabaseRow(uiStatus))
    .eq('id', id)
    .select(APPROVAL_SELECT)
    .single();

  if (error) throw error;
  return approvalRowToState(data);
}

export async function archiveApproval(id) {
  const { data, error } = await supabase
    .from('approvals')
    .update({ status: 'archived' })
    .eq('id', id)
    .select(APPROVAL_SELECT)
    .single();

  if (error) throw error;
  return approvalRowToState(data);
}
