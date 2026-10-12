import { AI_MANUAL, messageFromInvokeError } from '../lib/aiInvoke.js';
import { rememberMissingResource } from '../lib/schemaAvailability.js';
import { readableAnalysis } from '../lib/validators.js';
import { supabase } from './supabaseClient.js';

export async function analyzeTicket(ticketId) {
  if (!supabase) return { ok: false, message: 'Supabase is not configured.' };
  const { data, error } = await supabase.functions.invoke('analyze-ticket', {
    body: { ticket_id: ticketId },
  });
  if (error) {
    const failure = await messageFromInvokeError(error);
    if (failure.unavailable) rememberMissingResource('edge-functions');
    return { ok: false, unavailable: failure.unavailable, message: failure.message };
  }
  if (!data?.ok) return { ok: false, message: data?.message || AI_MANUAL };

  const analysis = readableAnalysis(data);
  if (!analysis) {
    return {
      ok: false,
      message: 'The AI response could not be validated. A support agent can classify this ticket manually.',
    };
  }
  const related = Array.isArray(data.related_articles) ? data.related_articles : [];
  return { ok: true, analysis, relatedArticles: related };
}

export async function checkOllamaHealth() {
  if (!supabase) return { ok: false, message: 'Supabase is not configured.' };
  const { data, error } = await supabase.functions.invoke('ollama-health', { body: {} });
  if (error) return { ok: false, message: (await messageFromInvokeError(error)).message };
  return {
    ok: Boolean(data?.ok),
    message: data?.message || 'The Ollama API could not be reached.',
  };
}
