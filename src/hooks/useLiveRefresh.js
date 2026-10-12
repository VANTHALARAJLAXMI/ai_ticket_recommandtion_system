import { useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient.js';

export function liveLabel(updatedAt, now = Date.now()) {
  if (!updatedAt) return 'Waiting for the latest tickets';
  const seconds = Math.max(0, Math.round((now - updatedAt) / 1000));
  if (seconds < 5) return 'Updated just now';
  if (seconds < 60) return `Updated ${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  return `Updated ${minutes}m ago`;
}

export function useLiveRefresh(load) {
  const [updatedAt, setUpdatedAt] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let active = true;
    let debounce = 0;
    let running = false;
    let queued = false;

    async function run() {
      if (running) {
        queued = true;
        return;
      }
      running = true;
      try {
        await load();
        if (active) setUpdatedAt(Date.now());
      } catch {
        if (active) setUpdatedAt(Date.now());
      } finally {
        running = false;
        if (queued && active) {
          queued = false;
          run();
        }
      }
    }

    function schedule() {
      window.clearTimeout(debounce);
      debounce = window.setTimeout(run, 600);
    }

    run();
    const poll = window.setInterval(run, 20000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') schedule();
    };
    document.addEventListener('visibilitychange', onVisible);

    let channel;
    if (supabase) {
      channel = supabase
        .channel(`desk-live-${typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Date.now()}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, schedule)
        .subscribe((status) => {
          if (active) setConnected(status === 'SUBSCRIBED');
        });
    }

    return () => {
      active = false;
      window.clearTimeout(debounce);
      window.clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
      if (channel && supabase) supabase.removeChannel(channel);
    };
  }, [load]);

  return { updatedAt, connected };
}
