import { useState } from "react";
import type { Workspace } from "./data";
import { localDate } from "./calendar-events.mjs";
import {
  workdaysV2,
  withLeaveYearStart,
  updateWorkdaysV2,
  periodRange,
  dayAfter,
  scheduleOn,
  leaveBalances,
  leaveYear,
  targetWarnings,
} from "./workdays-v2.mjs";
import { WorkdayDialog } from "./WorkdayDialog";
type Common = {
  doc: Workspace;
  date: string;
  disabled: boolean;
  onChange: (fn: (d: Workspace) => Workspace) => void;
};
export function WorkdaySettings({
  doc,
  date,
  disabled,
  onChange,
  onClose,
}: Common & { onClose: () => void }) {
  const w = workdaysV2(doc, date),
    p = scheduleOn(w, date) || w.schedules[0],
    [weekdays, setWeekdays] = useState<number[]>(p.weekdays),
    [startDate, setStartDate] = useState(p.startDate),
    [effective, setEffective] = useState(localDate()),
    [exclude, setExclude] = useState(p.excludeLeave),
    [yearStart, setYearStart] = useState(w.leaveYearStart),
    [error, setError] = useState(""),
    [saved, setSaved] = useState("");
  const [mode, setMode] = useState("WFO"),
    [comparison, setComparison] = useState("min"),
    [unit, setUnit] = useState("percent"),
    [value, setValue] = useState("40"),
    [period, setPeriod] = useState("month"),
    [targetDate, setTargetDate] = useState(periodRange(date).start),
    [confirmed, setConfirmed] = useState(false),
    [editing, setEditing] = useState<string | null>(null);
  const save = (fn: (d: Workspace) => Workspace, message: string) => {
    try {
      onChange(fn);
      setError("");
      setSaved(message);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <WorkdayDialog title="Workday settings" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save(
            (d) =>
              updateWorkdaysV2(d, (w) => ({
                ...withLeaveYearStart(w, yearStart, effective),
                schedules: [
                  ...w.schedules.filter(
                    (p: any) => p.effectiveFrom !== effective,
                  ),
                  {
                    effectiveFrom: effective,
                    weekdays: [...weekdays].sort(),
                    startDate,
                    excludeLeave: exclude,
                  },
                ].sort((a, b) =>
                  a.effectiveFrom.localeCompare(b.effectiveFrom),
                ),
              })),
            "Work schedule saved",
          );
        }}
      >
        <h3>Work schedule</h3>
        <fieldset>
          <legend>Working days</legend>
          <div className="wd2-weekday-options">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
              (label, day) => (
                <label key={day}>
                  <input
                    type="checkbox"
                    checked={weekdays.includes(day)}
                    onChange={(e) =>
                      setWeekdays((v) =>
                        e.target.checked
                          ? [...v, day]
                          : v.filter((d) => d !== day),
                      )
                    }
                  />
                  {label}
                </label>
              ),
            )}
          </div>
        </fieldset>
        <div className="wd2-form-grid">
          <label>
            Effective from
            <input
              required
              type="date"
              value={effective}
              onChange={(e) => setEffective(e.target.value)}
            />
          </label>
          <label>
            Employment start (optional)
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>
        </div>
        <label className="wd2-check">
          <input
            type="checkbox"
            checked={exclude}
            onChange={(e) => setExclude(e.target.checked)}
          />
          Exclude leave from work-percentage targets
        </label>
        <fieldset>
          <legend>Leave year starts</legend>
          <div className="wd2-form-grid">
            <label>
              Month
              <select
                value={yearStart.slice(0, 2)}
                onChange={(e) =>
                  setYearStart(e.target.value + yearStart.slice(2))
                }
              >
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i} value={String(i + 1).padStart(2, "0")}>
                    {new Date(2001, i, 1).toLocaleDateString(undefined, {
                      month: "long",
                    })}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Day
              <input
                required
                type="number"
                min="1"
                max="31"
                value={Number(yearStart.slice(3))}
                onChange={(e) =>
                  setYearStart(
                    yearStart.slice(0, 3) + e.target.value.padStart(2, "0"),
                  )
                }
              />
            </label>
          </div>
          <small>
            Applies from the start of the cycle containing the effective date.
            Earlier cycles remain saved.
          </small>
        </fieldset>
        <p className="wd2-muted">
          Schedule changes apply from the effective date. Choosing an earlier
          date recalculates that period’s statistics.
        </p>
        <button disabled={disabled || !weekdays.length}>
          Save work schedule
        </button>
      </form>
      <hr />
      <h3>Targets</h3>
      {Object.values(w.targets).map((t: any) => (
        <div className="wd2-settings-target" key={t.id}>
          <span>
            {t.mode} · {t.comparison === "min" ? "At least" : "At most"}{" "}
            {t.value}
            {t.unit === "percent" ? "%" : " days"} / {t.period}
            <small>
              {t.effectiveFrom}
              {t.endDate ? " through " + t.endDate : ""}
            </small>
          </span>
          <button
            disabled={disabled}
            onClick={() => {
              setEditing(t.id);
              setMode(t.mode);
              setComparison(t.comparison);
              setUnit(t.unit);
              setValue(String(t.value));
              setPeriod(t.period);
              setTargetDate(periodRange(date, t.period).start);
              setConfirmed(false);
            }}
          >
            Change
          </button>
          <button
            disabled={disabled}
            onClick={() =>
              save(
                (d) =>
                  updateWorkdaysV2(d, (w) => {
                    const targets = { ...w.targets };
                    delete targets[t.id];
                    return { ...w, targets };
                  }),
                "Target removed",
              )
            }
          >
            Remove
          </button>
        </div>
      ))}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save(
            (d) =>
              updateWorkdaysV2(d, (w) => {
                const id = crypto.randomUUID(),
                  targets = { ...w.targets };
                if (editing && targets[editing]) {
                  const old = targets[editing];
                  if (targetDate > old.effectiveFrom)
                    targets[editing] = {
                      ...old,
                      endDate: dayAfter(targetDate, -1),
                    };
                  else delete targets[editing];
                }
                targets[id] = {
                  id,
                  mode,
                  comparison,
                  unit,
                  period,
                  value: Number(value),
                  effectiveFrom: targetDate,
                  legacy: false,
                };
                return { ...w, targets };
              }),
            editing ? "Target updated" : "Target added",
          );
          setEditing(null);
        }}
      >
        <div className="wd2-form-grid">
          <label>
            Work mode
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="WFO">Office</option>
              <option value="WFH">Home</option>
            </select>
          </label>
          <label>
            Rule
            <select
              value={comparison}
              onChange={(e) => setComparison(e.target.value)}
            >
              <option value="min">At least</option>
              <option value="max">At most</option>
            </select>
          </label>
          <label>
            Amount
            <input
              required
              type="number"
              min="0"
              max={unit === "percent" ? 100 : 92}
              step="0.5"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </label>
          <label>
            Measure
            <select value={unit} onChange={(e) => setUnit(e.target.value)}>
              <option value="percent">Percentage</option>
              <option value="days">Days</option>
            </select>
          </label>
          <label>
            Every
            <select
              value={period}
              onChange={(e) => {
                setPeriod(e.target.value);
                setTargetDate(periodRange(targetDate, e.target.value).start);
                setConfirmed(false);
              }}
            >
              <option value="week">Week</option>
              <option value="month">Month</option>
              <option value="quarter">Quarter</option>
            </select>
          </label>
          <label>
            Period starting
            <input
              required
              type="date"
              value={targetDate}
              onChange={(e) => {
                setTargetDate(periodRange(e.target.value, period).start);
                setConfirmed(false);
              }}
            />
          </label>
        </div>
        {targetDate <= localDate() && (
          <label className="wd2-check">
            <input
              type="checkbox"
              required
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            Apply to this current/past period; its target will be recalculated.
          </label>
        )}
        <button
          disabled={disabled || (targetDate <= localDate() && !confirmed)}
        >
          {editing ? "Save changed target" : "Add target"}
        </button>
        {editing && (
          <button type="button" onClick={() => setEditing(null)}>
            Cancel change
          </button>
        )}
      </form>
      {targetWarnings(w, date).map((text) => (
        <p role="status" className="wd2-warning" key={text}>
          {text}
        </p>
      ))}
      {error && <p role="alert">{error}</p>}
      {saved && <p role="status">{saved}</p>}
      <footer>
        <button className="wd2-primary" onClick={onClose}>
          Done
        </button>
      </footer>
    </WorkdayDialog>
  );
}
export function LeaveSettings({ doc, date, disabled, onChange }: Common) {
  const w = workdaysV2(doc, date),
    balances = leaveBalances(w, date),
    [name, setName] = useState(""),
    [color, setColor] = useState("#c59a50"),
    [error, setError] = useState("");
  const change = (fn: (d: Workspace) => Workspace) => {
    try {
      onChange(fn);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <section className="wd2-leaves">
      <p className="wd2-muted">
        {balances.start} – {balances.end} · Quotas and adjustments are in days.
      </p>
      {balances.types.map((t: any) => (
        <LeaveQuota
          key={t.id + "-" + balances.start}
          type={t}
          year={balances.start}
          disabled={disabled}
          onChange={change}
        />
      ))}
      <form
        className="wd2-add-type"
        onSubmit={(e) => {
          e.preventDefault();
          change((d) =>
            updateWorkdaysV2(d, (w) => {
              const id = crypto.randomUUID();
              return {
                ...w,
                leaveTypes: {
                  ...w.leaveTypes,
                  [id]: { id, name: name.trim(), color, archived: false },
                },
              };
            }),
          );
          setName("");
        }}
      >
        <h3>Add leave type</h3>
        <div className="wd2-form-grid">
          <label>
            Name
            <input
              required
              maxLength={60}
              placeholder="e.g. Medical leave"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Colour
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
          </label>
        </div>
        <button disabled={disabled || !name.trim()}>Add leave type</button>
      </form>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
function LeaveQuota({
  type: t,
  year,
  disabled,
  onChange,
}: {
  type: any;
  year: string;
  disabled: boolean;
  onChange: (fn: (d: Workspace) => Workspace) => void;
}) {
  const [quota, setQuota] = useState(
      t.allowance === null ? "" : String(t.allowance / 2),
    ),
    [adjustment, setAdjustment] = useState(String(t.adjustment / 2)),
    [name, setName] = useState(t.name),
    [color, setColor] = useState(t.color),
    [open, setOpen] = useState(false);
  return (
    <section className="wd2-leave-row">
      <div className="wd2-section-title">
        <h3>
          <i style={{ background: t.color }} />
          {t.name}
          {t.archived ? " · archived" : ""}
        </h3>
        <button
          className="wd2-link"
          disabled={disabled}
          onClick={() => setOpen(!open)}
        >
          {open ? "Close" : "Manage"}
        </button>
      </div>
      <div className="wd2-balance">
        <strong>
          {t.remaining === null ? "Not set" : t.remaining / 2}
          <small> remaining</small>
        </strong>
        <span>
          {t.used / 2} used · {t.planned / 2} planned
          {t.available !== null ? " · " + t.available / 2 + " after plans" : ""}
        </span>
      </div>
      {t.available !== null && t.available < 0 && (
        <p className="wd2-warning">Plans exceed the remaining allowance.</p>
      )}
      {open && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onChange((d) =>
              updateWorkdaysV2(d, (w) => ({
                ...w,
                leaveTypes: {
                  ...w.leaveTypes,
                  [t.id]: { ...w.leaveTypes[t.id], name: name.trim(), color },
                },
                leaveYears: {
                  ...w.leaveYears,
                  [year]: {
                    start: year,
                    quotas: {
                      ...w.leaveYears[year]?.quotas,
                      [t.id]: quota === "" ? null : Number(quota) * 2,
                    },
                    adjustments: {
                      ...w.leaveYears[year]?.adjustments,
                      [t.id]: Number(adjustment) * 2,
                    },
                  },
                },
              })),
            );
            setOpen(false);
          }}
        >
          <div className="wd2-form-grid">
            <label>
              Name
              <input
                required
                maxLength={60}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              Colour
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
            </label>
            <label>
              Yearly allowance
              <input
                type="number"
                min="0"
                max="10000"
                step="0.5"
                placeholder="Not tracked"
                value={quota}
                onChange={(e) => setQuota(e.target.value)}
              />
            </label>
            <label>
              Carry-over / adjustment
              <input
                type="number"
                min="-10000"
                max="10000"
                step="0.5"
                value={adjustment}
                onChange={(e) => setAdjustment(e.target.value)}
              />
            </label>
          </div>
          <button disabled={disabled}>Save leave allowance</button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              onChange((d) =>
                updateWorkdaysV2(d, (w) => ({
                  ...w,
                  leaveTypes: {
                    ...w.leaveTypes,
                    [t.id]: { ...w.leaveTypes[t.id], archived: !t.archived },
                  },
                })),
              );
              setOpen(false);
            }}
          >
            {t.archived ? "Restore type" : "Archive type"}
          </button>
        </form>
      )}
    </section>
  );
}
