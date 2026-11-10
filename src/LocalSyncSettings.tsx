// Settings → Desktop → Devices: local sync between this person's computers on the same network,
// and the pairing window shown when another computer asks to pair.
import React, { useEffect, useRef, useState } from 'react';
import { desktopInvoke, desktopListen } from './desktop';
import { localSyncStatus, onLocalSyncChange } from './local-sync';
import { localWorkspaces } from './workspaces';

type Status = Awaited<ReturnType<typeof localSyncStatus>>;
const message = (e: unknown) => e instanceof Error ? e.message : String(e);

export function LocalSyncSettings() {
  const [status, setStatus] = useState<Status | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [pairing, setPairing] = useState<{ session: number; name: string } | null>(null), [code, setCode] = useState(''), [address, setAddress] = useState('');
  const [name, setName] = useState<string | null>(null), [incoming, setIncoming] = useState<{ name: string; code: string } | null>(null);
  const refresh = () => localSyncStatus().then(setStatus).catch(e => setError(message(e)));
  useEffect(() => {
    void refresh();
    const stops = [desktopListen('local-sync-status', () => void refresh()),
      desktopListen('local-sync-paired', () => { setIncoming(null); void refresh(); }),
      desktopListen('local-sync-pair-failed', () => setIncoming(null)),
      desktopListen<{ name: string; code: string }>('local-sync-pair-request', r => setIncoming(r))];
    const off = onLocalSyncChange(() => void refresh());
    return () => { off(); for (const s of stops) void s.then(stop => stop()); };
  }, []);
  const act = async (fn: () => Promise<unknown>) => { setBusy(true); setError(''); try { await fn(); } catch (e) { setError(message(e)); } finally { setBusy(false); void refresh(); } };
  const synced = localWorkspaces().filter(w => w.peerSync);
  return <>
    <h4>Sync with my devices</h4>
    <p className="ai-apps-muted">RemoNook on your other computers on the same network keeps chosen workspaces in sync directly, encrypted, without RemoNook cloud. Turn on <strong>Sync with my devices</strong> for a workspace in the workspace menu.</p>
    {error && <p className="ai-apps-error" role="alert">{error}</p>}
    <label className="ai-apps-access"><input type="checkbox" disabled={!status || busy} checked={!!status?.enabled} onChange={e => void act(() => desktopInvoke('local_sync_set', { on: e.target.checked }))} />
      <span><strong>Local sync on this computer</strong><small>{status?.enabled ? `On. Its address on this network is ${status.address || 'unknown'}${status.port && status.port !== 47914 ? ':' + status.port : ''}.` : 'Off. Paired devices cannot reach this computer.'}</small></span></label>
    {status && <div className="local-sync-device">
      {name === null
        ? <p>This computer is called <strong>{status.deviceName}</strong>. <button type="button" className="link-button" onClick={() => setName(status.deviceName)}>Rename</button></p>
        : <form onSubmit={e => { e.preventDefault(); void act(() => desktopInvoke('local_sync_rename', { name })).then(() => setName(null)); }}>
          <label>Name of this computer <input value={name} maxLength={60} autoFocus onChange={e => setName(e.target.value)} /></label>
          <button type="submit" className="primary" disabled={busy || !name.trim()}>Save</button> <button type="button" onClick={() => setName(null)}>Cancel</button>
        </form>}
    </div>}
    {incoming && <div className="local-sync-incoming" role="status">
      <p><strong>{incoming.name}</strong> wants to sync with this computer. Type this code on {incoming.name}:</p>
      <p className="local-sync-code">{incoming.code.slice(0, 3)} {incoming.code.slice(3)}</p>
    </div>}
    {status?.enabled && <>
      <h4>Paired devices</h4>
      {!status.peers.length ? <p className="ai-apps-muted">None yet. Pair one below.</p>
        : <ul className="ai-apps-list">{status.peers.map(p => <li key={p.id}><span><strong>{p.name}</strong><small>{p.online ? '● Connected' : 'Not on this network right now'}</small></span>
          <button type="button" disabled={busy} onClick={() => { if (window.confirm(`Stop syncing with ${p.name}? Notes already synced stay on both computers.`)) void act(() => desktopInvoke('local_sync_unpair', { id: p.id })); }}>Remove</button></li>)}</ul>}
      <h4>Pair a device</h4>
      {pairing ? <form className="local-sync-pair" onSubmit={e => { e.preventDefault(); void act(async () => { await desktopInvoke('local_sync_pair_finish', { session: pairing.session, code }); setPairing(null); setCode(''); }); }}>
          <p>A 6-digit code is now showing on <strong>{pairing.name}</strong> (in a window on top, and in its Settings → Desktop). Type it here.</p>
          <input inputMode="numeric" autoComplete="one-time-code" aria-label="Pairing code" placeholder="123 456" value={code} maxLength={7} autoFocus onChange={e => setCode(e.target.value)} />
          <div><button type="submit" className="primary" disabled={busy || code.replace(/\D/g, '').length !== 6}>{busy ? 'Pairing…' : 'Pair'}</button> <button type="button" onClick={() => { void desktopInvoke('local_sync_pair_cancel', { session: pairing.session }); setPairing(null); setCode(''); }}>Cancel</button></div>
        </form>
        : <>
          <p className="ai-apps-muted">Open RemoNook on the other computer and turn on local sync there too. It appears here when it is on the same network.</p>
          {!status.nearby.length ? <p className="ai-apps-muted">Looking for computers…</p>
            : <ul className="ai-apps-list">{status.nearby.map(n => <li key={n.id}><span><strong>{n.name}</strong><small>{n.address}</small></span>
              <button type="button" className="primary" disabled={busy} onClick={() => void act(async () => setPairing(await desktopInvoke('local_sync_pair_start', { target: n.id })))}>Pair</button></li>)}</ul>}
          <details><summary>Not listed? Pair by address</summary>
            <form onSubmit={e => { e.preventDefault(); void act(async () => setPairing(await desktopInvoke('local_sync_pair_start', { target: address.trim() }))); }}>
              <p className="ai-apps-muted">Some networks hide devices from each other. Enter the other computer's address, shown in its Settings → Desktop.</p>
              <input aria-label="Address of the other computer" placeholder="192.168.1.20" value={address} onChange={e => setAddress(e.target.value)} />
              <button type="submit" disabled={busy || !address.trim()}>Pair</button>
            </form>
          </details>
        </>}
      <h4>Synced workspaces on this computer</h4>
      {!synced.length ? <p className="ai-apps-muted">None. Open a device-only workspace and choose <strong>Sync with my devices</strong> in the workspace menu.</p>
        : <ul className="ai-apps-activity">{synced.map(w => <li key={w.id}><span>{w.name}</span></li>)}</ul>}
    </>}
  </>;
}

/** Shown on this computer when another one asks to pair: the code to type there. */
export function LocalSyncPairing() {
  const [request, setRequest] = useState<{ name: string; code: string } | null>(null), [result, setResult] = useState('');
  useEffect(() => {
    const stops = [
      desktopListen<{ name: string; code: string }>('local-sync-pair-request', r => { setResult(''); setRequest(r); }),
      desktopListen<{ name: string }>('local-sync-paired', r => { setResult(`Paired with ${r.name}. Turn on “Sync with my devices” for a workspace to share it.`); }),
      desktopListen<{ message: string }>('local-sync-pair-failed', r => { setResult(r.message || 'Pairing did not finish.'); }),
    ];
    return () => { for (const s of stops) void s.then(stop => stop()); };
  }, []);
  const box = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = box.current; if (!d) return; if (request && !d.open) d.showModal(); if (!request && d.open) d.close(); }, [request]);
  return <dialog ref={box} className="local-sync-request" aria-label="Pair a device" onClose={() => setRequest(null)}>
    {request && <div className="local-sync-request-card">
      {result ? <><p>{result}</p><button type="button" className="primary" onClick={() => setRequest(null)}>Done</button></>
        : <><p><strong>{request.name}</strong> wants to sync with this computer.</p>
          <p>Type this code on {request.name}:</p>
          <p className="local-sync-code" aria-live="polite">{request.code.slice(0, 3)} {request.code.slice(3)}</p>
          <p className="ai-apps-muted">If you did not start this, close this window. Nothing is shared without the code.</p>
          <button type="button" onClick={() => setRequest(null)}>Close</button></>}
    </div>}
  </dialog>;
}
