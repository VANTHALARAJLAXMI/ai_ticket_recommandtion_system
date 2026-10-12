export function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function formatHours(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return null;
  const hours = Number(value);
  return `${hours.toFixed(1)} hours`;
}

export function roleLabel(role) {
  if (role === 'admin') return 'Admin';
  if (role === 'agent') return 'Support Agent';
  return 'Employee';
}

export function firstRelation(value) {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

const EMBEDDED_DETAIL = /^(Business impact|Urgency|Affected system): ([^\n]+)$/;

export function readEmbeddedTicketDetails(description) {
  const paragraphs = String(description || '').split(/\n\n/);
  const details = {};
  while (paragraphs.length) {
    const match = paragraphs[paragraphs.length - 1].trim().match(EMBEDDED_DETAIL);
    if (!match) break;
    const key = match[1] === 'Business impact'
      ? 'business_impact'
      : match[1] === 'Urgency'
        ? 'urgency'
        : 'affected_system';
    details[key] = match[2].trim();
    paragraphs.pop();
  }
  return {
    description: paragraphs.join('\n\n').trim(),
    business_impact: details.business_impact || '',
    urgency: details.urgency || '',
    affected_system: details.affected_system || '',
  };
}
