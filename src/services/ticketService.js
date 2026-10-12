import { CATEGORIES, PAGE_SIZE } from '../lib/constants.js';
import { friendlyError } from '../lib/errors.js';
import { firstRelation, readEmbeddedTicketDetails } from '../lib/format.js';
import { summarizeAdminTickets, summarizeAgentTickets, summarizeEmployeeTickets } from '../lib/stats.js';
import { sanitizeSearch, validateCategoryName, validateResolutionNotes, validateTicketInput } from '../lib/validators.js';
import { supabase } from './supabaseClient.js';

const TICKET_SELECT = `
  id, ticket_number, user_id, assigned_to, assigned_by, resolved_by, title, description, category,
  priority, status, resolution_notes, created_at, updated_at, resolved_at,
  ai_summary, ai_suggestion, ai_sentiment, ai_confidence, ai_requires_human,
  owner:profiles!user_id(id, full_name, role),
  assignee:profiles!assigned_to(id, full_name, role),
  assigner:profiles!assigned_by(id, full_name, role),
  resolver:profiles!resolved_by(id, full_name, role)
`;

const TICKET_SELECT_PLAIN = `
  id, ticket_number, user_id, assigned_to, assigned_by, resolved_by, title, description, category,
  priority, status, resolution_notes, created_at, updated_at, resolved_at
`;

function missingRelation(error) {
  return /schema cache|PGRST20[25]|could not find the (table|function|relationship|column)|does not exist/i.test(String(error?.message || error || ''));
}

function requireClient() {
  if (!supabase) {
    return { error: 'Supabase is not configured. Add the environment variables and restart the app.' };
  }
  return null;
}

function normalizeTicket(row) {
  if (!row) return null;
  const stored = firstRelation(row.ai);
  if (stored && !Array.isArray(stored.troubleshooting_steps)) stored.troubleshooting_steps = [];
  const ai = stored || (row.ai_summary
    ? {
      category: row.category,
      suggested_priority: row.priority,
      sentiment: row.ai_sentiment || 'Neutral',
      suggested_team: 'Support',
      summary: row.ai_summary,
      probable_cause: row.ai_suggestion || 'Not recorded',
      troubleshooting_steps: [],
      confidence: Number(row.ai_confidence) || 0,
      escalation_recommended: Boolean(row.ai_requires_human),
    }
    : null);
  const embedded = readEmbeddedTicketDetails(row.description);
  return {
    ...row,
    description: embedded.description || row.description,
    business_impact: row.business_impact || embedded.business_impact || 'Not recorded',
    urgency: row.urgency || embedded.urgency || row.priority || 'Medium',
    affected_system: row.affected_system || embedded.affected_system || '',
    ai,
  };
}

export async function listCategories({ includeInactive = false } = {}) {
  const missing = requireClient();
  if (missing) return { categories: [], error: missing.error };
  let query = supabase
    .from('categories')
    .select('id, name, description, is_active, created_at, updated_at')
    .order('name', { ascending: true });
  if (!includeInactive) query = query.eq('is_active', true);
  const { data, error } = await query;
  if (error && missingRelation(error)) {
    return {
      categories: CATEGORIES.map((name) => ({
        id: name,
        name,
        description: '',
        is_active: true,
      })),
    };
  }
  if (error) return { categories: [], error: friendlyError(error, 'Categories could not be loaded.') };
  return { categories: data ?? [] };
}

export async function createCategory(input) {
  const missing = requireClient();
  if (missing) return missing;
  const nameError = validateCategoryName(input.name);
  if (nameError) return { error: nameError };
  const { data, error } = await supabase
    .from('categories')
    .insert({
      name: input.name.trim(),
      description: String(input.description ?? '').trim().slice(0, 300),
      is_active: input.is_active !== false,
    })
    .select('id, name, description, is_active, created_at, updated_at')
    .single();
  if (error) return { error: friendlyError(error, 'The category could not be created.') };
  return { category: data };
}

export async function updateCategory(id, input) {
  const missing = requireClient();
  if (missing) return missing;
  const nameError = validateCategoryName(input.name);
  if (nameError) return { error: nameError };
  const { data, error } = await supabase
    .from('categories')
    .update({
      name: input.name.trim(),
      description: String(input.description ?? '').trim().slice(0, 300),
      is_active: Boolean(input.is_active),
    })
    .eq('id', id)
    .select('id, name, description, is_active, created_at, updated_at')
    .single();
  if (error) return { error: friendlyError(error, 'The category could not be updated.') };
  return { category: data };
}

export async function deleteCategory(id) {
  const missing = requireClient();
  if (missing) return missing;
  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) return { error: friendlyError(error, 'The category could not be deleted.') };
  return { error: '' };
}

export async function createTicket(input, categories) {
  const missing = requireClient();
  if (missing) return missing;
  const validated = validateTicketInput(input, categories);
  if (!validated.ok) return { error: 'Check the highlighted fields.', fieldErrors: validated.errors };

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return { error: 'Your session has expired. Sign in again.' };

  const embeddedDescription = [
    validated.value.description,
    `Business impact: ${validated.value.business_impact}`,
    `Urgency: ${validated.value.urgency}`,
    validated.value.affected_system ? `Affected system: ${validated.value.affected_system}` : '',
  ].filter(Boolean).join('\n\n');
  const payload = {
    user_id: userData.user.id,
    title: validated.value.title,
    description: validated.value.description,
    category: validated.value.category,
    priority: validated.value.priority,
    business_impact: validated.value.business_impact,
    urgency: validated.value.urgency,
    affected_system: validated.value.affected_system,
  };
  let { data, error } = await supabase.from('tickets').insert(payload).select('id, ticket_number').single();
  if (error && missingRelation(error)) {
    ({ data, error } = await supabase.from('tickets').insert({
      user_id: payload.user_id,
      title: payload.title,
      description: embeddedDescription,
      category: payload.category,
      priority: payload.priority,
    }).select('id, ticket_number').single());
  }
  if (error) return { error: friendlyError(error, 'The ticket could not be created.') };
  return { ticket: data };
}

export async function listTickets({
  scope = 'mine',
  userId,
  search = '',
  status = '',
  priority = '',
  category = '',
  assignee = '',
  from = '',
  to = '',
  sort = 'updated',
  page = 0,
  pageSize = PAGE_SIZE,
} = {}) {
  const missing = requireClient();
  if (missing) return { tickets: [], count: 0, error: missing.error };

  if ((scope === 'mine' || scope === 'assigned' || scope === 'queue') && !userId) {
    return { tickets: [], count: 0 };
  }

  let query = supabase.from('tickets').select(TICKET_SELECT, { count: 'exact' });
  if (scope === 'mine') query = query.eq('user_id', userId);
  if (scope === 'assigned') query = query.eq('assigned_to', userId);
  if (scope === 'unassigned') query = query.is('assigned_to', null);
  if (status) query = query.eq('status', status);
  if (priority) query = query.eq('priority', priority);
  if (category) query = query.eq('category', category);
  if (assignee) query = query.eq('assigned_to', assignee);
  if (from) query = query.gte('created_at', `${from}T00:00:00`);
  if (to) query = query.lte('created_at', `${to}T23:59:59`);

  const term = sanitizeSearch(search);
  const searchFilter = term ? `ticket_number.ilike.%${term}%,title.ilike.%${term}%` : '';
  if (scope === 'queue' && searchFilter) {
    query = query.or(
      `and(assigned_to.eq.${userId},or(${searchFilter})),and(assigned_to.is.null,or(${searchFilter}))`,
    );
  } else if (scope === 'queue') {
    query = query.or(`assigned_to.eq.${userId},assigned_to.is.null`);
  } else if (searchFilter) {
    query = query.or(searchFilter);
  }

  if (sort === 'priority') {
    query = query.order('priority', { ascending: true }).order('updated_at', { ascending: false });
  } else if (sort === 'created') {
    query = query.order('created_at', { ascending: false });
  } else {
    query = query.order('updated_at', { ascending: false });
  }

  const start = page * pageSize;
  let { data, error, count } = await query.range(start, start + pageSize - 1);
  if (error && missingRelation(error)) {
    let plain = supabase.from('tickets').select(TICKET_SELECT_PLAIN, { count: 'exact' });
    if (scope === 'mine') plain = plain.eq('user_id', userId);
    if (scope === 'assigned') plain = plain.eq('assigned_to', userId);
    if (scope === 'unassigned') plain = plain.is('assigned_to', null);
    if (status) plain = plain.eq('status', status);
    if (priority) plain = plain.eq('priority', priority);
    if (category) plain = plain.eq('category', category);
    if (assignee) plain = plain.eq('assigned_to', assignee);
    if (from) plain = plain.gte('created_at', `${from}T00:00:00`);
    if (to) plain = plain.lte('created_at', `${to}T23:59:59`);
    if (scope === 'queue') plain = plain.or(`assigned_to.eq.${userId},assigned_to.is.null`);
    if (searchFilter) plain = plain.or(searchFilter);
    plain = sort === 'created'
      ? plain.order('created_at', { ascending: false })
      : plain.order('updated_at', { ascending: false });
    ({ data, error, count } = await plain.range(start, start + pageSize - 1));
  }
  if (error) return { tickets: [], count: 0, error: friendlyError(error, 'Tickets could not be loaded.') };
  return { tickets: (data ?? []).map(normalizeTicket), count: count ?? 0 };
}

export async function getTicket(id) {
  const missing = requireClient();
  if (missing) return { ticket: null, error: missing.error };
  let { data, error } = await supabase.from('tickets').select(TICKET_SELECT).eq('id', id).maybeSingle();
  if (error && missingRelation(error)) {
    ({ data, error } = await supabase.from('tickets').select(TICKET_SELECT_PLAIN).eq('id', id).maybeSingle());
  }
  if (error) return { ticket: null, error: friendlyError(error, 'The ticket could not be loaded.') };
  if (!data) return { ticket: null, error: 'That ticket could not be found or you do not have access to it.' };
  const analysis = await supabase
    .from('ticket_ai_analysis')
    .select('category, suggested_priority, sentiment, suggested_team, summary, probable_cause, troubleshooting_steps, confidence, escalation_recommended')
    .eq('ticket_id', id)
    .maybeSingle();
  if (!analysis.error && analysis.data) data.ai = analysis.data;
  return { ticket: normalizeTicket(data) };
}

async function fetchTicketRows(columns, apply) {
  const pageSize = 1000;
  const rows = [];
  for (let from = 0; from < 20000; from += pageSize) {
    let query = supabase.from('tickets').select(columns).range(from, from + pageSize - 1);
    if (apply) query = apply(query);
    const { data, error } = await query;
    if (error) return { rows: [], error };
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) return { rows, error: null };
  }
  return { rows, error: null };
}

export async function getDashboardStats(kind, userId) {
  const missing = requireClient();
  if (missing) return { stats: null, error: missing.error };
  if ((kind === 'employee' || kind === 'agent') && !userId) {
    return { stats: null, error: 'Your session has expired. Sign in again.' };
  }

  const loaded = kind === 'admin'
    ? await fetchTicketRows('id, ticket_number, title, category, priority, status, created_at, resolved_at, assigned_to')
    : kind === 'agent'
      ? await fetchTicketRows('assigned_to, status, priority')
      : await fetchTicketRows('status', (query) => query.eq('user_id', userId));
  if (loaded.error) return { stats: null, error: friendlyError(loaded.error, 'Dashboard figures could not be loaded.') };

  if (kind === 'admin') return { stats: summarizeAdminTickets(loaded.rows) };
  if (kind === 'agent') return { stats: summarizeAgentTickets(loaded.rows, userId) };
  return { stats: summarizeEmployeeTickets(loaded.rows) };
}

async function updateTicketRow(ticketId, patch, failureMessage) {
  const { error } = await supabase.from('tickets').update(patch).eq('id', ticketId);
  if (error) return { error: friendlyError(error, failureMessage) };
  return { error: '' };
}

export async function reopenTicket(ticketId) {
  const missing = requireClient();
  if (missing) return missing;
  const { error } = await supabase.rpc('reopen_ticket', { p_ticket_id: ticketId });
  if (error) return { error: friendlyError(error, 'The ticket could not be reopened.') };
  return { error: '' };
}

export async function updateTicketProgress(ticketId, status) {
  const missing = requireClient();
  if (missing) return missing;
  const { error } = await supabase.rpc('update_ticket_progress', {
    p_ticket_id: ticketId,
    p_status: status,
  });
  if (error) return { error: friendlyError(error, 'The status could not be updated.') };
  return { error: '' };
}

export async function resolveTicket(ticketId, resolutionNotes = '') {
  const missing = requireClient();
  if (missing) return missing;
  const noteError = validateResolutionNotes('Closed', resolutionNotes);
  if (noteError) return { error: noteError };
  const { error } = await supabase.rpc('resolve_ticket', {
    p_ticket_id: ticketId,
    p_notes: resolutionNotes,
  });
  if (error) return { error: friendlyError(error, 'The ticket could not be resolved.') };
  return { error: '' };
}

export async function updateTicketPriority(ticketId, priority) {
  const missing = requireClient();
  if (missing) return missing;
  const { error } = await supabase.rpc('update_ticket_priority', {
    p_ticket_id: ticketId,
    p_priority: priority,
  });
  if (!error) return { error: '' };
  if (!missingRelation(error)) return { error: friendlyError(error, 'The priority could not be updated.') };
  return updateTicketRow(ticketId, { priority }, 'The priority could not be updated.');
}

export async function updateTicketCategory(ticketId, category) {
  const missing = requireClient();
  if (missing) return missing;
  const { error } = await supabase.rpc('update_ticket_category', {
    p_ticket_id: ticketId,
    p_category: category,
  });
  if (!error) return { error: '' };
  if (!missingRelation(error)) return { error: friendlyError(error, 'The category could not be updated.') };
  return updateTicketRow(ticketId, { category }, 'The category could not be updated.');
}

export async function assignTicket(ticketId, agentId) {
  const missing = requireClient();
  if (missing) return missing;
  const { error } = await supabase.rpc('assign_ticket', {
    p_ticket_id: ticketId,
    p_agent_id: agentId,
  });
  if (error) return { error: friendlyError(error, 'The ticket could not be assigned.') };
  return { error: '' };
}

export async function listStaff() {
  const missing = requireClient();
  if (missing) return { staff: [], error: missing.error };
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .in('role', ['agent', 'admin'])
    .order('full_name', { ascending: true });
  if (error) return { staff: [], error: friendlyError(error, 'Support staff could not be loaded.') };
  return { staff: data ?? [] };
}
