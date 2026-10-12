import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, CircleCheck, Clock3, Inbox, PlusCircle, Ticket, UserRound } from 'lucide-react';
import EmptyState from '../components/EmptyState.jsx';
import LiveStatus from '../components/LiveStatus.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import StatCard from '../components/StatCard.jsx';
import TicketCard from '../components/TicketCard.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { useLiveRefresh } from '../hooks/useLiveRefresh.js';
import { firstName, greeting } from '../lib/greeting.js';
import { getDashboardStats, listTickets } from '../services/ticketService.js';

export default function UserDashboard() {
  const { user, profile } = useAuth();
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const [closed, setClosed] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [statsResult, ticketResult, closedResult] = await Promise.all([
        getDashboardStats('employee', user.id),
        listTickets({ scope: 'mine', userId: user.id, sort: 'updated', pageSize: 4 }),
        listTickets({ scope: 'mine', userId: user.id, status: 'Closed', sort: 'updated', pageSize: 4 }),
      ]);
      if (!alive.current) return;
      setStats(statsResult.stats);
      setRecent(ticketResult.tickets || []);
      setClosed(closedResult.tickets || []);
      setError(statsResult.error || ticketResult.error || closedResult.error || '');
    } catch {
      if (!alive.current) return;
      setError('Your desk could not be loaded.');
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [user.id]);

  const { updatedAt, connected } = useLiveRefresh(load);

  if (loading) return <LoadingSpinner label="Loading your dashboard" />;

  return (
    <section className="page desk">
      <header className="desk-hero">
        <div>
          <p className="eyebrow">Employee desk</p>
          <h1>{greeting()}, {firstName(profile?.full_name)}</h1>
          <p>Your own tickets stay on this screen and refresh when support updates them.</p>
        </div>
        <div className="desk-side">
          <LiveStatus updatedAt={updatedAt} connected={connected} />
          <Link className="button button-primary" to="/tickets/new"><PlusCircle size={16} /> Create new ticket</Link>
        </div>
      </header>
      {error ? <div className="banner banner-error">{error}</div> : null}
      <div className="stat-grid">
        <StatCard label="Total tickets" value={stats?.total ?? 0} icon={<Ticket size={18} />} tone="navy" />
        <StatCard label="Open" value={stats?.open ?? 0} icon={<Inbox size={18} />} tone="blue" />
        <StatCard label="In progress" value={stats?.in_progress ?? 0} icon={<Clock3 size={18} />} tone="teal" />
        <StatCard label="Waiting for you" value={stats?.waiting ?? 0} icon={<Clock3 size={18} />} tone="amber" />
        <StatCard label="Resolved" value={stats?.resolved ?? 0} icon={<CircleCheck size={18} />} tone="green" />
        <StatCard label="Closed" value={stats?.closed ?? 0} icon={<CircleCheck size={18} />} tone="navy" />
      </div>
      <div className="action-grid">
        <Link className="action-card card" to="/tickets/new">
          <PlusCircle size={18} />
          <strong>New ticket</strong>
          <span>Describe the problem and send it to the desk.</span>
        </Link>
        <Link className="action-card card" to="/tickets">
          <Ticket size={18} />
          <strong>My tickets</strong>
          <span>Follow status, replies, and resolution notes.</span>
        </Link>
        <Link className="action-card card" to="/knowledge">
          <BookOpen size={18} />
          <strong>Knowledge base</strong>
          <span>Check a known fix before opening a ticket.</span>
        </Link>
        <Link className="action-card card" to="/profile">
          <UserRound size={18} />
          <strong>Profile</strong>
          <span>Review the name and role on your account.</span>
        </Link>
      </div>
      <section className="panel card">
        <h2>Recently closed</h2>
        {closed.length === 0 ? <p className="muted">Closed tickets will show here after support finishes them.</p> : (
          <div className="ticket-grid">
            {closed.map((ticket) => <TicketCard key={ticket.id} ticket={ticket} />)}
          </div>
        )}
      </section>
      <section className="panel card">
        <h2>Recently updated</h2>
        {recent.length === 0 ? (
          <EmptyState title="No tickets yet" message="Create a ticket when something needs support." action={<Link className="button button-primary" to="/tickets/new">Create new ticket</Link>} />
        ) : (
          <div className="ticket-grid">
            {recent.map((ticket) => <TicketCard key={ticket.id} ticket={ticket} />)}
          </div>
        )}
      </section>
    </section>
  );
}
