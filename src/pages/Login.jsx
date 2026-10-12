import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import logo from '../assets/logo.svg';
import { useAuth } from '../hooks/useAuth.js';
import { roleLabel } from '../lib/format.js';
import { returnPathForRole } from '../lib/validators.js';

export default function Login() {
  const { configured, user, profile, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedRole, setSelectedRole] = useState('employee');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const roles = [
    { id: 'employee', label: 'Employee' },
    { id: 'agent', label: 'Support Agent' },
    { id: 'admin', label: 'Admin' },
  ];

  if (user && profile) return <Navigate to={returnPathForRole(profile.role, location.state?.from)} replace />;

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const result = await login(email, password, selectedRole);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    navigate(returnPathForRole(result.profile.role, location.state?.from));
  }

  return (
    <div className="auth-page">
      <aside className="auth-aside">
        <Link to="/" className="brand">
          <img src={logo} alt="" />
          <div><strong>Northline</strong><span>IT support desk</span></div>
        </Link>
        <p>Choose the desk that matches your profile, then sign in. The choice is checked against your saved role and does not change it.</p>
      </aside>
      <section className="auth-panel">
        <form className="auth-card" onSubmit={handleSubmit}>
          <h1>Sign in</h1>
          {!configured ? (
            <div className="banner banner-error">
              Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env, then restart the dev server.
            </div>
          ) : null}
          {error ? <div className="banner banner-error">{error}</div> : null}
          <fieldset className="role-choice">
            <legend>Sign in as</legend>
            {roles.map((role) => (
              <label key={role.id} className={selectedRole === role.id ? 'role-option is-selected' : 'role-option'}>
                <input
                  type="radio"
                  name="role"
                  value={role.id}
                  checked={selectedRole === role.id}
                  onChange={() => setSelectedRole(role.id)}
                />
                <span>{role.label}</span>
              </label>
            ))}
          </fieldset>
          <label className="field">
            <span className="field-label">Email</span>
            <input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label className="field">
            <span className="field-label">Password</span>
            <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          </label>
          <button className="button button-primary" type="submit" disabled={!configured || busy}>
            {busy ? 'Signing in…' : `Sign in as ${roleLabel(selectedRole)}`}
          </button>
          <p>New here? <Link to="/signup">Create an employee account</Link></p>
        </form>
      </section>
    </div>
  );
}
