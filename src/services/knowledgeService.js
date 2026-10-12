import { friendlyError } from '../lib/errors.js';
import { missingTableError } from '../lib/schemaAvailability.js';
import { sanitizeSearch, validateArticle } from '../lib/validators.js';
import { supabase } from './supabaseClient.js';

const COLUMNS = 'id, title, category, summary, content, troubleshooting_steps, created_by, is_published, created_at, updated_at';
const MISSING = 'Knowledge articles are not in this database yet. Run supabase/migrations/002_support_features.sql in the Supabase SQL editor.';

function articleError(error, fallback) {
  if (missingTableError(error)) return MISSING;
  return friendlyError(error, fallback);
}

export async function listArticles({ search = '', category = '', includeUnpublished = false } = {}) {
  if (!supabase) return { articles: [], error: 'Supabase is not configured.' };
  let query = supabase.from('knowledge_articles').select(COLUMNS).order('updated_at', { ascending: false });
  if (!includeUnpublished) query = query.eq('is_published', true);
  if (category) query = query.eq('category', category);
  const term = sanitizeSearch(search);
  if (term) query = query.or(`title.ilike.%${term}%,summary.ilike.%${term}%,content.ilike.%${term}%,troubleshooting_steps.ilike.%${term}%`);
  const { data, error } = await query;
  if (error) return { articles: [], error: articleError(error, 'Articles could not be loaded.') };
  return { articles: data ?? [] };
}

export async function articlesForCategory(category) {
  if (!supabase || !category) return { articles: [] };
  const { data, error } = await supabase
    .from('knowledge_articles')
    .select('id, title, category')
    .eq('category', category)
    .eq('is_published', true)
    .order('title', { ascending: true })
    .limit(5);
  if (error) return { articles: [], error: articleError(error, 'Related articles could not be loaded.') };
  return { articles: data ?? [] };
}

export async function saveArticle(input, categories, articleId) {
  if (!supabase) return { error: 'Supabase is not configured.' };
  const validated = validateArticle(input, categories);
  if (!validated.ok) return { error: 'Check the highlighted fields.', fieldErrors: validated.errors };

  const query = articleId
    ? supabase.from('knowledge_articles').update(validated.value).eq('id', articleId)
    : supabase.from('knowledge_articles').insert(validated.value);
  const { data, error } = await query.select(COLUMNS).single();
  if (error) return { error: articleError(error, 'The article could not be saved.') };
  return { article: data };
}

export async function deleteArticle(articleId) {
  if (!supabase) return { error: 'Supabase is not configured.' };
  const { error } = await supabase.from('knowledge_articles').delete().eq('id', articleId);
  if (error) return { error: articleError(error, 'The article could not be deleted.') };
  return { error: '' };
}
