export const CATEGORIES = [
  'Hardware',
  'Software',
  'Network',
  'Email',
  'Account Access',
  'Security',
  'Other',
];

export const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];

export const STATUSES = [
  'Open',
  'In Progress',
  'Waiting for User',
  'Resolved',
  'Closed',
];

export const IMPACTS = ['Low', 'Medium', 'High', 'Organization-wide'];

export const URGENCIES = ['Low', 'Medium', 'High', 'Critical'];

export const SENTIMENTS = ['Polite', 'Neutral', 'Concerned', 'Frustrated', 'Urgent'];

export const ROLES = ['employee', 'agent', 'admin'];

export const STATUS_TRANSITIONS = {
  Open: ['In Progress', 'Waiting for User', 'Resolved', 'Closed'],
  'In Progress': ['Waiting for User', 'Resolved', 'Closed', 'Open'],
  'Waiting for User': ['In Progress', 'Resolved', 'Closed'],
  Resolved: ['Open', 'Closed'],
  Closed: ['Open'],
};

export const PAGE_SIZE = 8;
