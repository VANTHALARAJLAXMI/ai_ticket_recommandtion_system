import TicketBrowser from '../components/TicketBrowser.jsx';

export default function AllTickets({ scope = 'queue' }) {
  const copy = scope === 'all'
    ? ['All tickets', 'Assign a ticket to a support agent. That agent can then change its status and resolve it.']
    : ['Ticket queue', 'Tickets an admin assigned to you. Change the status here, then open the ticket to resolve it.'];
  return <TicketBrowser scope={scope} title={copy[0]} subtitle={copy[1]} />;
}
