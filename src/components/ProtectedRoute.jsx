import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import LoadingSpinner from './LoadingSpinner.jsx';

export default function ProtectedRoute() {
  const { configured, loading, user, profile, profileError } = useAuth();
  const location = useLocation();

  if (!configured) return <Navigate to="/login" replace />;
  if (loading) return <LoadingSpinner label="Checking your session" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!profile) {
    return (
      <main className="content">
        <div className="banner banner-error">{profileError || 'Your profile could not be loaded.'}</div>
      </main>
    );
  }
  return <Outlet />;
}
