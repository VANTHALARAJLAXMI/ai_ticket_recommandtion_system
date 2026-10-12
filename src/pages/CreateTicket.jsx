import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import TicketForm from '../components/TicketForm.jsx';
import { useToast } from '../components/Toast.jsx';
import { analyzeTicket } from '../services/aiService.js';
import { createTicket, listCategories } from '../services/ticketService.js';

export default function CreateTicket() {
  const navigate = useNavigate();
  const pushToast = useToast();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [statusNote, setStatusNote] = useState('');

  useEffect(() => {
    listCategories().then((result) => {
      setCategories(result.categories.map((category) => category.name));
      setError(result.error || (result.categories.length ? '' : 'No active categories are available.'));
      setLoading(false);
    });
  }, []);

  async function handleSubmit(values) {
    setSubmitting(true);
    const created = await createTicket(values, categories);
    if (created.error) {
      setError(created.error);
      setSubmitting(false);
      return;
    }
    setStatusNote('Ticket saved. Asking the AI service for a suggestion…');
    const analysis = await analyzeTicket(created.ticket.id);
    setSubmitting(false);
    setStatusNote('');
    const saved = `Ticket ${created.ticket.ticket_number} was saved.`;
    if (analysis.ok) pushToast(`${saved} Review the AI suggestion before acting on it.`, 'success');
    else pushToast(`${saved} ${analysis.message}`, analysis.unavailable ? 'info' : 'error');
    navigate(`/tickets/${created.ticket.id}`, {
      state: analysis.ok
        ? { notice: `${saved} Review the AI suggestion before acting on it.` }
        : { warning: `${saved} ${analysis.message}` },
    });
  }

  if (loading) return <LoadingSpinner label="Loading the form" />;

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>Create a ticket</h1>
          <p>The initial priority follows the urgency you choose. AI may suggest a different priority for an agent to accept.</p>
        </div>
      </header>
      {error ? <div className="banner banner-error">{error}</div> : null}
      {statusNote ? <div className="banner" role="status">{statusNote}</div> : null}
      <div className="card" style={{ padding: 18 }}>
        <TicketForm categories={categories} onSubmit={handleSubmit} submitting={submitting} />
      </div>
    </section>
  );
}
