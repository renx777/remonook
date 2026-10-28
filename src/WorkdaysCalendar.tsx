import { useEffect, useMemo, useState } from "react";
import type { Workspace } from "./data";
import { LibraryDialog } from "./StudyFolders";
import { Icon } from "./icons";
import { FlowNumber, NumberGroup } from "./FlowNumber";
import { localDate, validEventDate } from "./calendar-events.mjs";
import {
  LEAVE_TYPES,
  workdays,
  enableWorkdays,
  updateWorkdays,
  dayAfter,
  monthStart,
  monthEnd,
  dateRange,
  weekday,
  dayState,
  policyOn,
  defaultPolicy,
  setWorkdays,
  workSummary,
  leaveSummary,
  saveWorkPolicy,
  parseHolidayText,
  holidayConflicts,
  importWorkHolidays,
} from "./workdays.mjs";
import "./workdays.css";

type Props = {
  doc: Workspace;
  date: string;
  disabled: boolean;
  hasNotes: (date: string) => boolean;
  hasReminder: (date: string) => boolean;
  onDate: (date: string) => void;
  onChange: (doc: Workspace) => void;
};
const dateLabel = (date: string) =>
  new Date(date + "T12:00:00").toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
const shortStatus = (s: string) =>
  s === "Leave" ? "Leave" : s === "Holiday" ? "Off" : s;
const runError = (e: unknown) =>
  e instanceof Error ? e.message : "Could not update Workdays.";
export function WorkdaysCalendar({
  doc,
  date,
  disabled,
  hasNotes,
  hasReminder,
  onDate,
  onChange,
}: Props) {
  const w = workdays(doc) as any;
  const [today, setToday] = useState(localDate),
    [selecting, setSelecting] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [dialog, setDialog] = useState(""),
    [detail, setDetail] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    const tick = () => setToday(localDate());
    const timer = setInterval(tick, 30000);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", tick);
    };
  }, []);
  useEffect(() => {
    setSelected([]);
    setSelecting(false);
  }, [date.slice(0, 7)]);
  const summary = useMemo(
    () => workSummary(w, validEventDate(date) ? date : today, today),
    [w, date, today],
  );
  const monthDates = useMemo(() => {
    if (!validEventDate(date)) return [];
    const first = monthStart(date);
    return dateRange(
      [dayAfter(first, -((weekday(first) + 6) % 7)), "1900-01-01"]
        .sort()
        .at(-1)!,
      [
        dayAfter(monthEnd(date), (7 - weekday(monthEnd(date))) % 7),
        "2199-12-31",
      ].sort()[0],
    );
  }, [date.slice(0, 7)]);
  const state = dayState(w, date, today),
    targets = selecting ? selected : [date];
  const change = (fn: () => Workspace) => {
    try {
      onChange(fn());
      setError("");
    } catch (e) {
      setError(runError(e));
    }
  };
  const mark = (status: string, extra = "") =>
    change(() => setWorkdays(doc, targets, status, extra, today));
  const shiftMonth = (n: number) => {
    const d = new Date(date + "T12:00:00Z");
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + n);
    const next = d.toISOString().slice(0, 10);
    if (validEventDate(next)) onDate(next);
  };
  return (
    <section
      className={`workdays ${w.enabled ? "is-enabled" : ""}`}
      aria-label="Workdays calendar"
    >
      <div className="wd-toolbar">
        <button
          className="wd-toggle"
          role="switch"
          aria-checked={w.enabled}
          aria-label="Workdays layer"
          disabled={disabled || !validEventDate(date)}
          onClick={() => change(() => enableWorkdays(doc, !w.enabled, date))}
        >
          <Icon name="calendar" size={15} />
          <span>Workdays</span>
          <span
            className={`wd-switch ${w.enabled ? "on" : ""}`}
            aria-hidden="true"
          />
        </button>
        {w.enabled && (
          <div className="wd-toolbar-actions">
            <div
              className="wd-view-switch"
              role="group"
              aria-label="Calendar view"
            >
              {["day", "month"].map((view) => (
                <button
                  key={view}
                  aria-pressed={w.view === view}
                  onClick={() =>
                    change(() => updateWorkdays(doc, { ...w, view }))
                  }
                >
                  {view === "day" ? "Day" : "Month"}
                </button>
              ))}
            </div>
            <button
              className="wd-tool"
              aria-label="Workday settings"
              title="Workday settings"
              onClick={() => setDialog("settings")}
            >
              <Icon name="settings" size={16} />
            </button>
          </div>
        )}
      </div>
      {w.enabled && validEventDate(date) && (
        <>
          <div className="wd-summary" aria-label="Monthly office goal">
            <div className="wd-summary-copy" key={date.slice(0, 7)}>
              <NumberGroup>
                <strong>
                  {!summary.eligible
                    ? "No eligible workdays"
                    : summary.met
                      ? "Office goal met"
                      : <><FlowNumber value={summary.completed} /> of <FlowNumber value={summary.target} /> office days</>}
                </strong>
                <span>
                  <FlowNumber value={summary.planned} /> planned
                  {summary.remaining
                    ? <> · <FlowNumber value={summary.remaining} /> still to plan</>
                    : summary.met
                      ? ""
                      : " · covered by plans"}
                </span>
              </NumberGroup>
            </div>
            <div
              className="wd-goal-track"
              role="progressbar"
              aria-label="Confirmed office days"
              aria-valuemin={0}
              aria-valuemax={Math.max(1, summary.target)}
              aria-valuenow={Math.min(
                summary.completed,
                Math.max(1, summary.target),
              )}
              aria-valuetext={`${summary.completed} confirmed, ${summary.planned} planned, target ${summary.target}`}
            >
              <span
                style={{
                  width: `${Math.min(100, (summary.completed / Math.max(1, summary.target)) * 100)}%`,
                }}
              />
              <i
                style={{
                  width: `${Math.min(100 - Math.min(100, (summary.completed / Math.max(1, summary.target)) * 100), (summary.planned / Math.max(1, summary.target)) * 100)}%`,
                }}
              />
            </div>
            <small>
              Confirmed + planned are shown separately ·{" "}
              {new Date(date + "T12:00:00").toLocaleDateString(undefined, {
                month: "short",
                year: "numeric",
              })}
            </small>
          </div>
          {w.view === "month" && (
            <div className="wd-month">
              <div className="wd-month-heading">
                <div className="wd-month-nav">
                  <button
                    className="wd-tool"
                    aria-label="Previous work month"
                    onClick={() => shiftMonth(-1)}
                  >
                    <Icon name="back" size={16} />
                  </button>
                  <strong>
                    {new Date(date + "T12:00:00").toLocaleDateString(
                      undefined,
                      { month: "long", year: "numeric" },
                    )}
                  </strong>
                  <button
                    className="wd-tool"
                    aria-label="Next work month"
                    onClick={() => shiftMonth(1)}
                  >
                    <Icon name="chevron" size={16} />
                  </button>
                </div>
                <div className="wd-month-controls">
                  <button
                    className="wd-text-button"
                    onClick={() => onDate(today)}
                  >
                    Today
                  </button>
                  <button
                    className="wd-text-button"
                    aria-pressed={selecting}
                    onClick={() => {
                      setSelecting(!selecting);
                      setSelected([]);
                    }}
                  >
                    {selecting ? "Done selecting" : "Select dates"}
                  </button>
                </div>
              </div>
              <div
                className="wd-grid"
                role="group"
                aria-label="Work month dates"
              >
                <div className="wd-weekdays" aria-hidden="true">
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
                    (d) => (
                      <span key={d}>{d}</span>
                    ),
                  )}
                </div>
                {monthDates.map((d) => {
                  const s = dayState(w, d, today),
                    p = policyOn(w, d);
                  const off = !p?.weekdays.includes(weekday(d));
                  const isSelected = selecting
                    ? selected.includes(d)
                    : d === date;
                  return (
                    <button
                      key={d}
                      data-date={d}
                      className={`wd-day ${d.slice(0, 7) !== date.slice(0, 7) ? "outside" : ""} ${off ? "nonwork" : ""} ${isSelected ? "selected" : ""} ${d === today ? "today" : ""}`}
                      aria-label={`${dateLabel(d)}${s.status ? `, ${s.planned ? (s.pending ? "Unconfirmed plan: " : "Planned ") : "Confirmed "}${s.status}` : ""}${s.holiday ? `: ${s.holiday}` : ""}${hasNotes(d) ? ", has notes" : ""}${hasReminder(d) ? ", has reminders" : ""}`}
                      aria-pressed={isSelected}
                      onClick={() => {
                        if (selecting)
                          setSelected((v) =>
                            v.includes(d)
                              ? v.filter((x) => x !== d)
                              : [...v, d],
                          );
                        else onDate(d);
                      }}
                    >
                      <span className="wd-day-number">
                        {Number(d.slice(-2))}
                      </span>
                      {s.status && (
                        <span
                          className={`wd-badge status-${s.status.toLowerCase()} ${s.planned ? "planned" : ""} ${s.pending ? "pending" : ""}`}
                          title={
                            s.holiday || s.actual?.detail || s.plan?.detail
                          }
                        >
                          {s.pending ? "? " : ""}
                          {shortStatus(s.status)}
                        </span>
                      )}
                      <span className="wd-day-dots" aria-hidden="true">
                        {hasNotes(d) && <i />}
                        {hasReminder(d) && <i className="reminder" />}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="wd-legend">
                <span>
                  <i />
                  Confirmed
                </span>
                <span>
                  <i className="planned" />
                  Planned
                </span>
                <span>? Needs confirmation</span>
              </div>
            </div>
          )}
          <div className="wd-day-details">
            <div className="wd-day-heading">
              <span>
                {selecting
                  ? `${selected.length} dates selected`
                  : dateLabel(date)}
              </span>
              {!selecting && (
                <span className="wd-record-label">
                  {state.holiday
                    ? state.holiday
                    : state.actual
                      ? `Confirmed ${state.actual.status}${state.actual.detail ? " · " + state.actual.detail : ""}`
                      : state.plan
                        ? `${state.pending ? "Unconfirmed plan" : "Planned"} · ${state.plan.status}${state.plan.detail ? " · " + state.plan.detail : ""}`
                        : date > today
                          ? "Plan this day"
                          : "Not recorded"}
                </span>
              )}
            </div>
            {!selecting && state.pending && (
              <div className="wd-confirm-plan">
                <span>Did this plan happen?</span>
                <button
                  disabled={disabled}
                  onClick={() =>
                    change(() =>
                      setWorkdays(
                        doc,
                        [date],
                        state.plan.status,
                        state.plan.detail,
                        today,
                        "confirm",
                      ),
                    )
                  }
                >
                  Confirm {state.plan.status}
                </button>
              </div>
            )}
            <div className="wd-quick-actions" aria-label="Set workday status">
              {["WFH", "WFO"].map((s) => (
                <button
                  key={s}
                  disabled={disabled || !targets.length}
                  onClick={() => mark(s)}
                >
                  {date > today && !selecting ? "Plan " : ""}
                  {s}
                </button>
              ))}
              <button
                disabled={disabled || !targets.length}
                onClick={() => {
                  setDetail("Sick");
                  setDialog("leave");
                }}
              >
                Leave
              </button>
              <button
                disabled={disabled || !targets.length}
                onClick={() => {
                  setDetail("");
                  setDialog("holiday");
                }}
              >
                Holiday
              </button>
              <button
                className="wd-clear"
                disabled={disabled || !targets.length}
                onClick={() => mark("Clear")}
              >
                Clear
              </button>
            </div>
            {selecting && (
              <p className="wd-hint">
                Past and today’s dates are recorded; future dates become plans.
                Changes can be undone from the top bar.
              </p>
            )}
            {!policyOn(w, date) && (
              <p className="wd-hint">
                No work policy covers this date yet. Set its effective date in
                Workday settings.
              </p>
            )}
          </div>
          <details className="wd-leave">
            <summary>Leave balances · {date.slice(0, 4)}</summary>
            <div className="wd-leave-balances">
              {Object.entries(leaveSummary(w, date.slice(0, 4), today)).map(
                ([type, v]: [string, any]) => (
                  <div key={type}>
                    <strong>{type}</strong>
                    <span>
                      {v.used} used · {v.planned} planned
                    </span>
                    <small>
                      {v.allowance === null
                        ? "Allowance not set"
                        : `${v.allowance - v.used} remaining${v.planned ? ` · ${v.allowance - v.used - v.planned} after plans` : ""}`}
                    </small>
                  </div>
                ),
              )}
            </div>
          </details>
          <div className="wd-footer">
            <button
              className="wd-text-button"
              onClick={() => setDialog("import")}
            >
              Import holidays
            </button>
            {summary.pending.length > 0 && (
              <button
                className="wd-text-button"
                onClick={() => {
                  onDate(summary.pending[0]);
                  setSelecting(false);
                }}
              >
                {summary.pending.length} plan
                {summary.pending.length === 1 ? "" : "s"} to confirm
              </button>
            )}
            <span>
              {summary.home} WFH · {summary.leave} leave confirmed
            </span>
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="wd-error">
          {error}
        </p>
      )}
      {dialog === "settings" && (
        <WorkdaySettings
          doc={doc}
          date={date}
          today={today}
          disabled={disabled}
          onChange={onChange}
          onClose={() => setDialog("")}
        />
      )}
      {dialog === "import" && (
        <HolidayImport
          doc={doc}
          year={date.slice(0, 4)}
          disabled={disabled}
          onChange={onChange}
          onClose={() => setDialog("")}
        />
      )}
      {(dialog === "leave" || dialog === "holiday") && (
        <LibraryDialog
          title={dialog === "leave" ? "Set leave" : "Set holiday"}
          onClose={() => setDialog("")}
        >
          <form
            className="wd-form"
            onSubmit={(e) => {
              e.preventDefault();
              try {
                onChange(
                  setWorkdays(
                    doc,
                    targets,
                    dialog === "leave" ? "Leave" : "Holiday",
                    detail,
                    today,
                  ),
                );
                setError("");
                setDialog("");
              } catch (e) {
                setError(runError(e));
              }
            }}
          >
            <p>
              {targets.length} date{targets.length === 1 ? "" : "s"} · Future
              leave stays planned until confirmed.
            </p>
            {dialog === "leave" ? (
              <label>
                Leave type
                <select
                  aria-label="Leave type"
                  value={detail}
                  onChange={(e) => setDetail(e.target.value)}
                >
                  {LEAVE_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
            ) : (
              <label>
                Holiday name
                <input
                  aria-label="Holiday name"
                  required
                  maxLength={160}
                  value={detail}
                  onChange={(e) => setDetail(e.target.value)}
                  autoFocus
                />
              </label>
            )}
            {dialog === "holiday" && (
              <p className="wd-hint">
                This replaces attendance and plans on the selected dates. Your
                notes and reminders stay intact. Use Undo to restore.
              </p>
            )}
            <footer>
              <button type="button" onClick={() => setDialog("")}>
                Cancel
              </button>
              <button className="wd-primary" disabled={disabled}>
                Apply to {targets.length} date{targets.length === 1 ? "" : "s"}
              </button>
            </footer>
          </form>
        </LibraryDialog>
      )}
    </section>
  );
}

function WorkdaySettings({
  doc,
  date,
  today,
  disabled,
  onChange,
  onClose,
}: {
  doc: Workspace;
  date: string;
  today: string;
  disabled: boolean;
  onChange: (doc: Workspace) => void;
  onClose: () => void;
}) {
  const w = workdays(doc) as any;
  const prior = policyOn(w, date) || defaultPolicy(date);
  const [p, setP] = useState({
      ...prior,
      effectiveFrom: w.policies.length ? today : monthStart(date),
    }),
    [allowance, setAllowance] = useState<any>(
      w.allowances[date.slice(0, 4)] ||
        Object.fromEntries(LEAVE_TYPES.map((t) => [t, 0])),
    ),
    [error, setError] = useState("");
  const set = (key: string, value: any) =>
    setP((old: any) => ({ ...old, [key]: value }));
  return (
    <LibraryDialog title="Workday settings" onClose={onClose}>
      <form
        className="wd-form"
        onSubmit={(e) => {
          e.preventDefault();
          try {
            onChange(saveWorkPolicy(doc, p, date.slice(0, 4), allowance));
            onClose();
          } catch (e) {
            setError(runError(e));
          }
        }}
      >
        <fieldset>
          <legend>Your workweek</legend>
          <div className="wd-week-picker">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => (
              <button
                key={d}
                type="button"
                aria-pressed={p.weekdays.includes(i)}
                onClick={() =>
                  set(
                    "weekdays",
                    p.weekdays.includes(i)
                      ? p.weekdays.filter((v: number) => v !== i)
                      : [...p.weekdays, i],
                  )
                }
              >
                {d}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="wd-form-row">
          <label>
            Office goal
            <select
              aria-label="Office goal type"
              value={p.goalMode}
              onChange={(e) => {
                set("goalMode", e.target.value);
                set(
                  "goalValue",
                  e.target.value === "percentage"
                    ? 60
                    : e.target.value === "monthly"
                      ? 12
                      : 3,
                );
              }}
            >
              <option value="weekly">Days per week</option>
              <option value="monthly">Days per month</option>
              <option value="percentage">Percentage of eligible days</option>
            </select>
          </label>
          <label>
            {p.goalMode === "percentage" ? "Percentage" : "Days"}
            <input
              aria-label="Office goal value"
              type="number"
              min={0}
              max={
                p.goalMode === "percentage"
                  ? 100
                  : p.goalMode === "monthly"
                    ? 31
                    : 7
              }
              required
              value={p.goalValue}
              onChange={(e) => set("goalValue", Number(e.target.value))}
            />
          </label>
        </div>
        <label className="wd-check">
          <input
            type="checkbox"
            checked={p.excludeLeave}
            onChange={(e) => set("excludeLeave", e.target.checked)}
          />
          Exclude leave from eligible days
        </label>
        <div className="wd-form-row">
          <label>
            Policy effective from
            <input
              aria-label="Policy effective date"
              type="date"
              min="1900-01-01"
              max="2199-12-31"
              required
              value={p.effectiveFrom}
              onChange={(e) => set("effectiveFrom", e.target.value)}
            />
          </label>
          <label>
            Employment starts (optional)
            <input
              aria-label="Employment start date"
              type="date"
              min="1900-01-01"
              max="2199-12-31"
              value={p.startDate}
              onChange={(e) => set("startDate", e.target.value)}
            />
          </label>
        </div>
        <p className="wd-hint">
          Earlier policy versions are retained. Saving the same effective date
          replaces that version. Holidays are excluded. Partial weeks and months
          are prorated by scheduled days; targets are capped to eligible days
          and rounded up.
        </p>
        <fieldset>
          <legend>Leave allowances · {date.slice(0, 4)}</legend>
          <div className="wd-form-row">
            {LEAVE_TYPES.map((t) => (
              <label key={t}>
                {t}
                <input
                  aria-label={`${t} leave allowance`}
                  type="number"
                  min={0}
                  max={366}
                  required
                  value={allowance[t]}
                  onChange={(e) =>
                    setAllowance((a: any) => ({
                      ...a,
                      [t]: Number(e.target.value),
                    }))
                  }
                />
              </label>
            ))}
          </div>
          <p className="wd-hint">
            Full-day leave only. Planned leave is reserved separately from
            confirmed usage.
          </p>
        </fieldset>
        {error && (
          <p role="alert" className="wd-error">
            {error}
          </p>
        )}
        <footer>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="wd-primary"
            disabled={disabled || !p.weekdays.length}
          >
            Save workday settings
          </button>
        </footer>
      </form>
    </LibraryDialog>
  );
}

function HolidayImport({
  doc,
  year,
  disabled,
  onChange,
  onClose,
}: {
  doc: Workspace;
  year: string;
  disabled: boolean;
  onChange: (doc: Workspace) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(""),
    [preview, setPreview] = useState<any>(null),
    [replace, setReplace] = useState(false),
    [error, setError] = useState("");
  const conflicts = preview
    ? holidayConflicts(workdays(doc), preview.rows)
    : [];
  return (
    <LibraryDialog title="Import company holidays" onClose={onClose}>
      <form
        className="wd-form"
        onSubmit={(e) => {
          e.preventDefault();
          try {
            if (!preview) {
              const result = parseHolidayText(text, year);
              setPreview(result);
              if (!result.rows.length)
                setError(
                  "No valid holidays found. Check the date formats below.",
                );
              else setError("");
            } else {
              onChange(importWorkHolidays(doc, preview.rows, replace));
              onClose();
            }
          } catch (e) {
            setError(runError(e));
          }
        }}
      >
        <label>
          Paste your holiday list
          <textarea
            aria-label="Holiday list"
            rows={6}
            maxLength={100000}
            value={text}
            placeholder={
              "2027-01-01 New Year\n26/01/2027 Republic Day\n14-Jan-2027 Makar Sankranti"
            }
            onChange={(e) => {
              setText(e.target.value);
              setPreview(null);
              setError("");
              setReplace(false);
            }}
          />
        </label>
        <p className="wd-hint">
          ISO dates, DD/MM/YYYY, DD-Mon-YYYY or Month D, YYYY. Missing years use{" "}
          {year}. Duplicate or invalid rows are skipped and listed below.
        </p>
        {preview && (
          <>
            <strong>
              {preview.rows.length} valid · {preview.errors.length} skipped ·{" "}
              {conflicts.length} conflicting
            </strong>
            <div className="wd-import-preview">
              {preview.rows.map((r: any) => (
                <div key={r.date}>
                  <time>{r.date}</time>
                  <span>{r.name}</span>
                  {conflicts.some((c: any) => c.date === r.date) && (
                    <small>Conflict</small>
                  )}
                </div>
              ))}
            </div>
            {preview.errors.length > 0 && (
              <details>
                <summary>Review skipped rows</summary>
                {preview.errors.map((r: any) => (
                  <p key={r.line} className="wd-hint">
                    Line {r.line}: {r.text}
                  </p>
                ))}
              </details>
            )}
            {conflicts.length > 0 && (
              <label className="wd-check">
                <input
                  type="checkbox"
                  checked={replace}
                  onChange={(e) => setReplace(e.target.checked)}
                />
                Replace attendance, plans and holiday names on{" "}
                {conflicts.length} conflicting date
                {conflicts.length === 1 ? "" : "s"}. Otherwise skip them.
              </label>
            )}
            <p className="wd-hint">
              Notes and reminders are preserved. The import can be undone from
              the top bar.
            </p>
          </>
        )}
        {error && (
          <p role="alert" className="wd-error">
            {error}
          </p>
        )}
        <footer>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="wd-primary"
            disabled={
              disabled || !text.trim() || (!!preview && !preview.rows.length)
            }
          >
            {preview ? "Import holidays" : "Preview import"}
          </button>
        </footer>
      </form>
    </LibraryDialog>
  );
}
