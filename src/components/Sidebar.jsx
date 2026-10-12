import { BookOpen, LayoutDashboard, PlusCircle, Shield, Ticket, UserRound, Users } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import logo from '../assets/logo.svg';

const LINKS = {
  employee: [
    { to: '/dashboard', label: 'My dashboard', icon: LayoutDashboard },
    { to: '/tickets', label: 'My tickets', icon: Ticket },
    { to: '/tickets/new', label: 'New ticket', icon: PlusCircle },
  ],
  agent: [
    { to: '/agent', label: 'Agent queue', icon: Shield },
    { to: '/queue', label: 'All assigned work', icon: Ticket },
    { to: '/tickets', label: 'My requests', icon: Ticket },
    { to: '/tickets/new', label: 'New ticket', icon: PlusCircle },
  ],
  admin: [
    { to: '/admin', label: 'Admin overview', icon: LayoutDashboard },
    { to: '/admin/tickets', label: 'All tickets', icon: Ticket },
    { to: '/admin/users', label: 'People', icon: Users },
    { to: '/tickets/new', label: 'New ticket', icon: PlusCircle },
  ],
};

export default function Sidebar({ role, open, onNavigate }) {
  const links = [...(LINKS[role] || LINKS.employee), { to: '/knowledge', label: 'Knowledge base', icon: BookOpen }, { to: '/profile', label: 'Profile', icon: UserRound }];

  return (
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      <NavLink to={links[0].to} className="brand" onClick={onNavigate}>
        <img src={logo} alt="" />
        <div>
          <strong>Northline</strong>
          <span>IT support desk</span>
        </div>
      </NavLink>
      <nav className="nav-list" aria-label="Workspace">
        {links.map((link) => {
          const Icon = link.icon;
          return (
            <NavLink key={link.to} to={link.to} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={onNavigate}>
              <Icon size={18} aria-hidden="true" />
              {link.label}
            </NavLink>
          );
        })}
      </nav>
      <p className="sidebar-foot">AI suggestions stay with the ticket. They do not close it or change access.</p>
    </aside>
  );
}
