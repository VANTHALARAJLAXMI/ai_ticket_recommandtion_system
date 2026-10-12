import { useState } from 'react';
import { useAuth } from '../hooks/useAuth.js';
import { useToast } from '../components/Toast.jsx';
import { formatDateTime, roleLabel } from '../lib/format.js';
import { validatePassword } from '../lib/validators.js';

export default function Profile() {
  const { user, profile, saveProfile, savePassword } = useAuth();
  const pushToast = useToast();
  const [name, setName] = useState(profile.full_name);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  async function submitName(event) {
    event.preventDefault();
    setBusy(true);
    const result = await saveProfile(name);
    setBusy(false);
    if (result.error) pushToast(result.error, 'error');
    else pushToast('Profile updated.', 'success');
  }

  async function submitPassword(event) {
    event.preventDefault();
    const passwordError = validatePassword(password);
    if (passwordError) {
      pushToast(passwordError, 'error');
      return;
    }
    if (password !== confirm) {
      pushToast('The passwords do not match.', 'error');
      return;
    }
    setBusy(true);
    const result = await savePassword(password);
    setBusy(false);
    if (result.error) pushToast(result.error, 'error');
    else {
      setPassword('');
      setConfirm('');
      pushToast('Password updated.', 'success');
    }
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>Profile</h1>
          <p>{roleLabel(profile.role)} since {formatDateTime(profile.created_at)}</p>
        </div>
      </header>
      <div className="split">
        <form className="panel card" onSubmit={submitName}>
          <h2>Name</h2>
          <p className="muted">{user.email}</p>
          <label className="field">
            <span className="field-label">Full name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <button className="button button-primary" type="submit" disabled={busy}>Save name</button>
        </form>
        <form className="panel card" onSubmit={submitPassword}>
          <h2>Password</h2>
          <p className="muted">Supabase Auth stores the new password. It is not written to the application tables.</p>
          <label className="field">
            <span className="field-label">New password</span>
            <input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Confirm password</span>
            <input type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} />
          </label>
          <button className="button button-secondary" type="submit" disabled={busy}>Update password</button>
        </form>
      </div>
    </section>
  );
}
