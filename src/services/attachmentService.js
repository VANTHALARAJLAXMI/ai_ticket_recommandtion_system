import { friendlyError } from '../lib/errors.js';
import { missingTableError } from '../lib/schemaAvailability.js';
import { validateAttachment } from '../lib/validators.js';
import { supabase } from './supabaseClient.js';

const BUCKET = 'ticket-attachments';
const MISSING = 'Attachments are not in this database yet. Run supabase/migrations/002_support_features.sql in the Supabase SQL editor.';

function safeName(name) {
  const cleaned = String(name || 'file').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned.slice(0, 80) || 'file';
}

export async function listAttachments(ticketId) {
  if (!supabase) return { attachments: [], error: 'Supabase is not configured.' };
  const { data, error } = await supabase
    .from('ticket_attachments')
    .select('id, ticket_id, file_name, mime_type, size_bytes, storage_path, created_at')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true });
  if (error && missingTableError(error)) return { attachments: [], error: MISSING };
  if (error) return { attachments: [], error: friendlyError(error, 'Attachments could not be loaded.') };
  return { attachments: data ?? [] };
}

export async function uploadAttachment(ticketId, file) {
  if (!supabase) return { error: 'Supabase is not configured.' };
  const invalid = validateAttachment(file);
  if (invalid) return { error: invalid };
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return { error: 'Your session has expired. Sign in again.' };

  const path = `${ticketId}/${crypto.randomUUID()}-${safeName(file.name)}`;
  const uploaded = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (uploaded.error) return { error: friendlyError(uploaded.error, 'The file could not be uploaded.') };

  const { error } = await supabase.from('ticket_attachments').insert({
    ticket_id: ticketId,
    uploaded_by: userData.user.id,
    storage_path: path,
    file_name: file.name.slice(0, 180),
    mime_type: file.type,
    size_bytes: file.size,
  });
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    if (missingTableError(error)) return { error: MISSING };
    return { error: friendlyError(error, 'The file could not be linked to this ticket.') };
  }
  return { error: '' };
}

export async function openAttachment(path) {
  if (!supabase) return { url: '', error: 'Supabase is not configured.' };
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60);
  if (error) return { url: '', error: friendlyError(error, 'The file could not be opened.') };
  return { url: data?.signedUrl || '', error: data?.signedUrl ? '' : 'The file could not be opened.' };
}
