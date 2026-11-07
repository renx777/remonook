import { useEffect, useMemo, useState } from "react";
import type { Workspace } from "./data";
import { Icon } from "./icons";
import {
  calendarEvents,
  eventKinds,
  eventsOnDate,
  upcomingEvents,
  reminderWhen,
  completeCalendarEvent,
} from "./calendar-events.mjs";
import { useReminderClock, type ReminderTarget } from "./CalendarReminders";
import { workdaysV2, periodRange, dayAfter } from "./workdays-v2.mjs";
import {
  dayInfo,
  splitFor,
  primaryTarget,
  statusFor,
  fmtDays,
  longDate,
  monthGrid,
} from "./workdays-stats";
import { SplitBar } from "./WorkdaysOverview";
import "./calendar-v2.css";

const kindFor = (id: string) => eventKinds.find((k) => k.id === id) || eventKinds.at(-1)!;

function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);
  return now;
}

const hhmm = (d: Date) =>
  String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");

export function MiniMonth({
  doc,
  date,
  today,
  workdays,
  onSelectDate,
}: {
  doc: Workspace;
  date: string;
  today: string;
  workdays: boolean;
  onSelectDate: (date: string) => void;
}) {
  const [view, setView] = useState(date.slice(0, 7) + "-01");
  useEffect(() => setView(date.slice(0, 7) + "-01"), [date.slice(0, 7)]);
  const events = calendarEvents(doc),
    w = useMemo(() => workdaysV2(doc, date), [doc.web.workdays]),
    month = periodRange(view, "month"),
    title = longDate(view, { month: "long", year: "numeric" });
  return (
    <section className="cal2-month" aria-label="Month">
      <div className="cal2-month-head">
        <h2>{title}</h2>
        <button className="icon-button" aria-label="Previous month" onClick={() => setView(dayAfter(month.start, -1).slice(0, 7) + "-01")}>
          <Icon name="back" size={16} />
        </button>
        <button className="icon-button" aria-label="Next month" onClick={() => setView(dayAfter(month.end).slice(0, 7) + "-01")}>
          <Icon name="forward" size={16} />
        </button>
      </div>
      <div className="cal2-grid" role="grid" aria-label={title}>
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <span key={i} className="cal2-wd" aria-hidden="true">
            {d}
          </span>
        ))}
        {monthGrid(view).map((d) => {
          const inMonth = d.slice(0, 7) === view.slice(0, 7),
            count = eventsOnDate(events, d).length,
            info = workdays ? dayInfo(w, d, today) : null,
            set = !!info?.modes.some(Boolean),
            [a, b] = info?.modes || [];
          return (
            <button
              key={d}
              role="gridcell"
              aria-pressed={d === date}
              aria-label={
                longDate(d, { weekday: "long", day: "numeric", month: "long" }) +
                (count ? `, ${count} reminder${count === 1 ? "" : "s"}` : "") +
                (info && (set || info.holiday) ? `, ${info.label}` : "")
              }
              className={[
                "cal2-day",
                inMonth ? "" : "out",
                d === today ? "today" : "",
                d === date ? "selected" : "",
                count ? "has-reminder" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => onSelectDate(d)}
            >
              <span className="cal2-num">
                {+d.slice(8)}
                {count > 0 && <i className="cal2-dot" aria-hidden="true" />}
              </span>
              <span
                aria-hidden="true"
                className={"cal2-mark" + (set ? (info!.planned ? " planned" : " recorded") : "") + (info?.holiday ? " holiday" : "")}
                style={
                  set
                    ? ({ ["--a" as any]: `var(--wd-${a || b})`, ["--b" as any]: `var(--wd-${b || a})` } as any)
                    : undefined
                }
              />
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function WorkdaysLine({
  doc,
  date,
  today,
  onOpen,
}: {
  doc: Workspace;
  date: string;
  today: string;
  onOpen: () => void;
}) {
  const w = useMemo(() => workdaysV2(doc, date), [doc.web.workdays]),
    month = periodRange(date, "month"),
    split = useMemo(() => splitFor(w, month.start, month.end, today), [w, month.start, today]),
    rule = primaryTarget(w),
    status = statusFor(split, rule, today),
    name = longDate(month.start, { month: "long" });
  return (
    <button
      className="cal2-work"
      onClick={onOpen}
      aria-label={`Workdays for ${name}: ${split.share ?? 0}% office${rule ? `, target ${rule.value}%` : ""}${status ? `, ${status.text}` : ""}. Office ${fmtDays(split.office)}, Home ${fmtDays(split.home)}, Leave ${fmtDays(split.leave)} days${split.planned ? " including plans" : ""}. Open Workdays`}
    >
      <span className="cal2-work-top">
        <span className="cal2-label">Workdays · {name}</span>
        <span className="cal2-work-share">
          <b>{split.share === null ? "–" : split.share + "%"}</b> office
          {rule && ` · target ${rule.value}%`}
          {status && (status.tone === "met" || status.tone === "track") && <span aria-hidden="true"> ✓</span>}
          {status && (status.tone === "below" || status.tone === "risk") && <span className="cal2-risk"> · {status.text}</span>}
        </span>
      </span>
      <SplitBar split={split} target={rule?.value} />
      <span className="cal2-work-counts">
        {fmtDays(split.office)} office · {fmtDays(split.home)} home · {fmtDays(split.leave)} leave
        {split.planned > 0 && <span> · incl. plans</span>}
        {split.pending.length > 0 && <span> · {split.pending.length} to confirm</span>}
        <Icon name="forward" size={13} />
      </span>
    </button>
  );
}

type AgendaProps = {
  doc: Workspace;
  date: string;
  disabled: boolean;
  onSelectDate: (date: string) => void;
  onChange: (doc: Workspace) => void;
  onEdit: (target: ReminderTarget) => void;
};

function groupTitle(occurrence: string, days: number, today: string) {
  if (days < 0) return "Overdue";
  const weekEnd = dayAfter(today, 6 - new Date(today + "T12:00:00").getDay());
  if (occurrence <= weekEnd) return "This week";
  if (occurrence.slice(0, 7) === today.slice(0, 7))
    return "Later in " + longDate(occurrence, { month: "long" });
  return longDate(occurrence, {
    month: "long",
    year: occurrence.slice(0, 4) === today.slice(0, 4) ? undefined : "numeric",
  });
}

export function CalendarAgenda({ doc, date, disabled, onSelectDate, onChange, onEdit }: AgendaProps) {
  const [all, setAll] = useState(false),
    today = useReminderClock(),
    now = useNow(),
    events = calendarEvents(doc),
    day = useMemo(() => eventsOnDate(events, date), [events, date]),
    upcoming = useMemo(() => upcomingEvents(events, today), [events, today]);
  const countdowns = upcoming.filter((e) => e.countdown && e.days > 0).slice(0, 3),
    later = upcoming.filter((e) => e.occurrenceDate !== date && !(e.countdown && e.days > 0)).slice(0, 10),
    groups: { title: string; items: typeof later }[] = [];
  for (const e of later) {
    const title = groupTitle(e.occurrenceDate, e.days, today),
      last = groups.at(-1);
    if (last?.title === title) last.items.push(e);
    else groups.push({ title, items: [e] });
  }
  const nowAt = date === today ? hhmm(now) : null,
    nowIndex = nowAt ? day.filter((e) => !e.time || e.time <= nowAt).length : -1,
    dayTitle =
      date === today
        ? "Today"
        : date === dayAfter(today)
          ? "Tomorrow"
          : longDate(date, { weekday: "short", day: "numeric", month: "short" });
  const nowLine = (
    <div className="cal2-now" key="now" aria-label={`Now, ${nowAt}`}>
      <span>{nowAt}</span>
      <i aria-hidden="true" />
    </div>
  );
  return (
    <section className="cal2-agenda" aria-label="Calendar reminders">
      <div className="cal2-agenda-head">
        <h2>Agenda</h2>
        <button
          className="icon-button"
          aria-expanded={all}
          title={all ? "Show the selected day" : "Show all reminders"}
          onClick={() => setAll((v) => !v)}
        >
          <Icon name={all ? "calendar" : "menu"} size={17} />
          <span className="cal2-sr">
            {all ? "Selected day" : "All reminders"}
            {events.length ? ` (${events.length})` : ""}
          </span>
        </button>
        <button className="cal2-add" disabled={disabled} title="Add reminder" onClick={() => onEdit({ date })}>
          <Icon name="plus" size={17} />
          <span className="cal2-sr">Add reminder</span>
        </button>
      </div>
      {all ? (
        <div className="cal2-group cal2-day-group">
          <h3>
            All reminders <span>· {events.length}</span>
          </h3>
          {events.length ? (
            events
              .slice()
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((e) => (
                <div className="cal2-row" key={e.id}>
                  <button className="cal2-badge" onClick={() => onSelectDate(e.date)} aria-label={`Open ${e.date}`}>
                    <small>{longDate(e.date, { month: "short" })}</small>
                    <b>{+e.date.slice(8)}</b>
                  </button>
                  <button className="cal2-row-main" onClick={() => onEdit({ id: e.id, date: e.date })}>
                    <span>{e.title}</span>
                    <small>
                      {kindFor(e.kind).name}
                      {e.repeat !== "none" ? ` · ${e.repeat}` : ""}
                      {e.time ? " · " + e.time : ""}
                    </small>
                  </button>
                  <button className="icon-button cal2-edit" aria-label={`Edit ${e.title}`} disabled={disabled} onClick={() => onEdit({ id: e.id, date: e.date })}>
                    <Icon name="edit" size={14} />
                  </button>
                </div>
              ))
          ) : (
            <p className="cal2-empty">No reminders yet. Add a birthday, exam deadline or bill payment.</p>
          )}
        </div>
      ) : (
        <>
          <div className="cal2-group cal2-day-group">
            <h3>
              {dayTitle} <span>· {day.length}</span>
            </h3>
            {day.length === 0 && (
              <>
                {nowAt && nowLine}
                <p className="cal2-empty">Nothing scheduled.</p>
              </>
            )}
            {day.map((e, i) => {
              const done = e.completed.includes(date);
              return [
                i === nowIndex && nowAt ? nowLine : null,
                <div className={"cal2-row" + (done ? " is-complete" : "")} key={e.id}>
                  <span className="cal2-time">{e.time || "All day"}</span>
                  <button className="cal2-row-main" onClick={() => onEdit({ id: e.id, date })}>
                    <span>{e.title}</span>
                    <small>
                      {kindFor(e.kind).name}
                      {e.repeat !== "none" ? ` · ${e.repeat}` : ""}
                    </small>
                  </button>
                  <button
                    className="cal2-done"
                    aria-label={`${done ? "Reopen" : "Complete"} ${e.title} on ${date}`}
                    aria-pressed={done}
                    disabled={disabled}
                    onClick={() => onChange(completeCalendarEvent(doc, e.id, date))}
                  >
                    {done && <Icon name="check" size={13} />}
                  </button>
                  <button className="icon-button cal2-edit" aria-label={`Edit ${e.title}`} disabled={disabled} onClick={() => onEdit({ id: e.id, date })}>
                    <Icon name="edit" size={14} />
                  </button>
                </div>,
              ];
            })}
            {nowAt && day.length > 0 && nowIndex === day.length && nowLine}
          </div>
          {groups.map((g) => (
            <div className="cal2-group cal2-later" key={g.title}>
              <h3>
                {g.title} <span>· {g.items.length}</span>
              </h3>
              {g.items.map((e) => (
                <button
                  className={"cal2-row cal2-upcoming" + (e.days < 0 ? " is-overdue" : "")}
                  key={e.key}
                  onClick={() => onSelectDate(e.occurrenceDate)}
                >
                  <span className="cal2-badge">
                    <small>{longDate(e.occurrenceDate, { weekday: "short" })}</small>
                    <b>{+e.occurrenceDate.slice(8)}</b>
                  </span>
                  <span className="cal2-row-main">
                    <span>{e.title}</span>
                    <small>
                      {kindFor(e.kind).name}
                      {e.time ? " · " + e.time : ""}
                    </small>
                  </span>
                  <span className="cal2-rel">{reminderWhen(e)}</span>
                </button>
              ))}
            </div>
          ))}
        </>
      )}
      {countdowns.length > 0 && (
        <div className="cal2-countdowns">
          {countdowns.map((e) => (
            <button key={e.key} onClick={() => onSelectDate(e.occurrenceDate)}>
              <b>{e.days}</b> {e.days === 1 ? "day" : "days"} to {e.title}
              <span> · {longDate(e.occurrenceDate, { day: "numeric", month: "short" })}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
