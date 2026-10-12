import {
  CATEGORIES,
  IMPACTS,
  PRIORITIES,
  ROLES,
  SENTIMENTS,
  STATUSES,
  STATUS_TRANSITIONS,
  URGENCIES,
} from './constants.js';

export function cleanText(value) {
  return String(value ?? '').replace(/\u0000/g, '').trim();
}

export function sanitizeSearch(value) {
  return cleanText(value).replace(/[%_,.()"'\\]/g, '').slice(0, 80);
}

export function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 8) {
    return 'Use at least 8 characters.';
  }
  if (password.length > 72) return 'Use 72 characters or fewer.';
  if (!/[A-Za-z]/.test(password)) return 'Include at least one letter.';
  if (!/\d/.test(password)) return 'Include at least one number.';
  return '';
}

export function validateFullName(fullName) {
  const name = cleanText(fullName);
  if (name.length < 2 || name.length > 80) {
    return 'Enter a name between 2 and 80 characters.';
  }
  return '';
}

export function priorityFromUrgency(urgency) {
  if (urgency === 'Critical') return 'Critical';
  if (urgency === 'High') return 'High';
  if (urgency === 'Medium') return 'Medium';
  return 'Low';
}

export function validateTicketInput(input, categories = CATEGORIES) {
  const errors = {};
  const title = cleanText(input?.title);
  const description = cleanText(input?.description);
  const category = cleanText(input?.category);
  const businessImpact = cleanText(input?.business_impact);
  const urgency = cleanText(input?.urgency);
  const affected = cleanText(input?.affected_system);

  if (title.length < 5 || title.length > 160) {
    errors.title = 'Enter a title between 5 and 160 characters.';
  }
  if (description.length < 20 || description.length > 5000) {
    errors.description = 'Describe the issue in 20 to 5,000 characters.';
  }
  if (!categories.includes(category)) {
    errors.category = 'Choose a valid category.';
  }
  if (!IMPACTS.includes(businessImpact)) {
    errors.business_impact = 'Choose the business impact.';
  }
  if (!URGENCIES.includes(urgency)) {
    errors.urgency = 'Choose how urgent this is.';
  }
  if (affected.length > 200) {
    errors.affected_system = 'Use 200 characters or fewer.';
  }

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    value: {
      title,
      description,
      category,
      business_impact: businessImpact,
      urgency,
      affected_system: affected,
      priority: priorityFromUrgency(urgency),
    },
  };
}

export function validateComment(body) {
  const text = cleanText(body);
  if (text.length < 1 || text.length > 2000) {
    return { ok: false, error: 'Enter a comment between 1 and 2,000 characters.', value: '' };
  }
  return { ok: true, error: '', value: text };
}

export function validateCategoryName(name) {
  const value = cleanText(name);
  if (!/^[A-Za-z0-9][A-Za-z0-9 &/-]{1,39}$/.test(value)) {
    return 'Use 2–40 letters, numbers, spaces, or the characters & / -.';
  }
  return '';
}

export function validateArticle(input, categories = CATEGORIES) {
  const errors = {};
  const title = cleanText(input?.title);
  const category = cleanText(input?.category);
  const summary = cleanText(input?.summary);
  const content = cleanText(input?.content);

  if (title.length < 5 || title.length > 140) {
    errors.title = 'Enter a title between 5 and 140 characters.';
  }
  if (!categories.includes(category)) errors.category = 'Choose a valid category.';
  if (summary.length < 20 || summary.length > 500) {
    errors.summary = 'Enter a description between 20 and 500 characters.';
  }
  if (content.length < 20 || content.length > 5000) {
    errors.content = 'Enter article content between 20 and 5,000 characters.';
  }
  const steps = cleanText(input?.troubleshooting_steps);
  if (steps.length > 4000) {
    errors.troubleshooting_steps = 'Keep troubleshooting steps under 4,000 characters.';
  }

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    value: {
      title,
      category,
      summary,
      content,
      troubleshooting_steps: steps,
      is_published: Boolean(input?.is_published),
    },
  };
}

export function validateFeedback(rating, comment) {
  const score = Number(rating);
  const text = cleanText(comment);
  if (!Number.isInteger(score) || score < 1 || score > 5) {
    return { ok: false, error: 'Choose a rating from 1 to 5.' };
  }
  if (text.length > 1000) {
    return { ok: false, error: 'Keep the comment under 1,000 characters.' };
  }
  return { ok: true, value: { rating: score, comment: text } };
}

const ATTACHMENT_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

export function validateAttachment(file) {
  if (!file) return 'Choose a file.';
  if (file.size <= 0 || file.size > 5 * 1024 * 1024) return 'Files must be 5 MB or smaller.';
  if (!ATTACHMENT_TYPES.has(file.type)) return 'Use a PNG, JPEG, WebP, PDF, TXT, DOC, or DOCX file.';
  return '';
}

export function validateResolutionNotes(status, notes) {
  if (status !== 'Resolved' && status !== 'Closed') return '';
  const text = cleanText(notes);
  if (text.length < 10 || text.length > 4000) {
    return 'Add resolution notes between 10 and 4,000 characters.';
  }
  return '';
}

export function allowedStatusTargets(current, actor) {
  if (!STATUSES.includes(current)) return [];
  if (actor === 'employee') return current === 'Resolved' ? ['Open'] : [];
  if (actor === 'agent' || actor === 'admin') return STATUS_TRANSITIONS[current] ?? [];
  return [];
}

const PROGRESS_STATUSES = ['Open', 'In Progress', 'Waiting for User'];

export function allowedProgressTargets(current) {
  if (!PROGRESS_STATUSES.includes(current)) return [];
  return PROGRESS_STATUSES.filter((status) => status !== current);
}

export function canResolveTicket({ role, userId, assignedTo, status }) {
  if (status === 'Closed' || status === 'Resolved') return false;
  if (role === 'admin') return true;
  return role === 'agent' && Boolean(userId) && assignedTo === userId;
}

export function canAssignTicket(role) {
  return role === 'admin';
}

export function requiresResolutionNotes(status) {
  return status === 'Resolved' || status === 'Closed';
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function validateAiAnalysis(input, categories = CATEGORIES) {
  if (!isPlainObject(input)) {
    return { ok: false, error: 'AI response was not a JSON object.' };
  }

  const category = input.category;
  const suggestedPriority = input.suggested_priority;
  const sentiment = input.sentiment;
  const suggestedTeam = input.suggested_team;
  const summary = input.summary;
  const probableCause = input.probable_cause;
  const steps = input.troubleshooting_steps;
  const confidence = input.confidence;
  const escalation = input.escalation_recommended;

  if (typeof category !== 'string' || !categories.includes(category)) {
    return { ok: false, error: 'AI returned an invalid category.' };
  }
  if (typeof suggestedPriority !== 'string' || !PRIORITIES.includes(suggestedPriority)) {
    return { ok: false, error: 'AI returned an invalid priority.' };
  }
  if (typeof sentiment !== 'string' || !SENTIMENTS.includes(sentiment)) {
    return { ok: false, error: 'AI returned an invalid sentiment.' };
  }
  if (typeof suggestedTeam !== 'string') {
    return { ok: false, error: 'AI returned an invalid support team.' };
  }
  const team = suggestedTeam.trim();
  if (team.length < 2 || team.length > 80) {
    return { ok: false, error: 'AI returned an invalid support team.' };
  }
  if (typeof summary !== 'string' || summary.trim().length < 10 || summary.trim().length > 600) {
    return { ok: false, error: 'AI returned an invalid summary.' };
  }
  if (
    typeof probableCause !== 'string' ||
    probableCause.trim().length < 10 ||
    probableCause.trim().length > 600
  ) {
    return { ok: false, error: 'AI returned an invalid probable cause.' };
  }
  if (!Array.isArray(steps) || steps.length < 2 || steps.length > 6) {
    return { ok: false, error: 'AI returned invalid troubleshooting steps.' };
  }
  const cleanSteps = [];
  for (const step of steps) {
    if (typeof step !== 'string') {
      return { ok: false, error: 'AI returned invalid troubleshooting steps.' };
    }
    const text = step.trim();
    if (text.length < 3 || text.length > 300) {
      return { ok: false, error: 'AI returned invalid troubleshooting steps.' };
    }
    cleanSteps.push(text);
  }
  if (typeof confidence !== 'number' || Number.isNaN(confidence) || confidence < 0 || confidence > 1) {
    return { ok: false, error: 'AI returned an invalid confidence score.' };
  }
  if (typeof escalation !== 'boolean') {
    return { ok: false, error: 'AI returned an invalid escalation flag.' };
  }

  return {
    ok: true,
    value: {
      category,
      suggested_priority: suggestedPriority,
      sentiment,
      suggested_team: team,
      summary: summary.trim(),
      probable_cause: probableCause.trim(),
      troubleshooting_steps: cleanSteps,
      confidence,
      escalation_recommended: escalation,
    },
  };
}

export function readableAnalysis(payload, categories = CATEGORIES) {
  if (!payload || payload.ok !== true || !payload.analysis) return null;
  const validated = validateAiAnalysis(payload.analysis, categories);
  return validated.ok ? validated.value : null;
}

export function isKnownRole(role) {
  return ROLES.includes(role);
}

export function homePathForRole(role) {
  if (role === 'admin') return '/admin';
  if (role === 'agent') return '/agent';
  return '/dashboard';
}

const ROLE_LABELS = {
  employee: 'Employee',
  agent: 'Support Agent',
  admin: 'Admin',
};

export function loginRoleError(selectedRole, actualRole) {
  if (!isKnownRole(selectedRole)) return 'Choose Employee, Support Agent, or Admin.';
  if (selectedRole === actualRole) return '';
  const actual = ROLE_LABELS[actualRole] || 'Employee';
  return `This account is ${actual}. Choose ${actual} and sign in again.`;
}

export function returnPathForRole(role, from) {
  const home = homePathForRole(role);
  if (typeof from !== 'string' || !from.startsWith('/') || from.startsWith('//')) return home;
  const adminOnly = from === '/admin' || from.startsWith('/admin/');
  const staffOnly = from === '/agent' || from === '/queue';
  if (adminOnly && role !== 'admin') return home;
  if (staffOnly && role !== 'agent' && role !== 'admin') return home;
  return from;
}
