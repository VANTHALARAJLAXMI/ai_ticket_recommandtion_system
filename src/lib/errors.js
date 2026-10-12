export function friendlyError(error, fallback = 'Something went wrong. Please try again.') {
  if (!error) return fallback;
  const message = String(error.message || error);
  if (/failed to fetch|networkerror|network request failed|load failed/i.test(message)) {
    return 'Network connection failed. Check your connection and try again.';
  }
  if (/could not find the function|PGRST202/i.test(message)) {
    return 'That action is not available in this Supabase project yet.';
  }
  if (/could not find the table|PGRST205/i.test(message)) {
    return 'That part of the database has not been created yet.';
  }
  if (/jwt|invalid claim|session expired|not authenticated/i.test(message)) {
    return 'Your session has expired. Sign in again.';
  }
  if (/row-level security|permission denied|not authorized|only admins/i.test(message)) {
    return 'You do not have permission to do that.';
  }
  if (/already registered|already exists|duplicate key/i.test(message)) {
    return 'That record already exists.';
  }
  if (/foreign key/i.test(message)) {
    return 'That item is still in use and cannot be removed.';
  }
  if (/check constraint|invalid/i.test(message) && /constraint/i.test(message)) {
    return 'Some of the submitted values are not allowed.';
  }
  if (/an admin already exists/i.test(message)) return 'An administrator already exists.';
  if (/no account exists/i.test(message)) return 'No account exists for that email.';
  if (/cannot remove your own admin/i.test(message)) {
    return 'You cannot remove your own admin access.';
  }
  if (/user not found|ticket not found/i.test(message)) return 'That record could not be found.';
  if (/password|stack|secret|service_role|apikey|sqlstate/i.test(message)) return fallback;
  if (message.length > 180) return fallback;
  return message;
}
