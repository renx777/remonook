// The top of Today (the Dashboard): what is on today, before your widgets. Reminders that are
// due or overdue (check them off), notes and tasks dated today, and study cards due. Each block
// shows only when it has something; with nothing at all, one quiet line says so.
import React, { useMemo } from 'react';
import type { Workspace } from './data';
import { Icon } from './icons';
import { calendarEvents, upcomingEvents, reminderWhen, completeCalendarEvent } from './calendar-events.mjs';
import { dueCards } from './study.mjs';
import './today-summary.css';

const plain = (t: string) => String(t || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

export function TodaySummary({ doc, today, disabled, change, onCalendar, onStudy, onTask }: { doc: Workspace; today: string; disabled: boolean; change: (update: (doc: Workspace) => Workspace) => void; onCalendar: (date: string) => void; onStudy: () => void; onTask: (id: string) => void }) {
  const due = useMemo(() => upcomingEvents(calendarEvents(doc), today).filter((e: any) => e.days <= 0), [doc.web.calendarEvents, today]);
  const dated = useMemo(() => doc.tables.bullets.filter(n => n.dueDate === today && plain(n.text)), [doc.tables.bullets, today]);
  const open = dated.filter(n => n.taskState !== 'DONE'), finished = dated.length - open.length;
  const cards = useMemo(() => { try { return dueCards(doc, null, Date.now()).length; } catch { return 0; } }, [doc.tables.cards, doc.tables.decks, today]);
  if (!due.length && !dated.length && !cards) return <p className="today-empty"><Icon name="check" size={15} />Nothing due today.</p>;
  return <div className="today-summary" aria-label="Today">
    {due.length > 0 && <section className="today-card is-due">
      <h2>Due <span>{due.length}</span></h2>
      <ul>{due.map((e: any) => <li key={e.key} className={e.days < 0 ? 'is-late' : ''}>
        <button type="button" className="today-check" aria-label={`Mark ${e.title} done`} disabled={disabled} onClick={() => change(d => completeCalendarEvent(d, e.id, e.occurrenceDate))} />
        <button type="button" className="today-open" onClick={() => onCalendar(e.occurrenceDate)}><span>{e.title}</span><small>{reminderWhen(e)}</small></button>
      </li>)}</ul>
    </section>}
    {dated.length > 0 && <section className="today-card">
      <h2>On today <span>{finished ? `${finished} of ${dated.length} done` : dated.length}</span></h2>
      <ul>{open.slice(0, 6).map(n => <li key={n.id}>
        {n.taskState === 'TODO' ? <button type="button" className="today-check" aria-label={`Complete ${plain(n.text)}`} disabled={disabled} onClick={() => onTask(n.id)} /> : <span className="today-dot" aria-hidden="true" />}
        <button type="button" className="today-open" onClick={() => onCalendar(today)}><span>{plain(n.text)}</span></button>
      </li>)}{open.length > 6 && <li><button type="button" className="today-more" onClick={() => onCalendar(today)}>{open.length - 6} more in Calendar</button></li>}{!open.length && <li className="today-all-done">All done for today.</li>}</ul>
    </section>}
    {cards > 0 && <section className="today-card is-study">
      <h2>Study</h2>
      <p><strong>{cards}</strong> {cards === 1 ? 'card is' : 'cards are'} due for review.</p>
      <button type="button" className="today-start" onClick={onStudy}>Start review</button>
    </section>}
  </div>;
}
