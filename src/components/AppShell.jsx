import { useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import Navbar from './Navbar.jsx';
import Sidebar from './Sidebar.jsx';

export default function AppShell() {
  const { profile, user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="shell">
      <a className="skip-link" href="#main">Skip to content</a>
      <Sidebar role={profile.role} open={open} onNavigate={() => setOpen(false)} />
      {open ? <button className="backdrop" type="button" aria-label="Close navigation" onClick={() => setOpen(false)} /> : null}
      <div className="workspace">
        <Navbar profile={profile} email={user?.email} onMenu={() => setOpen(true)} onLogout={handleLogout} />
        <main id="main" className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
