const missing = new Set();
const pending = new Map();

export function isMissingResource(name) {
  return missing.has(name);
}

export function rememberMissingResource(name) {
  missing.add(name);
}

export function missingTableError(error) {
  return /schema cache|PGRST205|could not find the table/i.test(String(error?.message || error || ''));
}

export function shareRequest(key, request) {
  if (pending.has(key)) return pending.get(key);
  const promise = Promise.resolve()
    .then(request)
    .finally(() => pending.delete(key));
  pending.set(key, promise);
  return promise;
}
