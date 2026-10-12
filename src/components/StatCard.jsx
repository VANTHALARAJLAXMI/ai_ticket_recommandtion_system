export default function StatCard({ label, value, icon, tone = 'blue' }) {
  return (
    <article className={`stat-card card tone-${tone}`}>
      <div className="stat-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}
