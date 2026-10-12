const CLASS_BY_PRIORITY = {
  Critical: 'badge-critical',
  High: 'badge-high',
  Medium: 'badge-medium',
  Low: 'badge-low',
};

export default function PriorityBadge({ priority }) {
  return <span className={`badge ${CLASS_BY_PRIORITY[priority] || 'badge-low'}`}>{priority}</span>;
}
