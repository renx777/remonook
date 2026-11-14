// "Sync now": when this device last synced, and a button to sync right away. For an account it
// runs the cloud sync; for a device-only workspace synced with your devices it asks every
// connected paired device to exchange what is missing. Shown at the foot of the sidebar and in
// the account menu (the phone's way in).
import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Icon } from './icons';
import { localSyncEngine } from './local-sync';
import './sync-now.css';

type Signal = { get: () => { status: string; error: string; at?: number }; subscribe: (fn: () => void) => () => void };

export function ago(at: number, now = Date.now()) {
  if (!at) return 'not yet';
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return new Date(at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Cloud sync for a signed-in account. */
export function CloudSyncNow({ signal, onSync, compact = false }: { signal: Signal; onSync: () => Promise<unknown> | void; compact?: boolean }) {
  const state = useSyncExternalStore(signal.subscribe, signal.get, signal.get);
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick(v => v + 1), 30000); return () => clearInterval(t); }, []);
  const syncing = state.status === 'Syncing…' || state.status === 'Connecting…';
  const ok = state.status === 'Synced' && !state.error;
  const label = state.error ? 'Not synced' : ok ? 'Synced' : syncing ? 'Syncing…' : 'Changes waiting';
  return <div className={`sync-now${compact ? ' is-compact' : ''}`} data-state={state.error ? 'error' : ok ? 'ok' : 'pending'}>
    <div className="sync-now-line"><Icon name={ok ? 'check' : 'refresh'} size={14} /><span>{label}</span><small>{state.at ? ago(state.at) : ''}</small></div>
    {state.error && <p className="sync-now-error">{state.error}</p>}
    <button type="button" disabled={syncing} onClick={() => void onSync()}><Icon name="refresh" size={14} />{syncing ? 'Syncing…' : 'Sync now'}</button>
  </div>;
}

/** Local sync for a device-only workspace shared with paired devices. */
export function DeviceSyncNow({ compact = false }: { compact?: boolean }) {
  const [busy, setBusy] = useState(false), [note, setNote] = useState(''), [at, setAt] = useState(0);
  const run = async () => {
    const engine = localSyncEngine(); if (!engine) { setNote('Turn on local sync in Settings first.'); return; }
    setBusy(true); setNote('');
    try { const n = await engine.resyncAll(); setAt(Date.now()); setNote(n ? `Asked ${n} device${n === 1 ? '' : 's'} for changes.` : 'No paired device is reachable right now.'); }
    catch (e) { setNote(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  return <div className={`sync-now${compact ? ' is-compact' : ''}`} data-state="ok">
    <div className="sync-now-line"><Icon name="refresh" size={14} /><span>Your devices</span><small>{at ? ago(at) : ''}</small></div>
    {note && <p className="sync-now-note">{note}</p>}
    <button type="button" disabled={busy} onClick={() => void run()}><Icon name="refresh" size={14} />{busy ? 'Syncing…' : 'Sync now'}</button>
  </div>;
}
