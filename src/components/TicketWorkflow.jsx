import { useEffect, useState } from 'react';
import { allowedProgressTargets, validateResolutionNotes } from '../lib/validators.js';

export function AssignSelect({ ticket, agents, disabled, onAssign, compact = false }) {
  return (
    <label className="field">
      {compact ? <span className="sr-only">Assign {ticket.ticket_number}</span> : <span className="field-label">Assign to agent</span>}
      <select
        aria-label={`Assign ${ticket.ticket_number} to an agent`}
        value={ticket.assigned_to || ''}
        disabled={disabled}
        onChange={(event) => onAssign(event.target.value || null)}
      >
        <option value="">Unassigned</option>
        {agents.map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}
      </select>
    </label>
  );
}

export function StatusSelect({ ticket, disabled, onChangeStatus, onResolve, compact = false }) {
  const targets = allowedProgressTargets(ticket.status);
  const canClose = ticket.status !== 'Closed' && ticket.status !== 'Resolved';
  const [choice, setChoice] = useState(ticket.status);
  const [notes, setNotes] = useState('');
  const [noteError, setNoteError] = useState('');

  useEffect(() => {
    setChoice(ticket.status);
    setNotes('');
    setNoteError('');
  }, [ticket.id, ticket.status]);

  if (targets.length === 0) return compact ? <span className="muted">{ticket.status}</span> : null;

  function changeStatus(event) {
    const next = event.target.value;
    setChoice(next);
    setNoteError('');
    if (next && next !== 'Closed' && next !== ticket.status) onChangeStatus(next);
  }

  function closeTicket(event) {
    event.preventDefault();
    const error = validateResolutionNotes('Closed', notes);
    if (error) {
      setNoteError(error);
      return;
    }
    onResolve(cleanNotes(notes));
  }

  return (
    <div className="stack">
      <label className="field">
        {compact ? <span className="sr-only">Change status for {ticket.ticket_number}</span> : <span className="field-label">Change status</span>}
        <select
          aria-label={`Change status for ${ticket.ticket_number}`}
          value={choice}
          disabled={disabled}
          onChange={changeStatus}
        >
          <option value={ticket.status}>{ticket.status}</option>
          {targets.map((status) => <option key={status} value={status}>{status}</option>)}
          {canClose ? <option value="Closed">Closed</option> : null}
        </select>
      </label>
      {choice === 'Closed' && canClose ? (
        <form className="stack" onSubmit={closeTicket}>
          <label className="field">
            <span className="field-label">Resolution notes</span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              minLength={10}
              maxLength={4000}
              required
              placeholder="How the problem was resolved"
            />
          </label>
          {noteError ? <p className="field-error">{noteError}</p> : null}
          <button className="button button-primary button-small" type="submit" disabled={disabled || validateResolutionNotes('Closed', notes) !== ''}>
            Close ticket
          </button>
        </form>
      ) : null}
    </div>
  );
}

function cleanNotes(value) {
  return String(value ?? '').replace(/\u0000/g, '').trim();
}
