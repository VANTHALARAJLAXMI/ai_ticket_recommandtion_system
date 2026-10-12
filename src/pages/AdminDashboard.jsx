import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, CircleCheck, Clock3, Inbox, Ticket, Users } from 'lucide-react';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import EmptyState from '../components/EmptyState.jsx';
import LiveStatus from '../components/LiveStatus.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import StatCard from '../components/StatCard.jsx';
import { useToast } from '../components/Toast.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { useLiveRefresh } from '../hooks/useLiveRefresh.js';
import { formatDateTime, formatHours, roleLabel } from '../lib/format.js';
import { firstName, greeting } from '../lib/greeting.js';
import { validateCategoryName } from '../lib/validators.js';
import { listAuditLogs } from '../services/authService.js';
import { checkOllamaHealth } from '../services/aiService.js';
import { createCategory, deleteCategory, getDashboardStats, listCategories, listStaff, updateCategory } from '../services/ticketService.js';

function Chart({ title, data, color }) {
  if (!data?.length) return <EmptyState title={title} message="Not enough ticket data for this chart yet." />;
  return (
    <article className="panel card">
      <h2>{title}</h2>
      <div className="chart-box">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#d5e0eb" />
            <XAxis type="number" allowDecimals={false} />
            <YAxis type="category" dataKey="name" width={120} />
            <Tooltip />
            <Bar dataKey="count" fill={color} radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}

export default function AdminDashboard() {
  const { profile } = useAuth();
  const pushToast = useToast();
  const alive = useRef(true);
  const healthChecked = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const [stats, setStats] = useState(null);
  const [logs, setLogs] = useState([]);
  const [categories, setCategories] = useState([]);
  const [staff, setStaff] = useState([]);
  const [health, setHealth] = useState('Checking the AI service…');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', description: '', is_active: true, id: '' });
  const [pendingDelete, setPendingDelete] = useState(null);

  const load = useCallback(async () => {
    try {
      const [statsResult, logResult, categoryResult, staffResult] = await Promise.all([
        getDashboardStats('admin'),
        listAuditLogs(),
        listCategories({ includeInactive: true }),
        listStaff(),
      ]);
      if (!alive.current) return;
      setStats(statsResult.stats);
      setLogs(logResult.logs || []);
      setCategories(categoryResult.categories || []);
      setStaff(staffResult.staff || []);
      setError(statsResult.error || logResult.error || categoryResult.error || staffResult.error || '');
      setLoading(false);
    } catch {
      if (!alive.current) return;
      setError('The admin desk could not be loaded.');
      setLoading(false);
    }
    if (!alive.current || healthChecked.current) return;
    healthChecked.current = true;
    const healthResult = await checkOllamaHealth();
    if (alive.current) setHealth(healthResult.message);
  }, []);

  const { updatedAt, connected } = useLiveRefresh(load);

  async function saveCategory(event) {
    event.preventDefault();
    const nameError = validateCategoryName(form.name);
    if (nameError) {
      pushToast(nameError, 'error');
      return;
    }
    const result = form.id
      ? await updateCategory(form.id, form)
      : await createCategory(form);
    if (result.error) {
      pushToast(result.error, 'error');
      return;
    }
    setForm({ name: '', description: '', is_active: true, id: '' });
    pushToast('Category saved.', 'success');
    load();
  }

  if (loading) return <LoadingSpinner label="Loading administration" />;
  const hours = formatHours(stats?.average_resolution_hours);
  const agents = staff.filter((person) => person.role === 'agent');
  const admins = staff.filter((person) => person.role === 'admin');
  const healthReady = health.toLowerCase().includes('available') && !health.toLowerCase().includes('not');

  return (
    <section className="page desk">
      <header className="desk-hero">
        <div>
          <p className="eyebrow">Admin desk</p>
          <h1>{greeting()}, {firstName(profile?.full_name)}</h1>
          <p>Watch the whole queue, promote an employee to support agent or admin, and keep categories current. Figures come from tickets stored now.</p>
        </div>
        <div className="desk-side">
          <LiveStatus updatedAt={updatedAt} connected={connected} />
          <div className="desk-actions">
            <Link className="button button-primary" to="/admin/users?add=agent">Add agent</Link>
            <Link className="button button-secondary" to="/admin/tickets">All tickets</Link>
          </div>
        </div>
      </header>
      {error ? <div className="banner banner-error">{error}</div> : null}
      <div className={`banner ${healthReady ? 'banner-ok' : ''}`}>{health}</div>
      <div className="stat-grid">
        <StatCard label="Total" value={stats?.total ?? 0} icon={<Ticket size={18} />} tone="navy" />
        <StatCard label="Open" value={stats?.open ?? 0} icon={<Inbox size={18} />} tone="blue" />
        <StatCard label="In progress" value={stats?.in_progress ?? 0} icon={<Clock3 size={18} />} tone="teal" />
        <StatCard label="Resolved" value={stats?.resolved ?? 0} icon={<CircleCheck size={18} />} tone="green" />
        <StatCard label="Closed" value={stats?.closed ?? 0} icon={<CircleCheck size={18} />} tone="navy" />
        <StatCard label="Open critical" value={stats?.critical ?? 0} icon={<AlertTriangle size={18} />} tone="rose" />
      </div>
      <article className="panel card metric-banner">
        <div>
          <h2>Average resolution time</h2>
          <p className="muted">Calculated from tickets that already have a resolved time.</p>
        </div>
        {hours ? <strong>{hours}</strong> : <p className="muted">Not enough resolved tickets yet.</p>}
      </article>
      {stats?.total ? (
        <div className="chart-grid">
          <Chart title="Tickets by category" data={stats.by_category} color="#1b6fd6" />
          <Chart title="Tickets by priority" data={stats.by_priority} color="#0e8f9c" />
          <Chart title="Tickets by status" data={stats.by_status} color="#14345c" />
          <Chart title="Agent workload" data={(stats.by_agent || []).map((row) => ({
            name: staff.find((person) => person.id === row.name)?.full_name || 'Agent',
            count: row.count,
          }))} color="#0d7a4b" />
        </div>
      ) : <EmptyState title="No tickets yet" message="Charts appear after the first ticket is created." />}
      <div className="split">
        <article className="panel card">
          <h2>High priority</h2>
          {stats?.high_priority?.length ? (
            <ul className="plain-list">
              {stats.high_priority.map((ticket) => (
                <li key={ticket.id}><Link to={`/tickets/${ticket.id}`}>{ticket.ticket_number} · {ticket.title}</Link><span>{ticket.priority}</span></li>
              ))}
            </ul>
          ) : <p className="muted">No open high or critical tickets.</p>}
        </article>
        <article className="panel card">
          <h2>Recently closed</h2>
          {stats?.recently_closed?.length ? (
            <ul className="plain-list">
              {stats.recently_closed.map((ticket) => (
                <li key={ticket.id}>
                  <Link to={`/tickets/${ticket.id}`}>{ticket.ticket_number} · {ticket.title}</Link>
                  <span>{formatDateTime(ticket.resolved_at)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="muted">No tickets have been closed yet.</p>}
        </article>
        <article className="panel card">
          <h2>Overdue</h2>
          <p className="muted">Critical 4 hours, high 1 day, medium 3 days, low 7 days.</p>
          {stats?.overdue?.length ? (
            <ul className="plain-list">
              {stats.overdue.map((ticket) => (
                <li key={ticket.id}><Link to={`/tickets/${ticket.id}`}>{ticket.ticket_number} · {ticket.title}</Link><span>{ticket.status}</span></li>
              ))}
            </ul>
          ) : <p className="muted">No overdue tickets.</p>}
        </article>
      </div>
      <div className="split">
        <article className="panel card">
          <h2>Desk team</h2>
          <p className="muted">{admins.length} admin{admins.length === 1 ? '' : 's'} · {agents.length} support agent{agents.length === 1 ? '' : 's'}. Changing a role here does not create a password.</p>
          <div className="team-grid">
            {staff.map((person) => (
              <div className="team-chip" key={person.id}>
                <span>{person.full_name}</span>
                <small>{roleLabel(person.role)}</small>
              </div>
            ))}
          </div>
          {staff.length === 0 ? <p className="muted">No agents or admins are on the roster yet.</p> : null}
          <Link className="button button-secondary" to="/admin/users?add=agent"><Users size={16} /> Add agent</Link>
        </article>
        <article className="panel card">
          <h2>Recent activity</h2>
          {logs.length === 0 ? <p className="muted">No audit events yet.</p> : (
            <ul className="activity-list">
              {logs.slice(0, 8).map((log) => (
                <li key={log.id}>
                  <span>{log.actor?.full_name || 'System'} · {String(log.action || '').replaceAll('_', ' ')}</span>
                  <time>{formatDateTime(log.created_at)}</time>
                </li>
              ))}
            </ul>
          )}
        </article>
      </div>
      <article className="panel card">
        <h2>Categories</h2>
        <form className="filters" onSubmit={saveCategory}>
          <label className="field">
            <span className="field-label">Name</span>
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </label>
          <label className="field">
            <span className="field-label">Description</span>
            <input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
          </label>
          <label className="check">
            <input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} />
            Active
          </label>
          <button className="button button-primary" type="submit">{form.id ? 'Update' : 'Add category'}</button>
        </form>
        <ul className="plain-list">
          {categories.map((category) => (
            <li key={category.id}>
              <span>{category.name}{category.is_active ? '' : ' (inactive)'}</span>
              <span className="row">
                <button className="button button-secondary button-small" type="button" onClick={() => setForm(category)}>Edit</button>
                <button className="button button-danger button-small" type="button" onClick={() => setPendingDelete(category)}>Delete</button>
              </span>
            </li>
          ))}
        </ul>
      </article>
      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete category?"
        message="Categories already used by tickets cannot be deleted. Deactivate one instead."
        confirmLabel="Delete"
        danger
        busy={false}
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          const result = await deleteCategory(pendingDelete.id);
          setPendingDelete(null);
          if (result.error) pushToast(result.error, 'error');
          else {
            pushToast('Category deleted.', 'success');
            load();
          }
        }}
      />
    </section>
  );
}
