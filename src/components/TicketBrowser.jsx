import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { useTicketList } from '../hooks/useTickets.js';
import { PRIORITIES, STATUSES } from '../lib/constants.js';
import { formatDateTime } from '../lib/format.js';
import { assignTicket, listCategories, listStaff, resolveTicket, updateTicketProgress } from '../services/ticketService.js';
import EmptyState from './EmptyState.jsx';
import LoadingSpinner from './LoadingSpinner.jsx';
import PriorityBadge from './PriorityBadge.jsx';
import SearchBar from './SearchBar.jsx';
import StatusBadge from './StatusBadge.jsx';
import TicketCard from './TicketCard.jsx';
import { AssignSelect, StatusSelect } from './TicketWorkflow.jsx';
import { useToast } from './Toast.jsx';

export default function TicketBrowser({ scope, title, subtitle }) {
  const { user, role } = useAuth();
  const pushToast = useToast();
  const { tickets, count, loading, error, filters, updateFilters, reload, pageSize } = useTicketList(scope);
  const [draftSearch, setDraftSearch] = useState('');
  const [categories, setCategories] = useState([]);
  const [staff, setStaff] = useState([]);
  const [busyId, setBusyId] = useState('');
  const pageCount = Math.max(1, Math.ceil(count / pageSize));
  const agents = staff.filter((person) => person.role === 'agent');
  const canAssign = scope === 'all' && role === 'admin';
  const canChangeStatus = scope === 'queue' && role === 'agent';

  useEffect(() => {
    listCategories().then((result) => setCategories(result.categories.map((category) => category.name)));
    if (scope !== 'mine') listStaff().then((result) => setStaff(result.staff || []));
  }, [scope]);

  function applySearch(event) {
    event.preventDefault();
    updateFilters({ search: draftSearch });
  }

  async function runTicketAction(ticketId, action, success) {
    setBusyId(ticketId);
    const result = await action();
    setBusyId('');
    if (result.error) pushToast(result.error, 'error');
    else pushToast(success, 'success');
    reload();
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
      </header>
      <form className="filters card" style={{ padding: 12 }} onSubmit={applySearch}>
        <SearchBar id={`${scope}-search`} value={draftSearch} onChange={setDraftSearch} placeholder="Ticket number or title" />
        <label className="field">
          <span className="field-label">Status</span>
          <select value={filters.status} onChange={(event) => updateFilters({ status: event.target.value })}>
            <option value="">All</option>
            {STATUSES.map((status) => <option key={status}>{status}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Priority</span>
          <select value={filters.priority} onChange={(event) => updateFilters({ priority: event.target.value })}>
            <option value="">All</option>
            {PRIORITIES.map((priority) => <option key={priority}>{priority}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Category</span>
          <select value={filters.category} onChange={(event) => updateFilters({ category: event.target.value })}>
            <option value="">All</option>
            {categories.map((category) => <option key={category}>{category}</option>)}
          </select>
        </label>
        {scope !== 'mine' ? (
          <label className="field">
            <span className="field-label">Assigned agent</span>
            <select value={filters.assignee} onChange={(event) => updateFilters({ assignee: event.target.value })}>
              <option value="">All</option>
              {staff.map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}
            </select>
          </label>
        ) : null}
        <label className="field">
          <span className="field-label">From</span>
          <input type="date" value={filters.from} onChange={(event) => updateFilters({ from: event.target.value })} />
        </label>
        <label className="field">
          <span className="field-label">To</span>
          <input type="date" value={filters.to} onChange={(event) => updateFilters({ to: event.target.value })} />
        </label>
        <label className="field">
          <span className="field-label">Sort</span>
          <select value={filters.sort} onChange={(event) => updateFilters({ sort: event.target.value })}>
            <option value="updated">Recently updated</option>
            <option value="created">Newest</option>
            <option value="priority">Priority</option>
          </select>
        </label>
        <button className="button button-secondary" type="submit">Search</button>
      </form>
      {error ? <div className="banner banner-error">{error}</div> : null}
      {loading ? <LoadingSpinner label="Loading tickets" /> : null}
      {!loading && tickets.length === 0 ? (
        <EmptyState title="No tickets" message={filters.search ? 'No tickets match that search.' : 'Nothing is in this queue yet.'} />
      ) : null}
      {tickets.length > 0 ? (
        <>
          <div className="table-wrap card desktop-table">
            <table>
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Title</th>
                  <th>Category</th>
                  <th>Priority</th>
                  <th>Status</th>
                  {canAssign ? <th>Assign to agent</th> : null}
                  {canChangeStatus ? <th>Change status</th> : null}
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket) => (
                  <tr key={ticket.id}>
                    <td className="mono"><Link to={`/tickets/${ticket.id}`}>{ticket.ticket_number}</Link></td>
                    <td>{ticket.title}</td>
                    <td>{ticket.category}</td>
                    <td><PriorityBadge priority={ticket.priority} /></td>
                    <td><StatusBadge status={ticket.status} /></td>
                    {canAssign ? (
                      <td>
                        <AssignSelect
                          ticket={ticket}
                          agents={agents}
                          compact
                          disabled={busyId === ticket.id}
                          onAssign={(agentId) => runTicketAction(ticket.id, () => assignTicket(ticket.id, agentId), 'Ticket assigned to the agent.')}
                        />
                      </td>
                    ) : null}
                    {canChangeStatus ? (
                      <td>
                        {ticket.assigned_to === user?.id ? (
                          <StatusSelect
                            ticket={ticket}
                            compact
                            disabled={busyId === ticket.id}
                            onChangeStatus={(next) => runTicketAction(ticket.id, () => updateTicketProgress(ticket.id, next), 'Status updated.')}
                            onResolve={(notes) => runTicketAction(ticket.id, () => resolveTicket(ticket.id, notes), 'Ticket closed.')}
                          />
                        ) : <span className="muted">Waiting for assignment</span>}
                      </td>
                    ) : null}
                    <td>{formatDateTime(ticket.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="ticket-grid mobile-cards">
            {tickets.map((ticket) => (
              <TicketCard key={ticket.id} ticket={ticket}>
                {canAssign ? (
                  <AssignSelect
                    ticket={ticket}
                    agents={agents}
                    disabled={busyId === ticket.id}
                    onAssign={(agentId) => runTicketAction(ticket.id, () => assignTicket(ticket.id, agentId), 'Ticket assigned to the agent.')}
                  />
                ) : null}
                {canChangeStatus && ticket.assigned_to === user?.id ? (
                  <StatusSelect
                    ticket={ticket}
                    disabled={busyId === ticket.id}
                    onChangeStatus={(next) => runTicketAction(ticket.id, () => updateTicketProgress(ticket.id, next), 'Status updated.')}
                    onResolve={(notes) => runTicketAction(ticket.id, () => resolveTicket(ticket.id, notes), 'Ticket closed.')}
                  />
                ) : null}
              </TicketCard>
            ))}
          </div>
          <div className="pager">
            <span className="muted">{count} ticket{count === 1 ? '' : 's'}</span>
            <div className="row">
              <button className="button button-secondary button-small" type="button" disabled={filters.page === 0} onClick={() => updateFilters({ page: filters.page - 1 })}>Previous</button>
              <span>Page {filters.page + 1} of {pageCount}</span>
              <button className="button button-secondary button-small" type="button" disabled={filters.page + 1 >= pageCount} onClick={() => updateFilters({ page: filters.page + 1 })}>Next</button>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
