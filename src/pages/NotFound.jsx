import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <section className="empty-state">
      <h1>Page not found</h1>
      <p>That address is not part of the support desk.</p>
      <Link className="button button-primary" to="/">Back to the start</Link>
    </section>
  );
}
