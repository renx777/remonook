// Android app updates. The app is installed from an APK (not a store yet), so it cannot replace
// itself: it checks the channel's android.json (written by the Android app workflow) and, when
// a newer build exists, offers to download it. Android then asks the person to install it over
// the current app; notes are kept because the app's storage stays in place.
import React, { useEffect, useState } from 'react';
import { isMobileApp, openExternal, desktopInvoke } from './desktop';
import { APP_ENV, CLOUD_API } from './cloud-config';

type Latest = { version: string; url: string };
const FIRST_CHECK = 15_000, EVERY = 6 * 60 * 60 * 1000;

/** Whether version a (like 0.1.21) is newer than b. */
export const newer = (a: string, b: string) => {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0; }
  return false;
};

export function AndroidUpdate() {
  const [latest, setLatest] = useState<Latest | null>(null), [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (!isMobileApp() || !CLOUD_API || (APP_ENV !== 'staging' && APP_ENV !== 'production')) return;
    let alive = true;
    const check = async () => {
      try {
        const [current, r] = await Promise.all([desktopInvoke<string>('plugin:app|version'), fetch(`${CLOUD_API}/desktop/${APP_ENV}/android.json`, { cache: 'no-store' })]);
        if (!r.ok) return;
        const next = await r.json() as Latest;
        if (alive && typeof next?.version === 'string' && /^https:\/\//.test(next.url) && newer(next.version, current)) setLatest(next);
      } catch { /* offline: try again later */ }
    };
    const first = setTimeout(() => void check(), FIRST_CHECK), every = setInterval(() => void check(), EVERY);
    return () => { alive = false; clearTimeout(first); clearInterval(every); };
  }, []);
  if (!latest || hidden) return null;
  return <div className="desktop-update" role="status">
    <div><strong>Update available</strong><small>RemoNook {latest.version} is ready to download. Open the file when it finishes and choose Update.</small></div>
    <div className="desktop-update-actions">
      <button onClick={() => setHidden(true)}>Later</button>
      <button className="primary" onClick={() => { void openExternal(latest.url); setHidden(true); }}>Download</button>
    </div>
  </div>;
}
