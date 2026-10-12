import { friendlyError } from '../lib/errors.js';
import { isMissingResource, missingTableError, rememberMissingResource, shareRequest } from '../lib/schemaAvailability.js';
import { validateComment } from '../lib/validators.js';
import { supabase } from './supabaseClient.js';

const COMMENTS_MISSING = 'Comments are not in this database yet. Run supabase/migrations/002_support_features.sql in the Supabase SQL editor.';

export async function listComments(ticketId) {
  if (!supabase) return { comments: [], error: 'Supabase is not configured.' };
  if (isMissingResource('ticket_comments')) return { comments: [], error: COMMENTS_MISSING };
  return shareRequest(`comments:${ticketId}`, () => loadComments(ticketId));
}

async function loadComments(ticketId) {
  const { data, error } = await supabase
    .from('ticket_comments')
    .select(`
      id, ticket_id, author_id, body, is_internal, created_at,
      author:profiles!ticket_comments_author_id_fkey(id, full_name, role)
    `)
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true });
  if (error && missingTableError(error)) {
    rememberMissingResource('ticket_comments');
    return { comments: [], error: COMMENTS_MISSING };
  }
  if (error) return { comments: [], error: friendlyError(error, 'Comments could not be loaded.') };
  return { comments: data ?? [] };
}

export async function addComment(ticketId, body, isInternal = false) {
  if (!supabase) return { error: 'Supabase is not configured.' };
  if (isMissingResource('ticket_comments')) return { error: COMMENTS_MISSING };
  const validated = validateComment(body);
  if (!validated.ok) return { error: validated.error };
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return { error: 'Your session has expired. Sign in again.' };

  const { error } = await supabase.from('ticket_comments').insert({
    ticket_id: ticketId,
    author_id: userData.user.id,
    body: validated.value,
    is_internal: Boolean(isInternal),
  });
  if (error && missingTableError(error)) {
    rememberMissingResource('ticket_comments');
    return { error: COMMENTS_MISSING };
  }
  if (error) return { error: friendlyError(error, 'The comment could not be posted.') };
  return { error: '' };
}
