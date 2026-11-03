import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import type { Workspace } from "./data";
import { localDate } from "./calendar-events.mjs";
import {
  workdaysV2,
  periodRange,
  dayAfter,
  datesBetween,
  weekday,
  workdayState,
  scheduled,
  setAllocations,
  confirmPlans,
  clearWorkday,
  targetProgress,
  targetWarnings,
  summarizeWorkdays,
  routinePreview,
  applyRoutine,
  leaveBalances,
} from "./workdays-v2.mjs";
import { WorkdayDialog } from "./WorkdayDialog";
import { WorkdayMarker, LeaveEntry } from "./WorkMode";
import { WorkdaySettings, LeaveSettings } from "./WorkdaySettings";
import { Icon } from "./icons";
import "./workdays-v2.css";
const Insights = lazy(() => import("./WorkdayInsights"));
const HolidayImport = lazy(() => import("./WorkdayHolidayImport"));
type Props = {
  doc: Workspace;
  date: string;
  disabled: boolean;
  onDate: (date: string) => void;
  onChange: (fn: (d: Workspace) => Workspace) => void;
  onClose: () => void;
};
export function WorkdaysCalendar({
  doc,
  date,
  disabled,
  onDate,
  onChange,
  onClose,
}: Props) {
  const w = workdaysV2(doc, date),
    [tab, setTab] = useState("overview"),
    [period, setPeriod] = useState("month"),
    [anchor, setAnchor] = useState(date),
    [selected, setSelected] = useState<string[]>([]),
    [dialog, setDialog] = useState(""),
    [error, setError] = useState("");
  const [today, setToday] = useState(localDate);
  useEffect(() => {
    const tick = () => setToday(localDate());
    window.addEventListener("focus", tick);
    const t = setInterval(tick, 30000);
    return () => {
      window.removeEventListener("focus", tick);
      clearInterval(t);
    };
  }, []);
  const range = periodRange(anchor, tab === "plan" ? "month" : period),
    month = periodRange(anchor, "month"),
    summary = useMemo(
      () => summarizeWorkdays(w, range.start, range.end, today),
      [w, range.start, range.end, today],
    ),
    warnings = targetWarnings(w, anchor, today);
  const change = (fn: (d: Workspace) => Workspace) => {
    try {
      onChange(fn);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const jump = (n: number) => {
    if (tab === "leave") {
      const start = leaveBalances(w, anchor).start,
        d = new Date(start + "T12:00:00Z");
      d.setUTCFullYear(d.getUTCFullYear() + n);
      const next = d.toISOString().slice(0, 10);
      if (next >= "1900-01-01" && next <= "2199-12-31") setAnchor(next);
      return;
    }
    const next = n < 0 ? dayAfter(range.start, -1) : dayAfter(range.end);
    if (next >= "1900-01-01" && next <= "2199-12-31") {
      setAnchor(next);
      setSelected([]);
    }
  };
  const grid = datesBetween(
    [dayAfter(month.start, -((weekday(month.start) + 6) % 7)), "1900-01-01"]
      .sort()
      .at(-1)!,
    [dayAfter(month.end, (7 - weekday(month.end)) % 7), "2199-12-31"].sort()[0],
  );
  return (
    <>
      <WorkdayDialog title="Workdays" wide onClose={onClose}>
        <div className="wd2-workspace">
          <div className="wd2-workspace-nav">
            <nav aria-label="Workdays views">
              {["overview", "plan", "leave"].map((t) => (
                <button
                  key={t}
                  aria-pressed={tab === t}
                  onClick={() => {
                    setTab(t);
                    setSelected([]);
                  }}
                >
                  {t[0].toUpperCase() + t.slice(1)}
                </button>
              ))}
            </nav>
            <div>
              <button
                className="icon-button"
                title="Import holidays"
                aria-label="Import holidays"
                onClick={() => setDialog("import")}
              >
                <Icon name="upload" size={17} />
              </button>
              <button
                className="icon-button"
                aria-label="Workday settings"
                onClick={() => setDialog("settings")}
              >
                <Icon name="settings" size={17} />
              </button>
            </div>
          </div>
          <div className="wd2-period">
            <button
              className="icon-button"
              aria-label="Previous work period"
              onClick={() => jump(-1)}
            >
              <Icon name="back" size={16} />
            </button>
            <label className="wd2-period-label">
              {tab === "leave" ? "Leave year" : "Period"}
              <input
                aria-label="Workdays date"
                type="date"
                value={anchor}
                onChange={(e) => {
                  if (e.target.value) {
                    setAnchor(e.target.value);
                    setSelected([]);
                  }
                }}
              />
            </label>
            {tab === "overview" && (
              <select
                aria-label="Statistics period"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
              >
                <option value="week">Week</option>
                <option value="month">Month</option>
                <option value="quarter">Quarter</option>
              </select>
            )}
            <button
              className="icon-button"
              aria-label="Next work period"
              onClick={() => jump(1)}
            >
              <Icon name="forward" size={16} />
            </button>
          </div>
          {tab === "overview" && (
            <>
              <p className="wd2-muted">
                {range.start} – {range.end} · Scheduled workdays only
              </p>
              <div className="wd2-metrics">
                {[
                  ["Home", summary.home],
                  ["Office", summary.office],
                  ["Leave", summary.leave],
                  ["Unrecorded", summary.missing],
                ].map(([label, value]) => (
                  <div key={label}>
                    <strong>{value}</strong>
                    <span>{label}</span>
                  </div>
                ))}
              </div>
              <Suspense fallback={<p role="status">Loading chart…</p>}>
                <Insights
                  rows={summary.rows}
                  period={period}
                  onDate={(d) => {
                    setAnchor(d);
                    setTab("plan");
                    setSelected([d]);
                  }}
                />
              </Suspense>
              <div className="wd2-section-title">
                <h3>Targets</h3>
                <button
                  className="wd2-link"
                  onClick={() => setDialog("settings")}
                >
                  Edit targets
                </button>
              </div>
              {!Object.keys(w.targets).length && (
                <p className="wd2-muted">
                  Set an office minimum or a home-working limit.
                </p>
              )}
              {Object.values(w.targets).map((t: any) => {
                const p = targetProgress(w, t, anchor, today);
                if (!p) return null;
                return (
                  <button
                    className="wd2-target"
                    key={t.id}
                    onClick={() => {
                      setTab("plan");
                      setSelected([]);
                      setAnchor(p.start);
                    }}
                  >
                    <div>
                      <strong>
                        {t.mode === "WFH" ? "Home" : "Office"} ·{" "}
                        {t.comparison === "min" ? "At least" : "At most"}{" "}
                        {t.value}
                        {t.unit === "percent" ? "%" : " days"} / {t.period}
                      </strong>
                      <span>
                        {p.noDays
                          ? "No eligible workdays"
                          : `${p.actual} recorded · ${p.projected} projected · ${p.projectedTarget} ${t.comparison === "min" ? "needed" : "limit"}`}
                      </span>
                    </div>
                    <div className="wd2-progress" aria-hidden="true">
                      <i
                        style={{
                          width:
                            Math.min(
                              100,
                              p.target ? (p.actual / p.target) * 100 : 0,
                            ) + "%",
                        }}
                      />
                      <i
                        className="projected"
                        style={{
                          width:
                            Math.min(
                              100,
                              p.projectedTarget
                                ? (p.projected / p.projectedTarget) * 100
                                : 0,
                            ) + "%",
                        }}
                      />
                    </div>
                    <small>
                      {p.eligible} eligible days · {p.projectedEligible} after
                      planned leave · {p.missing} unrecorded
                      {t.comparison === "max" && p.end >= today
                        ? " · provisional until period ends"
                        : ""}
                    </small>
                  </button>
                );
              })}
              {warnings.map((warning) => (
                <p className="wd2-warning" key={warning}>
                  {warning}
                </p>
              ))}
              {!!summary.exceptions && (
                <p className="wd2-muted">
                  {summary.exceptions} recorded days on holidays/nonworking days
                  · kept as exceptions, excluded from targets.
                </p>
              )}
              {!!summary.pending.length && (
                <section className="wd2-pending">
                  <div className="wd2-section-title">
                    <h3>{summary.pending.length} plans to confirm</h3>
                    <button
                      disabled={disabled}
                      className="wd2-link"
                      onClick={() =>
                        change((d) => confirmPlans(d, summary.pending))
                      }
                    >
                      Confirm these plans
                    </button>
                  </div>
                  {summary.pending.slice(0, 7).map((d) => (
                    <button
                      className="wd2-pending-date"
                      key={d}
                      onClick={() => {
                        setAnchor(d);
                        setTab("plan");
                        setSelected([d]);
                      }}
                    >
                      {d}
                      <span>{workdayState(w, d, today).label}</span>
                      <Icon name="forward" size={14} />
                    </button>
                  ))}
                </section>
              )}
            </>
          )}
          {tab === "plan" && (
            <>
              <div className="wd2-section-title">
                <h3>
                  {new Date(anchor + "T12:00:00").toLocaleDateString(
                    undefined,
                    { month: "long", year: "numeric" },
                  )}
                </h3>
                <button
                  className="wd2-link"
                  disabled={disabled}
                  onClick={() => setDialog("routine")}
                >
                  Weekly routine
                </button>
              </div>
              <p className="wd2-muted">
                Select dates to record or plan. Outlined markers are plans.
              </p>
              <div
                className="wd2-month"
                role="group"
                aria-label="Workdays month"
              >
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                  <span className="wd2-weekday" key={d}>
                    {d}
                  </span>
                ))}
                {grid.map((d) => {
                  const s = workdayState(w, d, today);
                  return (
                    <button
                      key={d}
                      aria-label={
                        d +
                        " · " +
                        (s.holiday || s.label) +
                        (s.planned ? " · planned" : "")
                      }
                      aria-pressed={selected.includes(d)}
                      className={
                        (d.slice(0, 7) !== anchor.slice(0, 7)
                          ? "outside "
                          : "") + (!scheduled(w, d) ? "nonworking " : "")
                      }
                      onClick={() =>
                        setSelected((prev) =>
                          prev.includes(d)
                            ? prev.filter((x) => x !== d)
                            : [...prev, d],
                        )
                      }
                    >
                      <span>{+d.slice(8)}</span>
                      <WorkdayMarker w={w} date={d} />
                      <small>
                        {s.holiday
                          ? "Holiday"
                          : s.label === "Unrecorded"
                            ? ""
                            : s.label}
                      </small>
                    </button>
                  );
                })}
              </div>
              {selected.length > 0 && (
                <div className="wd2-bulk">
                  <strong>{selected.length} selected</strong>
                  <div>
                    {["WFH", "WFO"].map((mode) => (
                      <button
                        key={mode}
                        disabled={disabled}
                        onClick={() =>
                          change((d) => setAllocations(d, selected, { mode }))
                        }
                      >
                        {mode === "WFH" ? "Home" : "Office"}
                      </button>
                    ))}
                    <button
                      disabled={disabled}
                      onClick={() => setDialog("leave")}
                    >
                      Leave
                    </button>
                    <button
                      disabled={
                        disabled ||
                        selected.some((d) => d > today) ||
                        !selected.some((d) => w.entries[d]?.plan)
                      }
                      onClick={() => change((d) => confirmPlans(d, selected))}
                    >
                      Confirm plans
                    </button>
                  </div>
                  <div>
                    {["actual", "plan", "holiday"].map((kind) => (
                      <button
                        key={kind}
                        disabled={disabled}
                        onClick={() =>
                          change((d) =>
                            selected.reduce(
                              (next, date) => clearWorkday(next, date, kind),
                              d,
                            ),
                          )
                        }
                      >
                        {kind === "holiday"
                          ? "Remove holiday"
                          : "Clear " + kind}
                      </button>
                    ))}
                    {selected.length === 1 && (
                      <button
                        onClick={() => {
                          onDate(selected[0]);
                          onClose();
                        }}
                      >
                        Open day
                      </button>
                    )}
                    <button onClick={() => setSelected([])}>Deselect</button>
                  </div>
                </div>
              )}
            </>
          )}
          {tab === "leave" && (
            <LeaveSettings
              doc={doc}
              date={anchor}
              disabled={disabled}
              onChange={onChange}
            />
          )}
          {error && <p role="alert">{error}</p>}
        </div>
      </WorkdayDialog>
      {dialog === "settings" && (
        <WorkdaySettings
          doc={doc}
          date={anchor}
          disabled={disabled}
          onChange={onChange}
          onClose={() => setDialog("")}
        />
      )}{" "}
      {dialog === "import" && (
        <Suspense fallback={<p role="status">Loading holiday import…</p>}>
          <HolidayImport
            doc={doc}
            date={anchor}
            disabled={disabled}
            onChange={onChange}
            onClose={() => setDialog("")}
          />
        </Suspense>
      )}
      {dialog === "leave" && (
        <LeaveEntry
          doc={doc}
          dates={selected}
          disabled={disabled}
          onChange={onChange}
          onClose={() => setDialog("")}
        />
      )}{" "}
      {dialog === "routine" && (
        <Routine
          doc={doc}
          date={anchor}
          disabled={disabled}
          onChange={onChange}
          onClose={() => setDialog("")}
        />
      )}
    </>
  );
}
function Routine({
  doc,
  date,
  disabled,
  onChange,
  onClose,
}: Omit<Props, "onDate">) {
  const w = workdaysV2(doc),
    [start, setStart] = useState(date < localDate() ? localDate() : date),
    [end, setEnd] = useState(periodRange(start).end),
    [pattern, setPattern] = useState<Record<number, string>>({
      1: "WFO",
      2: "WFO",
      3: "WFO",
      4: "WFH",
      5: "WFH",
    }),
    [preview, setPreview] = useState<any[] | null>(null),
    [replace, setReplace] = useState<string[]>([]),
    [error, setError] = useState("");
  return (
    <WorkdayDialog title="Weekly routine" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          try {
            setPreview(routinePreview(w, start, end, pattern));
            setError("");
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <div className="wd2-form-grid">
          <label>
            From
            <input
              type="date"
              required
              min={localDate()}
              value={start}
              onChange={(e) => {
                setStart(e.target.value);
                setPreview(null);
              }}
            />
          </label>
          <label>
            Through
            <input
              type="date"
              required
              min={start}
              value={end}
              onChange={(e) => {
                setEnd(e.target.value);
                setPreview(null);
              }}
            />
          </label>
        </div>
        {[
          "Sunday",
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
        ].map((name, day) => (
          <label className="wd2-routine-day" key={day}>
            <span>{name}</span>
            <select
              value={pattern[day] || ""}
              onChange={(e) => {
                setPattern({ ...pattern, [day]: e.target.value });
                setPreview(null);
              }}
            >
              <option value="">No plan</option>
              <option value="WFH">Home</option>
              <option value="WFO">Office</option>
            </select>
          </label>
        ))}
        <p className="wd2-muted">
          Holidays, nonworking dates and actual records are skipped. Existing
          plans stay unless selected below.
        </p>
        <button disabled={disabled}>Preview routine</button>
        {preview && (
          <div className="wd2-routine-preview">
            <p>
              {
                preview.filter(
                  (r) => !r.actual && (!r.conflict || replace.includes(r.date)),
                ).length
              }{" "}
              plans to apply
            </p>
            {preview.map((r) => (
              <div key={r.date}>
                {r.date} · {r.mode}
                {r.actual ? (
                  " · actual kept"
                ) : r.conflict ? (
                  <label>
                    <input
                      type="checkbox"
                      checked={replace.includes(r.date)}
                      onChange={(e) =>
                        setReplace((v) =>
                          e.target.checked
                            ? [...v, r.date]
                            : v.filter((d) => d !== r.date),
                        )
                      }
                    />
                    Replace existing plan
                  </label>
                ) : (
                  " · new"
                )}
              </div>
            ))}
          </div>
        )}
        {error && <p role="alert">{error}</p>}
        <footer>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="wd2-primary"
            disabled={disabled || !preview?.length}
            onClick={() => {
              try {
                onChange((d) => applyRoutine(d, preview!, replace));
                onClose();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Apply plans
          </button>
        </footer>
      </form>
    </WorkdayDialog>
  );
}
