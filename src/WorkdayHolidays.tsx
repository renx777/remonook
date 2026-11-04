import { useEffect, useState } from "react";
import type { Workspace } from "./data";
import { validEventDate } from "./calendar-events.mjs";
import { updateWorkdaysV2, scheduled, weekday } from "./workdays-v2.mjs";
import { longDate } from "./workdays-stats";
import { Icon } from "./icons";

type Change = (fn: (d: Workspace) => Workspace) => void;

/** Rename, move or remove one holiday; `next` null removes it. */
export function editHoliday(
  doc: Workspace,
  date: string,
  next: { date: string; name: string } | null,
) {
  return updateWorkdaysV2(doc, (w: any) => {
    const holidays = { ...w.holidays };
    if (next) {
      const name = next.name.trim();
      if (!validEventDate(next.date)) throw Error("Choose a valid date.");
      if (!name || name.length > 160) throw Error("Give the holiday a name under 160 characters.");
      if (next.date !== date && holidays[next.date])
        throw Error(`${longDate(next.date, { day: "numeric", month: "short" })} is already “${holidays[next.date]}”.`);
      delete holidays[date];
      holidays[next.date] = name;
    } else delete holidays[date];
    return { ...w, holidays };
  });
}

function HolidayRow({
  w,
  date,
  name,
  disabled,
  change,
}: {
  w: any;
  date: string;
  name: string;
  disabled: boolean;
  change: (fn: (d: Workspace) => Workspace) => boolean;
}) {
  const [draft, setDraft] = useState(name);
  useEffect(() => setDraft(name), [name]);
  const workday = scheduled(w, date),
    weekend = weekday(date) === 0 || weekday(date) === 6;
  const saveName = () => {
    if (draft.trim() === name) return;
    if (!change((d) => editHoliday(d, date, { date, name: draft }))) setDraft(name);
  };
  return (
    <li className="wd2-holiday">
      <input
        type="date"
        aria-label={`Date of ${name}`}
        value={date}
        disabled={disabled}
        onChange={(e) => {
          if (e.target.value && e.target.value !== date)
            change((d) => editHoliday(d, date, { date: e.target.value, name }));
        }}
      />
      <span className="wd2-holiday-day">
        {longDate(date, { weekday: "short" })}
        {!workday && <small>{weekend ? "weekend" : "day off"}</small>}
      </span>
      <input
        aria-label={`Name of holiday on ${date}`}
        value={draft}
        maxLength={160}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={saveName}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setDraft(name);
        }}
      />
      <button
        className="icon-button"
        aria-label={`Remove ${name}`}
        title="Remove holiday"
        disabled={disabled}
        onClick={() => change((d) => editHoliday(d, date, null))}
      >
        <Icon name="trash" size={15} />
      </button>
    </li>
  );
}

export function WorkdayHolidays({
  w,
  anchor,
  disabled,
  onAnchor,
  onChange,
  onImport,
}: {
  w: any;
  anchor: string;
  disabled: boolean;
  onAnchor: (date: string) => void;
  onChange: Change;
  onImport: () => void;
}) {
  const year = anchor.slice(0, 4),
    [error, setError] = useState(""),
    [newDate, setNewDate] = useState(""),
    [newName, setNewName] = useState("");
  const list = (Object.entries(w.holidays) as [string, string][])
      .filter(([d]) => d.startsWith(year))
      .sort(([a], [b]) => a.localeCompare(b)),
    onWorkdays = list.filter(([d]) => scheduled(w, d)).length,
    otherYears = Object.keys(w.holidays).filter((d) => !d.startsWith(year)).length;
  const change = (fn: (d: Workspace) => Workspace) => {
    try {
      onChange(fn);
      setError("");
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  };
  return (
    <section className="wd2-holidays" aria-label="Holidays">
      <div className="wd2-holidays-head">
        <span className="wd2-stepper">
          <button className="icon-button" aria-label="Previous year" onClick={() => onAnchor(`${+year - 1}-01-01`)}>
            <Icon name="back" size={16} />
          </button>
          <b>{year}</b>
          <button className="icon-button" aria-label="Next year" onClick={() => onAnchor(`${+year + 1}-01-01`)}>
            <Icon name="forward" size={16} />
          </button>
        </span>
        <p className="wd2-muted">
          {list.length
            ? `${list.length} ${list.length === 1 ? "holiday" : "holidays"} · ${onWorkdays} on workdays, which don't count towards targets`
            : "No holidays this year."}
          {otherYears ? ` · ${otherYears} in other years` : ""}
        </p>
        <button className="wd2-import-button" onClick={onImport} disabled={disabled}>
          <Icon name="upload" size={15} />
          Import list
        </button>
      </div>
      {list.length > 0 && (
        <ul className="wd2-holiday-list">
          {list.map(([date, name]) => (
            <HolidayRow key={date} w={w} date={date} name={name} disabled={disabled} change={change} />
          ))}
        </ul>
      )}
      <form
        className="wd2-holiday wd2-holiday-add"
        onSubmit={(e) => {
          e.preventDefault();
          if (!newDate || !newName.trim()) {
            setError("Choose a date and a name.");
            return;
          }
          if (w.holidays[newDate]) {
            setError(`${longDate(newDate, { day: "numeric", month: "short" })} is already “${w.holidays[newDate]}”.`);
            return;
          }
          if (change((d) => editHoliday(d, newDate, { date: newDate, name: newName }))) {
            setNewDate("");
            setNewName("");
          }
        }}
      >
        <input type="date" aria-label="New holiday date" value={newDate} disabled={disabled} onChange={(e) => setNewDate(e.target.value)} />
        <span className="wd2-holiday-day">{newDate ? longDate(newDate, { weekday: "short" }) : ""}</span>
        <input aria-label="New holiday name" placeholder="Holiday name" maxLength={160} value={newName} disabled={disabled} onChange={(e) => setNewName(e.target.value)} />
        <button type="submit" className="wd2-primary" disabled={disabled}>
          Add
        </button>
      </form>
      {error && <p role="alert" className="wd2-warning">{error}</p>}
    </section>
  );
}
