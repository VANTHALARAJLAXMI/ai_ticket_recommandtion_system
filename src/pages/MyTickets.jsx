import TicketBrowser from '../components/TicketBrowser.jsx';

export default function MyTickets() {
  return (
    <TicketBrowser
      scope="mine"
      title="My tickets"
      subtitle="Requests you submitted. Internal support notes are not included."
    />
  );
}
