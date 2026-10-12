import { friendlyError } from '../lib/errors.js';
import { cleanText, validateFullName, validatePassword } from '../lib/validators.js';
import { supabase } from './supabaseClient.js';

function requireClient() {
  if (!supabase) {
    return { error: 'Supabase is not configured. Add the environment variables and restart the app.' };
  }
  return null;
}

export function mapAuthError(error) {
  const message = String(error?.message || '');
  if (/invalid login credentials/i.test(message)) return 'The email or password is incorrect.';
  if (/email not confirmed/i.test(message)) return 'Confirm your email before signing in.';
  if (/already registered|already exists/i.test(message)) {
    return 'An account with this email already exists. Sign in instead.';
  }
  if (/password/i.test(message) && /weak|short|least/i.test(message)) {
    return 'Choose a stronger password with at least 8 characters, a letter, and a number.';
  }
  if (/rate limit/i.test(message)) return 'Too many attempts. Wait a moment and try again.';
  if (/network|fetch/i.test(message)) return 'Network connection failed. Check your connection and try again.';
  return friendlyError(error, 'Authentication failed. Please try again.');
}

export async function signIn(email, password) {
  const missing = requireClient();
  if (missing) return missing;
  const { data, error } = await supabase.auth.signInWithPassword({
    email: cleanText(email).toLowerCase(),
    password,
  });
  if (error) return { error: mapAuthError(error) };
  return { session: data.session, user: data.user };
}

export async function signUp({ email, password, fullName }) {
  const missing = requireClient();
  if (missing) return missing;
  const nameError = validateFullName(fullName);
  if (nameError) return { error: nameError };
  const passwordError = validatePassword(password);
  if (passwordError) return { error: passwordError };

  const { data, error } = await supabase.auth.signUp({
    email: cleanText(email).toLowerCase(),
    password,
    options: {
      data: { full_name: cleanText(fullName) },
    },
  });
  if (error) return { error: mapAuthError(error) };

  const identities = data.user?.identities ?? [];
  if (data.user && identities.length === 0) {
    return { error: 'An account with this email already exists. Sign in instead.' };
  }
  return {
    session: data.session,
    user: data.user,
    needsConfirmation: !data.session,
  };
}

export async function signOut() {
  const missing = requireClient();
  if (missing) return missing;
  const { error } = await supabase.auth.signOut();
  if (error) return { error: friendlyError(error, 'Sign out failed. Please try again.') };
  return { error: '' };
}

export async function fetchProfile(userId) {
  const missing = requireClient();
  if (missing) return { profile: null, error: missing.error };
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, created_at, updated_at')
    .eq('id', userId)
    .maybeSingle();
  if (error) return { profile: null, error: friendlyError(error, 'Your profile could not be loaded.') };
  if (!data) {
    return {
      profile: null,
      error: 'Your profile is not ready yet. Confirm your email if required, then sign in again.',
    };
  }
  return { profile: data, error: '' };
}

export async function updateProfileName(userId, fullName) {
  const missing = requireClient();
  if (missing) return missing;
  const nameError = validateFullName(fullName);
  if (nameError) return { error: nameError };
  const { data, error } = await supabase
    .from('profiles')
    .update({ full_name: cleanText(fullName) })
    .eq('id', userId)
    .select('id, full_name, email, role, created_at, updated_at')
    .single();
  if (error) return { error: friendlyError(error, 'Your profile could not be updated.') };
  return { profile: data };
}

export async function updatePassword(password) {
  const missing = requireClient();
  if (missing) return missing;
  const passwordError = validatePassword(password);
  if (passwordError) return { error: passwordError };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: mapAuthError(error) };
  return { error: '' };
}

export async function listUsers() {
  const missing = requireClient();
  if (missing) return { users: [], error: missing.error };
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, created_at, updated_at')
    .order('created_at', { ascending: false });
  if (error) return { users: [], error: friendlyError(error, 'Users could not be loaded.') };
  return { users: data ?? [] };
}

async function messageFromFunction(error, fallback) {
  if (error?.context && typeof error.context.json === 'function') {
    try {
      const body = await error.context.json();
      const message = body?.message;
      if (typeof message === 'string' && message.length > 0 && message.length < 180) return message;
    } catch {
      // The body was already read or was not JSON.
    }
  }
  return fallback;
}

export async function createAgent({ fullName, email, password }) {
  const missing = requireClient();
  if (missing) return missing;
  const nameError = validateFullName(fullName);
  if (nameError) return { error: nameError };
  const passwordError = validatePassword(password);
  if (passwordError) return { error: passwordError };
  const normalized = cleanText(email).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) || normalized.length > 160) {
    return { error: 'Enter a valid email address.' };
  }
  const { data, error } = await supabase.functions.invoke('create-agent', {
    body: { full_name: cleanText(fullName), email: normalized, password },
  });
  if (error) {
    return { error: await messageFromFunction(error, 'The agent could not be added.') };
  }
  if (!data?.ok) return { error: data?.message || 'The agent could not be added.' };
  return { agent: data.agent };
}

export async function setUserRole(userId, role) {
  const missing = requireClient();
  if (missing) return missing;
  const { data, error } = await supabase.rpc('admin_set_user_role', {
    p_user_id: userId,
    p_role: role,
  });
  if (error) return { error: friendlyError(error, 'The role could not be changed.') };
  return { profile: data };
}

export async function listAuditLogs() {
  const missing = requireClient();
  if (missing) return { logs: [], error: missing.error };
  const { data, error } = await supabase
    .from('audit_logs')
    .select('id, actor_id, action, entity_type, entity_id, metadata, created_at, actor:profiles!audit_logs_actor_id_fkey(full_name, role)')
    .order('created_at', { ascending: false })
    .limit(20);
  if (error && /schema cache|PGRST205|could not find the table/i.test(error.message || '')) {
    return { logs: [] };
  }
  if (error) return { logs: [], error: friendlyError(error, 'Audit information could not be loaded.') };
  return { logs: data ?? [] };
}
