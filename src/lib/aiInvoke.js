export const AI_NOT_CONNECTED =
  'AI analysis is not connected on this Supabase project. The ticket is saved and can be handled manually.';
export const AI_MANUAL =
  'AI analysis is unavailable. The ticket was saved and can be handled manually.';

export function invokeLooksUnreachable(error) {
  const name = String(error?.name || '');
  if (name === 'FunctionsHttpError') return false;
  if (name === 'FunctionsFetchError' || name === 'FunctionsRelayError') return true;
  const message = String(error?.message || '');
  return /failed to send a request|failed to fetch|networkerror|network request failed/i.test(message);
}

export async function messageFromInvokeError(error) {
  if (error?.context && typeof error.context.json === 'function') {
    try {
      const body = await error.context.json();
      const message = body?.message;
      const safe = typeof message === 'string'
        && message.length > 0
        && message.length < 180
        && !/password|stack|secret|service_role|apikey|api key|bearer /i.test(message);
      if (safe) return { unavailable: false, message };
    } catch {
      // The body was already read or was not JSON.
    }
  }
  if (invokeLooksUnreachable(error)) return { unavailable: true, message: AI_NOT_CONNECTED };
  return { unavailable: false, message: AI_MANUAL };
}
