const CLASS_BY_STATUS = {
  Open: 'badge-open',
  'In Progress': 'badge-progress',
  'Waiting for User': 'badge-waiting',
  Resolved: 'badge-resolved',
  Closed: 'badge-closed',
};

export default function StatusBadge({ status }) {
  return <span className={`badge ${CLASS_BY_STATUS[status] || 'badge-closed'}`}>{status}</span>;
}
