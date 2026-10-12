import { Link } from 'react-router-dom';
import { formatDateTime } from '../lib/format.js';
import PriorityBadge from './PriorityBadge.jsx';
import StatusBadge from './StatusBadge.jsx';

export default function TicketCard({ ticket, children }) {
  return (
    <article className="ticket-card card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="ticket-number">{ticket.ticket_number}</span>
        <StatusBadge status={ticket.status} />
      </div>
      <h3>{ticket.title}</h3>
      <p className="muted">{ticket.category}{ticket.owner?.full_name ? ` · ${ticket.owner.full_name}` : ''}</p>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <PriorityBadge priority={ticket.priority} />
        <time dateTime={ticket.updated_at}>{formatDateTime(ticket.updated_at)}</time>
      </div>
      {children}
      <Link className="button button-secondary" to={`/tickets/${ticket.id}`}>Open ticket</Link>
    </article>
  );
}
