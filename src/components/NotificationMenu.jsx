import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatDateTime } from '../lib/format.js';
import { listNotifications, markAllNotificationsRead, markNotificationRead } from '../services/notificationService.js';
import { supabase } from '../services/supabaseClient.js';
import { useAuth } from '../hooks/useAuth.js';

export default function NotificationMenu() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');

  async function load() {
    const result = await listNotifications();
    setItems(result.notifications);
    setError(result.error || '');
  }

  useEffect(() => {
    load();
    if (!supabase || !user?.id) return undefined;
    const channel = supabase
      .channel(`notifications-${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const unread = items.filter((item) => !item.read_at).length;

  async function openItem(item) {
    if (!item.read_at) {
      const result = await markNotificationRead(item.id);
      if (result.error) setError(result.error);
      else setItems((current) => current.map((row) => (row.id === item.id ? { ...row, read_at: new Date().toISOString() } : row)));
    }
    setOpen(false);
  }

  async function markAll() {
    const result = await markAllNotificationsRead();
    if (result.error) setError(result.error);
    else await load();
  }

  return (
    <div className="notice-menu">
      <button className="icon-button notice-button" type="button" aria-expanded={open} aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} onClick={() => setOpen((value) => !value)}>
        <Bell size={18} />
        {unread > 0 ? <span className="notice-count">{unread}</span> : null}
      </button>
      {open ? (
        <div className="notice-panel card" role="dialog" aria-label="Notifications">
          <header className="row">
            <strong>Notifications</strong>
            <button className="button button-secondary button-small" type="button" onClick={markAll} disabled={unread === 0}>Mark all read</button>
          </header>
          {error ? <p className="field-error">{error}</p> : null}
          {items.length === 0 && !error ? <p className="muted">No notifications yet.</p> : null}
          <ul className="plain-list">
            {items.map((item) => (
              <li key={item.id} className={item.read_at ? '' : 'notice-unread'}>
                {item.ticket_id ? (
                  <Link to={`/tickets/${item.ticket_id}`} onClick={() => openItem(item)}>{item.title}</Link>
                ) : <span>{item.title}</span>}
                <small>{formatDateTime(item.created_at)}</small>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
