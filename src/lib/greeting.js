export function greeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function firstName(fullName) {
  const name = String(fullName || '').trim().split(/\s+/)[0];
  return name || 'there';
}
