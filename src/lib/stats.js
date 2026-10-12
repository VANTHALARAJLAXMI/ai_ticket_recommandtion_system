const PRIORITY_RANK = { Critical: 1, High: 2, Medium: 3, Low: 4 };
export const SLA_MS = {
  Critical: 4 * 60 * 60 * 1000,
  High: 24 * 60 * 60 * 1000,
  Medium: 3 * 24 * 60 * 60 * 1000,
  Low: 7 * 24 * 60 * 60 * 1000,
};

function active(status) {
  return status !== 'Resolved' && status !== 'Closed';
}

function inQueue(row, userId) {
  return row.assigned_to === userId || row.assigned_to == null;
}

function groupCount(rows, key) {
  const counts = new Map();
  rows.forEach((row) => {
    const name = row[key];
    counts.set(name, (counts.get(name) || 0) + 1);
  });
  return [...counts.entries()].map(([name, count]) => ({ name, count }));
}

export function resolutionTargetMs(priority, targets) {
  const match = Array.isArray(targets) ? targets.find((row) => row.priority === priority) : null;
  if (match?.resolution_minutes) return Number(match.resolution_minutes) * 60 * 1000;
  return SLA_MS[priority] || SLA_MS.Low;
}

export function isResolutionOverdue(ticket, targets, now = Date.now()) {
  if (!ticket?.created_at || !active(ticket.status)) return false;
  return now > new Date(ticket.created_at).getTime() + resolutionTargetMs(ticket.priority, targets);
}

export function summarizeEmployeeTickets(rows) {
  return {
    total: rows.length,
    open: rows.filter((row) => row.status === 'Open').length,
    in_progress: rows.filter((row) => row.status === 'In Progress').length,
    waiting: rows.filter((row) => row.status === 'Waiting for User').length,
    resolved: rows.filter((row) => row.status === 'Resolved').length,
    closed: rows.filter((row) => row.status === 'Closed').length,
  };
}

export function summarizeAgentTickets(rows, userId) {
  return {
    assigned: rows.filter((row) => row.assigned_to === userId && active(row.status)).length,
    unassigned: rows.filter((row) => row.assigned_to == null && active(row.status)).length,
    open: rows.filter((row) => row.status === 'Open' && inQueue(row, userId)).length,
    in_progress: rows.filter((row) => row.status === 'In Progress' && inQueue(row, userId)).length,
    urgent: rows.filter((row) => (row.priority === 'Critical' || row.priority === 'High') && active(row.status) && inQueue(row, userId)).length,
    resolved: rows.filter((row) => row.assigned_to === userId && row.status === 'Resolved').length,
    closed: rows.filter((row) => row.assigned_to === userId && row.status === 'Closed').length,
  };
}

export function summarizeAdminTickets(rows, now = Date.now()) {
  const resolved = rows.filter((row) => row.resolved_at);
  const average = resolved.length
    ? Math.round((resolved.reduce((sum, row) => sum + (new Date(row.resolved_at) - new Date(row.created_at)), 0) / resolved.length / 3600000) * 10) / 10
    : null;
  const summary = (row) => ({
    id: row.id,
    ticket_number: row.ticket_number,
    title: row.title,
    priority: row.priority,
    status: row.status,
    created_at: row.created_at,
  });

  return {
    total: rows.length,
    open: rows.filter((row) => row.status === 'Open').length,
    in_progress: rows.filter((row) => row.status === 'In Progress').length,
    resolved: rows.filter((row) => row.status === 'Resolved').length,
    closed: rows.filter((row) => row.status === 'Closed').length,
    critical: rows.filter((row) => row.priority === 'Critical' && active(row.status)).length,
    by_agent: groupCount(rows.filter((row) => row.assigned_to), 'assigned_to'),
    average_resolution_hours: average,
    by_category: groupCount(rows, 'category').sort((a, b) => b.count - a.count),
    by_priority: groupCount(rows, 'priority').sort((a, b) => (PRIORITY_RANK[a.name] || 9) - (PRIORITY_RANK[b.name] || 9)),
    by_status: groupCount(rows, 'status'),
    high_priority: rows
      .filter((row) => (row.priority === 'Critical' || row.priority === 'High') && active(row.status))
      .sort((a, b) => (PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]) || (new Date(a.created_at) - new Date(b.created_at)))
      .slice(0, 6)
      .map(summary),
    recently_closed: rows
      .filter((row) => row.status === 'Closed')
      .sort((a, b) => new Date(b.resolved_at || 0) - new Date(a.resolved_at || 0))
      .slice(0, 6)
      .map((row) => ({ ...summary(row), resolved_at: row.resolved_at })),
    overdue: rows
      .filter((row) => active(row.status) && now > new Date(row.created_at).getTime() + (SLA_MS[row.priority] || SLA_MS.Low))
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .slice(0, 6)
      .map(summary),
  };
}
