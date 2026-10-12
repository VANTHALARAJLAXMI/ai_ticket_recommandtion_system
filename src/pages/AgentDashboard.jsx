import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CircleCheck, Clock3, Inbox, Shield, UserRound } from 'lucide-react';
import LiveStatus from '../components/LiveStatus.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import StatCard from '../components/StatCard.jsx';
import TicketCard from '../components/TicketCard.jsx';
import { StatusSelect } from '../components/TicketWorkflow.jsx';
import { useToast } from '../components/Toast.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { useLiveRefresh } from '../hooks/useLiveRefresh.js';
import { firstName, greeting } from '../lib/greeting.js';
import { checkOllamaHealth } from '../services/aiService.js';
import { getDashboardStats, listTickets, resolveTicket, updateTicketProgress } from '../services/ticketService.js';

export default function AgentDashboard() {
  const { user, profile } = useAuth();
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
  const [assigned, setAssigned] = useState([]);
  const [closed, setClosed] = useState([]);
  const [unassigned, setUnassigned] = useState([]);
  const [health, setHealth] = useState('Checking the AI service…');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [statsResult, assignedResult, closedResult, openResult] = await Promise.all([
        getDashboardStats('agent', user.id),
        listTickets({ scope: 'assigned', userId: user.id, pageSize: 8 }),
        listTickets({ scope: 'assigned', userId: user.id, status: 'Closed', sort: 'updated', pageSize: 4 }),
        listTickets({ scope: 'unassigned', userId: user.id, pageSize: 4 }),
      ]);
      if (!alive.current) return;
      setStats(statsResult.stats);
      setAssigned((assignedResult.tickets || []).filter((ticket) => ticket.status !== 'Closed' && ticket.status !== 'Resolved').slice(0, 4));
      setClosed(closedResult.tickets || []);
      setUnassigned(openResult.tickets || []);
      setError(statsResult.error || assignedResult.error || closedResult.error || openResult.error || '');
      setLoading(false);
    } catch {
      if (!alive.current) return;
      setError('The agent desk could not be loaded.');
      setLoading(false);
    }
    if (!alive.current || healthChecked.current) return;
    healthChecked.current = true;
    const healthResult = await checkOllamaHealth();
    if (alive.current) setHealth(healthResult.message);
  }, [user.id]);

  const { updatedAt, connected } = useLiveRefresh(load);

  if (loading) return <LoadingSpinner label="Loading the agent queue" />;
  const healthReady = health.toLowerCase().includes('available') && !health.toLowerCase().includes('not');

  return (
    <section className="page desk">
      <header className="desk-hero">
        <div>
          <p className="eyebrow">Agent desk</p>
          <h1>{greeting()}, {firstName(profile?.full_name)}</h1>
          <p>Tickets appear here after an admin assigns them to you. Change the status on a ticket, then open it to resolve the work.</p>
        </div>
        <div className="desk-side">
          <LiveStatus updatedAt={updatedAt} connected={connected} />
          <Link className="button button-primary" to="/queue">Open full queue</Link>
        </div>
      </header>
      {error ? <div className="banner banner-error">{error}</div> : null}
      <div className={`banner ${healthReady ? 'banner-ok' : ''}`}>{health}</div>
      <div className="stat-grid">
        <StatCard label="Assigned to me" value={stats?.assigned ?? 0} icon={<UserRound size={18} />} tone="navy" />
        <StatCard label="Unassigned" value={stats?.unassigned ?? 0} icon={<Inbox size={18} />} tone="blue" />
        <StatCard label="Open" value={stats?.open ?? 0} icon={<Shield size={18} />} tone="teal" />
        <StatCard label="In progress" value={stats?.in_progress ?? 0} icon={<Clock3 size={18} />} tone="amber" />
        <StatCard label="Critical and high" value={stats?.urgent ?? 0} icon={<AlertTriangle size={18} />} tone="rose" />
        <StatCard label="Closed" value={stats?.closed ?? 0} icon={<CircleCheck size={18} />} tone="green" />
      </div>
      <div className="split">
        <section className="panel card">
          <h2>Assigned to me</h2>
          <div className="ticket-grid">{assigned.map((ticket) => (
            <TicketCard key={ticket.id} ticket={ticket}>
              {ticket.assigned_to === user.id ? (
                <StatusSelect
                  ticket={ticket}
                  onChangeStatus={async (next) => {
                    const result = await updateTicketProgress(ticket.id, next);
                    if (result.error) pushToast(result.error, 'error');
                    else pushToast('Status updated.', 'success');
                    load();
                  }}
                  onResolve={async (notes) => {
                    const result = await resolveTicket(ticket.id, notes);
                    if (result.error) pushToast(result.error, 'error');
                    else pushToast('Ticket closed.', 'success');
                    load();
                  }}
                />
              ) : null}
            </TicketCard>
          ))}</div>
          {assigned.length === 0 ? <p className="muted">No active tickets are assigned to you yet. An admin assigns a ticket before you can change its status.</p> : null}
        </section>
        <section className="panel card">
          <h2>Recently closed</h2>
          <div className="ticket-grid">{closed.map((ticket) => <TicketCard key={ticket.id} ticket={ticket} />)}</div>
          {closed.length === 0 ? <p className="muted">Tickets you close will show here.</p> : null}
        </section>
        <section className="panel card">
          <h2>Unassigned</h2>
          <div className="stack">{unassigned.map((ticket) => <TicketCard key={ticket.id} ticket={ticket} />)}</div>
          {unassigned.length === 0 ? <p className="muted">{profile?.role === 'admin' ? 'The unassigned queue is clear.' : 'Unassigned tickets stay with the admin until one is assigned to you.'}</p> : null}
        </section>
      </div>
    </section>
  );
}
