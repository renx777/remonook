// The Now bar: one strip for whatever needs you right now, replacing the reminders bell.
// - Phone: above the bottom navigation. A running focus session comes first (timer and Pause),
//   otherwise the most urgent due reminder (with Done, and "+N more"). Tap it for a sheet with the
//   timer controls, everything due, and what is coming up.
// - Desktop: at the foot of the sidebar, for due reminders (the focus timer has its top-bar pill).
// Nothing due and no timer: no strip. Hiding it (×) keeps it away until something new is due.
import React, { useEffect, useMemo, useState } from 'react';
import type { Workspace } from './data';
import { Icon } from './icons';
import { calendarEvents, upcomingEvents, reminderWhen, completeCalendarEvent } from './calendar-events.mjs';
import { useReminderClock } from './CalendarReminders';
import { activeTimer } from './FocusPill';
import { timerRemaining, timerDuration, updateWidget } from './dashboard.mjs';
import { useBackClose } from './back-stack';
import './now-bar.css';

const HIDDEN = 'remo-now-hidden';
const readHidden = (): string[] => { try { return JSON.parse(localStorage.getItem(HIDDEN) || '[]'); } catch { return []; } };
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

type Props = { doc: Workspace; disabled: boolean; onChange: (update: (doc: Workspace) => Workspace) => void; onOpen: (id: string, date: string) => void; onManage: () => void; placement: 'phone' | 'sidebar' };

export function NowBar({ doc, disabled, onChange, onOpen, onManage, placement }: Props) {
  const today = useReminderClock();
  const items = useMemo(() => upcomingEvents(calendarEvents(doc), today), [doc.web.calendarEvents, today]);
  const due = items.filter((e: any) => e.days <= 0), coming = items.filter((e: any) => e.days > 0);
  const [hidden, setHidden] = useState<string[]>(readHidden), [open, setOpen] = useState(false), [now, setNow] = useState(Date.now());
  const widget = placement === 'phone' ? activeTimer(doc, now) : null, running = !!widget?.timer?.running;
  useEffect(() => { if (!running) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [running]);
  useBackClose(open, () => setOpen(false));
  const visibleDue = due.filter((e: any) => !hidden.includes(e.key));
  const hide = () => { const next = [...new Set([...hidden, ...due.map((e: any) => e.key)])].slice(-200); setHidden(next); try { localStorage.setItem(HIDDEN, JSON.stringify(next)); } catch { /* storage unavailable */ } };
  const done = (e: any) => onChange(d => completeCalendarEvent(d, e.id, e.occurrenceDate));
  // Timer controls (the same as the top bar's focus pill).
  const timer = widget?.timer, mode = timer?.mode || 'focus', remaining = widget ? timerRemaining(widget, now) : 0;
  const update = (patch: any) => widget && onChange(d => updateWidget(d, widget.id, { timer: { ...timer, ...patch } }));
  const pause = () => running ? update({ running: false, remaining, endsAt: 0 }) : update({ running: true, endsAt: Date.now() + remaining * 1000 });
  const extend = () => { if (!timer) return; const add = Math.min(300, 7200 - timer.duration); if (add <= 0) return; running ? update({ endsAt: timer.endsAt + add * 1000, duration: timer.duration + add }) : update({ remaining: remaining + add, duration: timer.duration + add }); };
  const stop = () => { if (!widget) return; const duration = timerDuration(widget, mode); update({ running: false, endsAt: 0, remaining: duration, duration, cycle: crypto.randomUUID() }); };
  if (!widget && !visibleDue.length && !open) return null;

  const first = visibleDue[0];
  const strip = widget
    ? <div className={`now-strip is-timer${running ? '' : ' is-paused'}`}>
        <button type="button" className="now-strip-main" aria-expanded={open} onClick={() => setOpen(true)}><span className="now-dot" /><span className="now-text"><strong>{mode === 'focus' ? 'Focus' : 'Break'}{running ? '' : ' · paused'}</strong><small>{visibleDue.length ? `${visibleDue.length} reminder${visibleDue.length === 1 ? '' : 's'} due` : 'Tap for timer controls'}</small></span><span className="now-time">{fmt(remaining)}</span></button>
        <button type="button" className="now-action" aria-label={running ? 'Pause timer' : 'Resume timer'} disabled={disabled} onClick={pause}><Icon name={running ? 'pause' : 'play'} size={16} /></button>
      </div>
    : <div className={`now-strip is-due${first.days < 0 ? ' is-late' : ''}`}>
        <button type="button" className="now-strip-main" aria-expanded={open} onClick={() => setOpen(true)}><span className="now-dot" /><span className="now-text"><strong>{first.title}</strong><small>{reminderWhen(first)}{visibleDue.length > 1 ? ` · +${visibleDue.length - 1} more` : ''}</small></span></button>
        <button type="button" className="now-action now-done" aria-label={`Mark ${first.title} done`} disabled={disabled} onClick={() => done(first)}>Done</button>
        <button type="button" className="now-action now-hide" aria-label="Hide until something new is due" onClick={hide}><Icon name="close" size={14} /></button>
      </div>;

  const row = (e: any, check: boolean) => <li key={e.key} className={e.days < 0 ? 'is-late' : ''}>
    {check && <button type="button" className="now-check" aria-label={`Mark ${e.title} done`} disabled={disabled} onClick={() => done(e)} />}
    <button type="button" className="now-row-open" onClick={() => { setOpen(false); onOpen(e.id, e.occurrenceDate); }}><span>{e.title}</span><small>{reminderWhen(e)}</small></button>
  </li>;
  const sheet = open && <div className={`now-sheet-wrap is-${placement}`} onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}>
    <div className="now-sheet" role="dialog" aria-label="Now">
      {placement === 'phone' && <span className="now-grip" aria-hidden="true" />}
      {widget && <section className="now-timer">
        <div><span>{mode === 'focus' ? 'Focus' : mode === 'short' ? 'Short break' : 'Long break'}{running ? '' : ' · paused'}</span><strong role="timer">{fmt(remaining)}</strong></div>
        <button type="button" disabled={disabled} onClick={pause}>{running ? 'Pause' : 'Resume'}</button>
        <button type="button" disabled={disabled || (timer?.duration || 0) >= 7200} onClick={extend}>+5</button>
        <button type="button" disabled={disabled} onClick={stop}>Stop</button>
      </section>}
      {due.length > 0 && <section><h3>Due</h3><ul>{due.map((e: any) => row(e, true))}</ul></section>}
      {coming.length > 0 && <section><h3>Coming up</h3><ul>{coming.slice(0, 6).map((e: any) => row(e, false))}</ul></section>}
      {!due.length && !coming.length && !widget && <p className="now-empty">Nothing due.</p>}
      <button type="button" className="now-manage" onClick={() => { setOpen(false); onManage(); }}>All reminders in Calendar</button>
    </div>
  </div>;
  return <div className={`now-bar is-${placement}`}>{(widget || visibleDue.length > 0) && strip}{sheet}</div>;
}
