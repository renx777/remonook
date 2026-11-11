// The focus timer in the top bar: while a Dashboard focus timer is running (or paused part-way),
// a small pill shows its time on every page. Clicking it offers Pause, +5 min and Stop.
import React, { useEffect, useRef, useState } from 'react';
import type { Workspace } from './data';
import { dashboard, timerRemaining, timerDuration, updateWidget, finishTimer } from './dashboard.mjs';
import { Icon } from './icons';
import './dashboard.css';

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const LABEL: Record<string, string> = { focus: 'Focus', short: 'Break', long: 'Break' };

/** The focus timer worth showing: a running one first, else one paused part-way. */
export function activeTimer(doc: Workspace, now = Date.now()) {
  const widgets = Object.values((dashboard(doc) as any).widgets || {}).filter((w: any) => w.kind === 'focus' && !w.removed && w.timer) as any[];
  const running = widgets.find(w => w.timer.running);
  if (running) return running;
  return widgets.find(w => { const r = timerRemaining(w, now); return r > 0 && r < w.timer.duration; }) || null;
}

export function FocusPill({ doc, disabled, onChange, onOpen }: { doc: Workspace; disabled: boolean; onChange: (update: (doc: Workspace) => Workspace) => void; onOpen: () => void }) {
  const [now, setNow] = useState(Date.now()), [open, setOpen] = useState(false), box = useRef<HTMLDivElement>(null);
  const widget = activeTimer(doc, now), running = !!widget?.timer?.running;
  useEffect(() => { if (!running) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [running]);
  const remaining = widget ? timerRemaining(widget, now) : 0;
  // The timer ends here too when the Dashboard is not open.
  useEffect(() => { if (widget && running && remaining === 0 && !disabled) onChange(d => finishTimer(d, widget.id)); }, [widget?.id, running, remaining, disabled]);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent | KeyboardEvent) => { if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', close);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', close); };
  }, [open]);
  if (!widget) return null;
  const timer = widget.timer, mode = timer.mode || 'focus', label = running ? LABEL[mode] || 'Focus' : 'Paused';
  const update = (patch: any) => onChange(d => updateWidget(d, widget.id, { timer: { ...timer, ...patch } }));
  const pause = () => running ? update({ running: false, remaining, endsAt: 0 }) : update({ running: true, endsAt: Date.now() + remaining * 1000 });
  const extend = () => { const add = Math.min(300, 7200 - timer.duration); if (add <= 0) return; running ? update({ endsAt: timer.endsAt + add * 1000, duration: timer.duration + add }) : update({ remaining: remaining + add, duration: timer.duration + add }); };
  const stop = () => { const duration = timerDuration(widget, mode); update({ running: false, endsAt: 0, remaining: duration, duration, cycle: crypto.randomUUID() }); setOpen(false); };
  const done = 1 - remaining / Math.max(1, timer.duration);
  return <div className="focus-pill-wrap" ref={box}>
    <button className={`focus-pill is-${running ? (mode === 'focus' ? 'focus' : 'break') : 'paused'}`} aria-expanded={open} aria-label={`${label} timer, ${fmt(remaining)} left. Open timer`} onClick={() => setOpen(v => !v)}>
      {running ? <span className="focus-pill-dot" aria-hidden="true" /> : <Icon name="pause" size={12} />}{label} <span className="focus-pill-time">{fmt(remaining)}</span>
    </button>
    {open && <div className="focus-pill-pop" role="dialog" aria-label="Focus timer">
      <div className="focus-pill-kind">{mode === 'focus' ? 'Focus' : mode === 'short' ? 'Short break' : 'Long break'}{running ? '' : ' · paused'}</div>
      <div className="focus-pill-big" role="timer">{fmt(remaining)}</div>
      <div className="focus-pill-bar" role="img" aria-label={`${Math.round(done * 100)} percent done`}><span style={{ width: `${done * 100}%` }} /></div>
      <div className="focus-pill-actions">
        <button className="primary" disabled={disabled} onClick={pause}><Icon name={running ? 'pause' : 'play'} size={14} />{running ? 'Pause' : 'Resume'}</button>
        <button disabled={disabled || timer.duration >= 7200} onClick={extend}>+5 min</button>
        <button disabled={disabled} onClick={stop}>Stop</button>
      </div>
      <button className="focus-pill-link" onClick={() => { setOpen(false); onOpen(); }}>Open in Dashboard</button>
    </div>}
  </div>;
}
