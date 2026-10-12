import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import logo from '../assets/logo.svg';
import { useAuth } from '../hooks/useAuth.js';
import { homePathForRole, validateFullName, validatePassword } from '../lib/validators.js';

export default function Signup() {
  const { configured, user, profile, register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ fullName: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  if (user && profile) return <Navigate to={homePathForRole(profile.role)} replace />;

  function setField(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    const nameError = validateFullName(form.fullName);
    const passwordError = validatePassword(form.password);
    if (nameError || passwordError) {
      setError(nameError || passwordError);
      return;
    }
    if (form.password !== form.confirm) {
      setError('The passwords do not match.');
      return;
    }
    setBusy(true);
    const result = await register(form);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.needsConfirmation) {
      setNotice('Account created. Confirm the email from Supabase, then sign in. New accounts start as employees.');
      return;
    }
    navigate(homePathForRole(result.profile?.role));
  }

  return (
    <div className="auth-page">
      <aside className="auth-aside">
        <Link to="/" className="brand">
          <img src={logo} alt="" />
          <div><strong>Northline</strong><span>IT support desk</span></div>
        </Link>
        <p>Every new registration becomes an employee. An administrator assigns agent and admin access later.</p>
      </aside>
      <section className="auth-panel">
        <form className="auth-card" onSubmit={handleSubmit}>
          <h1>Create account</h1>
          {!configured ? <div className="banner banner-error">Supabase environment variables are missing.</div> : null}
          {error ? <div className="banner banner-error">{error}</div> : null}
          {notice ? <div className="banner banner-ok">{notice}</div> : null}
          <label className="field">
            <span className="field-label">Full name</span>
            <input value={form.fullName} onChange={(event) => setField('fullName', event.target.value)} required />
          </label>
          <label className="field">
            <span className="field-label">Email</span>
            <input type="email" autoComplete="username" value={form.email} onChange={(event) => setField('email', event.target.value)} required />
          </label>
          <label className="field">
            <span className="field-label">Password</span>
            <input type="password" autoComplete="new-password" value={form.password} onChange={(event) => setField('password', event.target.value)} required />
          </label>
          <label className="field">
            <span className="field-label">Confirm password</span>
            <input type="password" autoComplete="new-password" value={form.confirm} onChange={(event) => setField('confirm', event.target.value)} required />
          </label>
          <p className="muted">Use at least 8 characters with one letter and one number.</p>
          <button className="button button-primary" type="submit" disabled={!configured || busy}>
            {busy ? 'Creating account…' : 'Create account'}
          </button>
          <p>Already registered? <Link to="/login">Sign in</Link></p>
        </form>
      </section>
    </div>
  );
}
