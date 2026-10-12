import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import { useToast } from '../components/Toast.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { ROLES } from '../lib/constants.js';
import { formatDateTime, roleLabel } from '../lib/format.js';
import { validateFullName, validatePassword } from '../lib/validators.js';
import { createAgent, listUsers } from '../services/authService.js';

const EMPTY_AGENT = { fullName: '', email: '', password: '' };

export default function UserManagement() {
  const { user, changeRole } = useAuth();
  const pushToast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showAgentForm, setShowAgentForm] = useState(searchParams.get('add') === 'agent');
  const [agentForm, setAgentForm] = useState(EMPTY_AGENT);
  const [agentError, setAgentError] = useState('');
  const [adding, setAdding] = useState(false);

  async function load() {
    const result = await listUsers();
    setUsers(result.users);
    setError(result.error || '');
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function openAgentForm() {
    setShowAgentForm(true);
    setAgentError('');
    setSearchParams({ add: 'agent' });
  }

  function closeAgentForm() {
    setShowAgentForm(false);
    setAgentForm(EMPTY_AGENT);
    setAgentError('');
    setSearchParams({});
  }

  async function submitAgent(event) {
    event.preventDefault();
    const nameError = validateFullName(agentForm.fullName);
    const passwordError = validatePassword(agentForm.password);
    if (nameError || passwordError) {
      setAgentError(nameError || passwordError);
      return;
    }
    setAdding(true);
    setAgentError('');
    const result = await createAgent(agentForm);
    setAdding(false);
    if (result.error) {
      setAgentError(result.error);
      return;
    }
    pushToast(`${result.agent?.full_name || 'The agent'} can sign in as Support Agent.`, 'success');
    setAgentForm(EMPTY_AGENT);
    setShowAgentForm(false);
    setSearchParams({});
    load();
  }

  if (loading) return <LoadingSpinner label="Loading people" />;

  const admins = users.filter((person) => person.role === 'admin').length;
  const agents = users.filter((person) => person.role === 'agent').length;

  return (
    <section className="page desk">
      <header className="desk-hero">
        <div>
          <p className="eyebrow">People</p>
          <h1>Agents and admins</h1>
          <p>Add a support agent with a new login. Only an admin who is signed in can do this. {admins} admin{admins === 1 ? '' : 's'} and {agents} agent{agents === 1 ? '' : 's'} are on the desk now.</p>
        </div>
        <div className="desk-side">
          <div className="desk-actions">
            <button className="button button-primary" type="button" onClick={openAgentForm}>Add agent</button>
            <Link className="button button-secondary" to="/admin">Back to admin desk</Link>
          </div>
        </div>
      </header>
      {error ? <div className="banner banner-error">{error}</div> : null}
      {showAgentForm ? (
        <form className="card panel" onSubmit={submitAgent}>
          <h2>Add agent</h2>
          <p className="muted">This creates a Support Agent login. The new person signs in with Support Agent selected. It does not change your admin session.</p>
          {agentError ? <div className="banner banner-error">{agentError}</div> : null}
          <label className="field">
            <span className="field-label">Full name</span>
            <input
              value={agentForm.fullName}
              onChange={(event) => setAgentForm((current) => ({ ...current, fullName: event.target.value }))}
              autoComplete="off"
              required
            />
          </label>
          <label className="field">
            <span className="field-label">Email</span>
            <input
              type="email"
              value={agentForm.email}
              onChange={(event) => setAgentForm((current) => ({ ...current, email: event.target.value }))}
              autoComplete="off"
              required
            />
          </label>
          <label className="field">
            <span className="field-label">Password</span>
            <input
              type="password"
              value={agentForm.password}
              onChange={(event) => setAgentForm((current) => ({ ...current, password: event.target.value }))}
              autoComplete="new-password"
              required
            />
          </label>
          <div className="desk-actions">
            <button className="button button-primary" type="submit" disabled={adding}>
              {adding ? 'Adding agent…' : 'Add agent'}
            </button>
            <button className="button button-secondary" type="button" onClick={closeAgentForm} disabled={adding}>Cancel</button>
          </div>
        </form>
      ) : null}
      <div className="table-wrap card">
        <table>
          <thead>
            <tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th><th>Change</th></tr>
          </thead>
          <tbody>
            {users.map((person) => (
              <tr key={person.id}>
                <td>{person.full_name}</td>
                <td>{person.email}</td>
                <td>{roleLabel(person.role)}</td>
                <td>{formatDateTime(person.created_at)}</td>
                <td>
                  <label className="sr-only" htmlFor={`role-${person.id}`}>Role for {person.full_name}</label>
                  <select
                    id={`role-${person.id}`}
                    defaultValue={person.role}
                    onChange={(event) => setPending({ person, role: event.target.value })}
                  >
                    {ROLES.map((role) => (
                      <option key={role} value={role} disabled={person.id === user.id && role !== 'admin'}>
                        {roleLabel(role)}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ConfirmDialog
        open={Boolean(pending)}
        title="Change role?"
        message={pending ? `${pending.person.full_name} will become ${roleLabel(pending.role)}.` : ''}
        confirmLabel="Change role"
        busy={busy}
        onCancel={() => setPending(null)}
        onConfirm={async () => {
          setBusy(true);
          const result = await changeRole(pending.person.id, pending.role);
          setBusy(false);
          setPending(null);
          if (result.error) pushToast(result.error, 'error');
          else {
            pushToast('Role updated.', 'success');
            load();
          }
        }}
      />
    </section>
  );
}
