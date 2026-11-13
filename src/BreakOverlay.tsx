// The break screen: while a Pomodoro break runs, it covers the app (a modal dialog, so nothing
// behind it can be clicked or typed into) and shows what you did today. It closes on its own
// when the break ends; "End break early" is there for when something cannot wait.
import React, { useEffect, useMemo, useState } from 'react';
import type { Workspace } from './data';
import { runningBreak, todayStats, dayBaseline, endTimer } from './focus-break.mjs';
import { updateWidget, dashboard } from './dashboard.mjs';
import './break-overlay.css';

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** Records today's starting bullets as soon as the workspace opens, so "bullets added" counts from
 the first use of the day rather than from the first break. */
export function useDayBaseline(doc: Workspace | null, storageKey: string) {
  useEffect(() => { if (doc) dayBaseline(storageKey, doc.tables.bullets.map(n => n.id)); }, [!!doc, storageKey]);
}

export function BreakOverlay({ doc, storageKey, disabled, onChange }: { doc: Workspace; storageKey: string; disabled: boolean; onChange: (update: (doc: Workspace) => Workspace) => void }) {
  const [now, setNow] = useState(Date.now());
  const brk = runningBreak(doc, now);
  useEffect(() => { if (!brk) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [!!brk]);
  // The break also ends here when the Dashboard and top bar timer are not mounted.
  useEffect(() => {
    const due = Object.values((dashboard(doc) as any).widgets || {}).find((w: any) => w?.kind === 'focus' && w.timer?.running && w.timer.mode !== 'focus' && w.timer.endsAt <= now) as any;
    if (due && !disabled) onChange(d => endTimer(d, due.id, now));
  }, [now, disabled]);
  // Present only during a break, opened as a modal so the app behind cannot be used.
  const open = (d: HTMLDialogElement | null) => { if (d && !d.open) { if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', ''); } };
  const stats = useMemo(() => brk ? todayStats(doc, { baseline: dayBaseline(storageKey, doc.tables.bullets.map(n => n.id)), now }) : null, [!!brk, doc, storageKey]);
  const left = brk ? Math.max(0, Math.ceil((brk.endsAt - now) / 1000)) : 0;
  const back = brk ? new Date(brk.endsAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '';
  const endEarly = () => {
    if (!brk || disabled || !window.confirm('End the break early and go back to work?')) return;
    const t = brk.widget.timer;
    // Ending it now: the break's time is up, which hands the timer back to focus.
    onChange(d => endTimer(updateWidget(d, brk.widget.id, { timer: { ...t, endsAt: Date.now() - 1 } }), brk.widget.id));
  };
  const tiles: [string, string | number, string?][] = stats ? [
    ['Focus sessions', stats.focusSessions, stats.focusMinutes ? `${stats.focusMinutes} min focused` : undefined],
    ...(stats.bullets !== null ? [['Bullets added', stats.bullets] as [string, number]] : []),
    ['Cards reviewed', stats.cards],
    ['Pages read', stats.pages],
    ['Articles saved', stats.saved],
    ...(stats.tasks ? [['Tasks done', `${stats.tasksDone} of ${stats.tasks}`] as [string, string]] : []),
  ] : [];
  if (!brk || !stats) return null;
  return <dialog ref={open} className="break-overlay" aria-label="Break time" onCancel={e => e.preventDefault()}>
    <div className="break-card">
      <p className="break-kind">{brk.mode === 'long' ? 'Long break' : 'Short break'}</p>
      <p className="break-time" role="timer" aria-live="off">{fmt(left)}</p>
      <p className="break-note">Step away from the screen. RemoNook opens again at {back}.</p>
      <div className="break-progress" role="img" aria-label={`${Math.round((1 - left / Math.max(1, brk.duration)) * 100)} percent of the break done`}><span style={{ width: `${(1 - left / Math.max(1, brk.duration)) * 100}%` }} /></div>
      <h2>Today so far</h2>
      <div className="break-stats">{tiles.map(([label, value, hint]) => <div key={label} className="break-tile"><strong>{value}</strong><span>{label}</span>{hint && <small>{hint}</small>}</div>)}</div>
      <button type="button" className="break-skip" disabled={disabled} onClick={endEarly}>End break early</button>
    </div>
  </dialog>;
}
