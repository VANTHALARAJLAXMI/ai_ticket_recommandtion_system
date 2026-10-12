import { friendlyError } from '../lib/errors.js';
import { missingTableError } from '../lib/schemaAvailability.js';
import { validateFeedback } from '../lib/validators.js';
import { supabase } from './supabaseClient.js';

const MISSING = 'Feedback is not in this database yet. Run supabase/migrations/002_support_features.sql in the Supabase SQL editor.';

export async function getFeedback(ticketId) {
  if (!supabase) return { feedback: null, error: 'Supabase is not configured.' };
  const { data, error } = await supabase
    .from('ticket_feedback')
    .select('id, ticket_id, user_id, rating, comment, created_at, updated_at')
    .eq('ticket_id', ticketId)
    .maybeSingle();
  if (error && missingTableError(error)) return { feedback: null, error: MISSING };
  if (error) return { feedback: null, error: friendlyError(error, 'Feedback could not be loaded.') };
  return { feedback: data };
}

export async function saveFeedback(ticketId, rating, comment) {
  if (!supabase) return { error: 'Supabase is not configured.' };
  const validated = validateFeedback(rating, comment);
  if (!validated.ok) return { error: validated.error };
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return { error: 'Your session has expired. Sign in again.' };

  const existing = await getFeedback(ticketId);
  if (existing.error) return { error: existing.error };
  const payload = { ...validated.value, ticket_id: ticketId, user_id: userData.user.id };
  const query = existing.feedback
    ? supabase.from('ticket_feedback').update({ rating: payload.rating, comment: payload.comment, updated_at: new Date().toISOString() }).eq('id', existing.feedback.id)
    : supabase.from('ticket_feedback').insert(payload);
  const { error } = await query;
  if (error && missingTableError(error)) return { error: MISSING };
  if (error) return { error: friendlyError(error, 'The rating could not be saved.') };
  return { error: '' };
}
