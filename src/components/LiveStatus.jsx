import { useEffect, useState } from 'react';
import { liveLabel } from '../hooks/useLiveRefresh.js';

export default function LiveStatus({ updatedAt, connected }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="live-status">
      <span className={`live-pill ${connected ? 'is-live' : ''}`}>
        <span className="live-dot" />
        {connected ? 'Live' : 'Auto-refresh'}
      </span>
      <span className="live-meta">{liveLabel(updatedAt, now)}</span>
    </div>
  );
}
