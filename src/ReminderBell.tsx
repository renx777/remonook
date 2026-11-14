// The reminders bell in the top bar. It replaces the reminder chips, which made the top bar grow
// a second row on phones. The bell shows how many reminders are due (today or overdue) and
// pulses until you open it; opening it lists what is due and what is coming, each with Done and
// Open. With reduced motion it shows a steady dot instead of pulsing.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Workspace } from './data';
import { Icon } from './icons';
import { calendarEvents, upcomingEvents, reminderWhen, completeCalendarEvent } from './calendar-events.mjs';
import { useReminderClock } from './CalendarReminders';
import { useBackClose } from './back-stack';
import './reminder-bell.css';

const SEEN = 'remo-reminders-seen';
const readSeen = (): Set<string> => { try { return new Set(JSON.parse(localStorage.getItem(SEEN) || '[]')); } catch { return new Set(); } };
const writeSeen = (keys: string[]) => { try { localStorage.setItem(SEEN, JSON.stringify(keys.slice(-200))); } catch { /* storage unavailable */ } };

/** Due now: today or overdue. Everything else from upcomingEvents is "coming up". */
export function splitReminders(items: any[]) {
  return { due: items.filter(e => e.days <= 0), coming: items.filter(e => e.days > 0) };
}

export function ReminderBell({ doc, disabled, onChange, onOpen, onManage }: { doc: Workspace; disabled: boolean; onChange: (update: (doc: Workspace) => Workspace) => void; onOpen: (id: string, date: string) => void; onManage: () => void }) {
  const today = useReminderClock();
  const items = useMemo(() => upcomingEvents(calendarEvents(doc), today), [doc.web.calendarEvents, today]);
  const { due, coming } = splitReminders(items);
  const [open, setOpen] = useState(false), [seen, setSeen] = useState(readSeen), box = useRef<HTMLDivElement>(null);
  const unseen = due.filter((e: any) => !seen.has(e.key)).length;
  useBackClose(open, () => setOpen(false));
  // Opening the bell marks what is due now as seen, so it stops pulsing until something new is due.
  useEffect(() => { if (!open || !due.length) return; const next = new Set(seen); let changed = false; for (const e of due) if (!next.has(e.key)) { next.add(e.key); changed = true; } if (changed) { setSeen(next); writeSeen([...next]); } }, [open, due.map((e: any) => e.key).join('|')]);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  const label = due.length ? `Reminders, ${due.length} due${unseen ? ', new' : ''}` : items.length ? `Reminders, ${items.length} coming up` : 'Reminders';
  const row = (e: any) => <li key={e.key} className={e.days < 0 ? 'is-late' : e.days === 0 ? 'is-today' : ''}>
    <button type="button" className="reminder-bell-open" onClick={() => { setOpen(false); onOpen(e.id, e.occurrenceDate); }}><span>{e.title}</span><small>{reminderWhen(e)}{e.time ? ` · ${e.time}` : ''}</small></button>
    {e.days <= 0 && <button type="button" className="reminder-bell-done" aria-label={`Mark ${e.title} done`} title="Done" disabled={disabled} onClick={() => onChange(d => completeCalendarEvent(d, e.id, e.occurrenceDate))}><Icon name="check" size={15} /></button>}
  </li>;
  return <div className="reminder-bell" ref={box}>
    <button type="button" className={`icon-button reminder-bell-button${unseen ? ' is-new' : ''}${due.length ? ' has-due' : ''}`} aria-label={label} title={label} aria-expanded={open} onClick={() => setOpen(v => !v)}>
      <Icon name="bell" size={18} />
      {due.length > 0 && <span className="reminder-bell-count" aria-hidden="true">{due.length > 9 ? '9+' : due.length}</span>}
    </button>
    {open && <div className="reminder-bell-pop" role="dialog" aria-label="Reminders">
      {due.length > 0 && <section><h3>Due</h3><ul>{due.map(row)}</ul></section>}
      {coming.length > 0 && <section><h3>Coming up</h3><ul>{coming.slice(0, 8).map(row)}</ul></section>}
      {!items.length && <p className="reminder-bell-empty">Nothing due. Bills, birthdays, renewals and other reminders you add in Calendar show here.</p>}
      <button type="button" className="reminder-bell-manage" onClick={() => { setOpen(false); onManage(); }}>All reminders in Calendar</button>
    </div>}
  </div>;
}
