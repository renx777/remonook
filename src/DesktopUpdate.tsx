// Desktop auto-update: checks the channel's latest.json (signed builds only; the public key is
// built into the app), downloads in the background, then offers a restart. Nothing installs
// without the person choosing "Restart to update", so an open edit is never interrupted.
import React, { useEffect, useRef, useState } from 'react';
import { isDesktop } from './desktop';

type Ready = { version: string; install: () => Promise<void> };
const FIRST_CHECK = 15_000, EVERY = 6 * 60 * 60 * 1000;

export function DesktopUpdate({ flush }: { flush?: () => Promise<unknown> | unknown }) {
  const [ready, setReady] = useState<Ready | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [hidden, setHidden] = useState(false);
  const checking = useRef(false);
  useEffect(() => {
    if (!isDesktop()) return;
    let alive = true;
    const check = async () => {
      if (checking.current || ready) return; checking.current = true;
      try {
        const { check } = await import('@tauri-apps/plugin-updater');
        const update = await check();
        if (!update || !alive) return;
        await update.download();
        if (!alive) return;
        setReady({ version: update.version, install: () => update.install() });
      } catch { /* offline or no update channel yet: try again later */ }
      finally { checking.current = false; }
    };
    const first = setTimeout(() => void check(), FIRST_CHECK), every = setInterval(() => void check(), EVERY);
    return () => { alive = false; clearTimeout(first); clearInterval(every); };
  }, [ready]);
  if (!ready || hidden) return null;
  return <div className="desktop-update" role="status">
    <div><strong>Update ready</strong><small>RemoNook {ready.version} has downloaded.</small></div>
    {error && <small className="desktop-update-error">{error}</small>}
    <div className="desktop-update-actions">
      <button onClick={() => setHidden(true)} disabled={busy}>Later</button>
      <button className="primary" disabled={busy} onClick={async () => {
        setBusy(true); setError('');
        try {
          await flush?.();
          await ready.install();
          const { relaunch } = await import('@tauri-apps/plugin-process');
          await relaunch();
        } catch (e) { setError(e instanceof Error ? e.message : String(e)); setBusy(false); }
      }}>{busy ? 'Restarting…' : 'Restart to update'}</button>
    </div>
  </div>;
}
