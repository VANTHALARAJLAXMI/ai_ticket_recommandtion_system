import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeAdminTickets, summarizeAgentTickets, summarizeEmployeeTickets } from './stats.js';

test('employee counts come from that person’s ticket rows', () => {
  const stats = summarizeEmployeeTickets([
    { status: 'Open' },
    { status: 'In Progress' },
    { status: 'Waiting for User' },
    { status: 'Resolved' },
    { status: 'Closed' },
  ]);
  assert.deepEqual(stats, { total: 5, open: 1, in_progress: 1, waiting: 1, resolved: 1, closed: 1 });
});

test('agent counts stay inside the assigned and unassigned queue', () => {
  const me = 'agent-1';
  const stats = summarizeAgentTickets([
    { assigned_to: me, status: 'Open', priority: 'Critical' },
    { assigned_to: null, status: 'In Progress', priority: 'Low' },
    { assigned_to: 'other', status: 'Open', priority: 'High' },
    { assigned_to: me, status: 'Resolved', priority: 'Low' },
    { assigned_to: me, status: 'Closed', priority: 'Medium' },
  ], me);
  assert.equal(stats.assigned, 1);
  assert.equal(stats.unassigned, 1);
  assert.equal(stats.open, 1);
  assert.equal(stats.urgent, 1);
  assert.equal(stats.resolved, 1);
  assert.equal(stats.closed, 1);
});

test('admin summary leaves the average empty until a ticket is resolved', () => {
  const now = new Date('2026-10-10T12:00:00Z').getTime();
  const created = new Date(now - 5 * 60 * 60 * 1000).toISOString();
  const stats = summarizeAdminTickets([
    { id: '1', ticket_number: 'TKT-001001', title: 'Network down', category: 'Network', priority: 'Critical', status: 'Open', created_at: created, resolved_at: null },
  ], now);
  assert.equal(stats.total, 1);
  assert.equal(stats.closed, 0);
  assert.equal(stats.critical, 1);
  assert.equal(stats.average_resolution_hours, null);
  assert.equal(stats.overdue.length, 1);
  assert.equal(stats.recently_closed.length, 0);
  assert.equal(stats.by_category[0].name, 'Network');
});
