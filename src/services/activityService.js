import { friendlyError } from '../lib/errors.js';
import { missingTableError } from '../lib/schemaAvailability.js';
import { supabase } from './supabaseClient.js';

const MISSING = 'Ticket history is not in this database yet. Run supabase/migrations/002_support_features.sql in the Supabase SQL editor.';

export async function listActivity(ticketId) {
  if (!supabase) return { activity: [], error: 'Supabase is not configured.' };
  const { data, error } = await supabase
    .from('ticket_activity')
    .select('id, ticket_id, actor_id, event_type, from_value, to_value, created_at, actor:profiles!actor_id(full_name)')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true });
  if (error && missingTableError(error)) return { activity: [], error: MISSING };
  if (error && /relationship|schema cache/i.test(error.message || '')) {
    const plain = await supabase
      .from('ticket_activity')
      .select('id, ticket_id, actor_id, event_type, from_value, to_value, created_at')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });
    if (plain.error && missingTableError(plain.error)) return { activity: [], error: MISSING };
    if (plain.error) return { activity: [], error: friendlyError(plain.error, 'Ticket history could not be loaded.') };
    return { activity: plain.data ?? [] };
  }
  if (error) return { activity: [], error: friendlyError(error, 'Ticket history could not be loaded.') };
  return { activity: data ?? [] };
}

export async function listSlaTargets() {
  if (!supabase) return { targets: [], error: 'Supabase is not configured.' };
  const { data, error } = await supabase
    .from('sla_targets')
    .select('priority, response_minutes, resolution_minutes')
    .order('resolution_minutes', { ascending: true });
  if (error && missingTableError(error)) return { targets: [], source: 'builtin' };
  if (error) return { targets: [], source: 'builtin', error: friendlyError(error, 'SLA targets could not be loaded.') };
  return { targets: data ?? [], source: 'database' };
}
