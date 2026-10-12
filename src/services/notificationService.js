import { friendlyError } from '../lib/errors.js';
import { missingTableError } from '../lib/schemaAvailability.js';
import { supabase } from './supabaseClient.js';

const MISSING = 'Notifications are not in this database yet. Run supabase/migrations/002_support_features.sql in the Supabase SQL editor.';

export async function listNotifications() {
  if (!supabase) return { notifications: [], error: 'Supabase is not configured.' };
  const { data, error } = await supabase
    .from('notifications')
    .select('id, ticket_id, kind, title, body, read_at, created_at')
    .order('created_at', { ascending: false })
    .limit(30);
  if (error && missingTableError(error)) return { notifications: [], error: MISSING };
  if (error) return { notifications: [], error: friendlyError(error, 'Notifications could not be loaded.') };
  return { notifications: data ?? [] };
}

export async function markNotificationRead(id) {
  if (!supabase) return { error: 'Supabase is not configured.' };
  const { error } = await supabase.rpc('mark_notification_read', { p_id: id });
  if (error) return { error: friendlyError(error, 'The notification could not be marked read.') };
  return { error: '' };
}

export async function markAllNotificationsRead() {
  if (!supabase) return { error: 'Supabase is not configured.' };
  const { error } = await supabase.rpc('mark_all_notifications_read');
  if (error) return { error: friendlyError(error, 'Notifications could not be marked read.') };
  return { error: '' };
}
