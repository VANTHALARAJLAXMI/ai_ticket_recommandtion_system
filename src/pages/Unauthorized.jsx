import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { homePathForRole } from '../lib/validators.js';

export default function Unauthorized() {
  const { profile } = useAuth();
  return (
    <section className="empty-state card">
      <h1>Not available for your role</h1>
      <p>Your account does not have access to that area.</p>
      <Link className="button button-primary" to={homePathForRole(profile?.role)}>Go to your desk</Link>
    </section>
  );
}
