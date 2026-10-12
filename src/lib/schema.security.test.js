import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const sql = readFileSync(join(root, 'supabase/migrations/001_initial_schema.sql'), 'utf8');

function readTree(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) readTree(path, acc);
    else if (/\.(js|jsx|css)$/.test(entry) && !entry.endsWith('.test.js')) acc.push(readFileSync(path, 'utf8'));
  }
  return acc.join('\n');
}

const frontend = readTree(join(root, 'src'));

test('private tables enable and force row level security', () => {
  for (const table of ['profiles', 'categories', 'tickets', 'ticket_comments', 'ticket_ai_analysis', 'knowledge_base', 'audit_logs']) {
    assert.match(sql, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`));
    assert.match(sql, new RegExp(`ALTER TABLE public\\.${table} FORCE ROW LEVEL SECURITY`));
  }
});

test('employees cannot grant themselves a role or read internal notes through policy text', () => {
  assert.match(sql, /NEW\.role := 'employee'/);
  assert.match(sql, /Only admins can change roles/);
  assert.match(sql, /NOT is_internal OR private\.is_staff\(\)/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.bootstrap_first_admin\(text\) FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.save_ticket_ai_analysis/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.save_ticket_ai_analysis\([\s\S]*TO service_role/);
});

test('the additive upgrade enables row level security and does not grant AI saves to browsers', () => {
  const upgrade = readFileSync(join(root, 'supabase/migrations/002_support_features.sql'), 'utf8');
  for (const table of ['ticket_comments', 'knowledge_articles', 'notifications', 'ticket_activity', 'ticket_feedback', 'sla_targets', 'ticket_attachments', 'ticket_ai_analysis']) {
    assert.match(upgrade, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`));
    assert.match(upgrade, new RegExp(`ALTER TABLE public\\.${table} FORCE ROW LEVEL SECURITY`));
  }
  assert.match(upgrade, /REVOKE ALL ON FUNCTION public\.save_ticket_ai_analysis/);
  assert.match(upgrade, /GRANT EXECUTE ON FUNCTION public\.save_ticket_ai_analysis\([\s\S]*TO service_role/);
  assert.equal(upgrade.includes('DROP TABLE public.tickets'), false);
  assert.equal(upgrade.includes('service_role_key'), false);
});

test('the React bundle does not receive server credentials or render raw HTML', () => {
  assert.equal(frontend.includes('SUPABASE_SERVICE_ROLE'), false);
  assert.equal(frontend.includes('OLLAMA_BASE_URL'), false);
  assert.equal(frontend.includes('dangerouslySetInnerHTML'), false);
  assert.equal(sql.includes('service_role_key'), false);
});
