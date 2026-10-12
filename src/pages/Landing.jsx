import { Link } from 'react-router-dom';
import logo from '../assets/logo.svg';
import { useAuth } from '../hooks/useAuth.js';
import { homePathForRole } from '../lib/validators.js';

export default function Landing() {
  const { user, profile } = useAuth();
  const destination = profile ? homePathForRole(profile.role) : '/login';

  return (
    <div className="landing">
      <header className="landing-nav">
        <Link className="brand" to="/" style={{ color: 'inherit' }}>
          <img src={logo} alt="" width="40" height="40" />
          <div>
            <strong>Northline</strong>
            <span>IT support desk</span>
          </div>
        </Link>
        <div className="row">
          {user ? <Link className="button button-primary" to={destination}>Open desk</Link> : (
            <>
              <Link className="button button-secondary" to="/login">Sign in</Link>
              <Link className="button button-primary" to="/signup">Create account</Link>
            </>
          )}
        </div>
      </header>
      <section className="landing-hero">
        <div>
          <p className="eyebrow">Internal service desk</p>
          <h1>Report the problem. Keep the ticket moving.</h1>
          <p className="lede">
            Employees submit technical issues, support agents work them to resolution, and administrators see the whole queue. When the Ollama API is reachable, each ticket receives a reviewed recommendation. When it is not, the ticket still exists and the team continues manually.
          </p>
          <div className="row" style={{ marginTop: 18 }}>
            <Link className="button button-primary" to={user ? destination : '/signup'}>Get started</Link>
            <Link className="button button-secondary" to="/login">I already have an account</Link>
          </div>
        </div>
        <article className="preview-card card">
          <p className="preview-label">How a ticket moves</p>
          <h2>Open, reviewed, resolved</h2>
          <p>The desk records the request, asks the Ollama API for a classification, and leaves status changes to people.</p>
          <div className="preview-line" />
          <div className="preview-line short" />
          <div className="preview-line" />
        </article>
      </section>
      <section className="role-grid">
        <article className="role-card card">
          <h2>Employee</h2>
          <p>Create tickets, follow status, read public replies, and reopen a resolved ticket when the issue returns.</p>
        </article>
        <article className="role-card card">
          <h2>Support agent</h2>
          <p>Take unassigned work, update status and priority, and keep internal notes away from the employee view.</p>
        </article>
        <article className="role-card card">
          <h2>Admin</h2>
          <p>Assign work, manage roles and categories, read the audit trail, and maintain the knowledge base.</p>
        </article>
      </section>
      <section className="step-grid">
        <article className="step card"><strong>1. Submit</strong><p>Title, description, category, impact, and urgency are checked before anything is saved.</p></article>
        <article className="step card"><strong>2. Analyze</strong><p>The edge function sends the stored ticket to the Ollama API and keeps the result only when it matches the schema.</p></article>
        <article className="step card"><strong>3. Resolve</strong><p>Agents write resolution notes. The model cannot close the ticket or change anyone’s role.</p></article>
      </section>
    </div>
  );
}
