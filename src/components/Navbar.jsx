import { LogOut, Menu } from 'lucide-react';
import { roleLabel } from '../lib/format.js';
import NotificationMenu from './NotificationMenu.jsx';

export default function Navbar({ profile, email, onMenu, onLogout }) {
  return (
    <header className="navbar">
      <div className="row">
        <button className="icon-button" type="button" aria-label="Open navigation" onClick={onMenu}>
          <Menu size={18} />
        </button>
        <span className="navbar-title">IT Support Desk</span>
      </div>
      <div className="user-chip">
        <NotificationMenu />
        <div>
          <strong>{profile?.full_name}</strong>
          <small>{roleLabel(profile?.role)} · {email}</small>
        </div>
        <button className="button button-secondary button-small" type="button" onClick={onLogout}>
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </header>
  );
}
