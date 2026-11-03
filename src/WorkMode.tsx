import { useState } from "react";
import type { Workspace } from "./data";
import { Icon } from "./icons";
import { localDate } from "./calendar-events.mjs";
import {
  workdaysV2,
  workdayState,
  setAllocations,
  clearWorkday,
  confirmPlans,
  leaveBalances,
} from "./workdays-v2.mjs";
import { WorkdayDialog } from "./WorkdayDialog";
import "./workdays-v2.css";
export function WorkdayMarker({ w, date }: { w: any; date: string }) {
  const s = workdayState(w, date);
  if (!s.actual && !s.plan && !s.holiday) return null;
  return (
    <span
      className={"wd2-marker" + (s.planned ? " planned" : "")}
      role="img"
      aria-label={
        (s.planned ? "Planned: " : "Recorded: ") +
        (s.holiday ? s.holiday + " · " : "") +
        s.label
      }
      title={(s.holiday ? s.holiday + " · " : "") + s.label}
    >
      {s.modes.some(Boolean) &&
        s.modes.map((mode: string, i: number) => (
          <i key={i} data-mode={mode} />
        ))}
      {s.holiday && <i data-mode="Holiday" />}
    </span>
  );
}
export function WorkMode({
  doc,
  date,
  disabled,
  onChange,
  onWorkspace,
}: {
  doc: Workspace;
  date: string;
  disabled: boolean;
  onChange: (fn: (d: Workspace) => Workspace) => void;
  onWorkspace?: () => void;
}) {
  const w = workdaysV2(doc, date),
    s = workdayState(w, date),
    future = date > localDate();
  const [leave, setLeave] = useState(false),
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
    <section className="wd2-daily" aria-label="Work mode">
      <div className="wd2-daily-heading">
        <span>Work mode{future && <small>Plan</small>}</span>
        {onWorkspace && (
          <button className="wd2-link" onClick={onWorkspace}>
            Workdays
            <Icon name="forward" size={13} />
          </button>
        )}
      </div>
      <div
        className="wd2-mode-row"
        role="group"
        aria-label={future ? "Planned work mode" : "Recorded work mode"}
      >
        {(["WFH", "WFO", "Leave"] as const).map((mode) => (
          <button
            key={mode}
            disabled={disabled}
            className="wd2-mode"
            aria-label={
              mode === "WFH"
                ? "Work from home"
                : mode === "WFO"
                  ? "Work from office"
                  : "Take leave"
            }
            aria-pressed={s.modes.every((m: string) => m === mode)}
            data-mode={mode}
            onClick={() =>
              mode === "Leave"
                ? setLeave(true)
                : change((d) => setAllocations(d, [date], { mode }))
            }
          >
            <Icon
              name={
                mode === "WFH" ? "home" : mode === "WFO" ? "office" : "calendar"
              }
              size={15}
            />
            {mode === "WFH" ? "Home" : mode === "WFO" ? "Office" : "Leave"}
          </button>
        ))}
      </div>
      {s.holiday && (
        <div className="wd2-muted">{s.holiday} · company holiday</div>
      )}
      {(s.actual || s.plan) && (
        <div className="wd2-day-detail">
          <span>
            {s.label}
            {s.planned ? " · planned" : ""}
          </span>
          <button
            className="wd2-link"
            disabled={disabled}
            onClick={() =>
              change((d) =>
                clearWorkday(
                  d,
                  date,
                  future ? "plan" : s.actual ? "actual" : "plan",
                ),
              )
            }
          >
            {future || !s.actual ? "Clear plan" : "Clear actual"}
          </button>
        </div>
      )}
      {s.pending && (
        <button
          className="wd2-confirm"
          disabled={disabled}
          onClick={() => change((d) => confirmPlans(d, [date]))}
        >
          Confirm planned{" "}
          {
            workdayState(
              { ...w, entries: { ...w.entries, [date]: { plan: s.plan } } },
              date,
            ).label
          }
        </button>
      )}
      {error && <p role="alert">{error}</p>}
      {leave && (
        <LeaveEntry
          doc={doc}
          dates={[date]}
          disabled={disabled}
          onChange={onChange}
          onClose={() => setLeave(false)}
        />
      )}
    </section>
  );
}
export function LeaveEntry({
  doc,
  dates,
  disabled,
  onChange,
  onClose,
}: {
  doc: Workspace;
  dates: string[];
  disabled: boolean;
  onChange: (fn: (d: Workspace) => Workspace) => void;
  onClose: () => void;
}) {
  const w = workdaysV2(doc),
    types = Object.values(w.leaveTypes).filter(
      (t: any) => !t.archived,
    ) as any[],
    state = workdayState(w, dates[0]),
    prior = state.actual || state.plan,
    priorLeave =
      prior?.am?.mode === "Leave"
        ? prior.am
        : prior?.pm?.mode === "Leave"
          ? prior.pm
          : null,
    initialHalf =
      prior?.am?.mode === "Leave" && prior?.pm?.mode === "Leave"
        ? "full"
        : prior?.am?.mode === "Leave"
          ? "am"
          : prior?.pm?.mode === "Leave"
            ? "pm"
            : "full",
    [type, setType] = useState(
      types.some((t) => t.id === priorLeave?.leaveTypeId)
        ? priorLeave!.leaveTypeId
        : types[0]?.id || "",
    ),
    [half, setHalf] = useState(initialHalf),
    [remaining, setRemaining] = useState(
      prior?.[initialHalf === "am" ? "pm" : "am"]?.mode === "WFO"
        ? "WFO"
        : "WFH",
    ),
    [error, setError] = useState("");
  const projected = (() => {
      try {
        return workdaysV2(
          setAllocations(doc, dates, {
            mode: "Leave",
            leaveTypeId: type,
            half,
            remaining,
          }),
        );
      } catch {
        return w;
      }
    })(),
    previews = [
      ...new Set(dates.map((d) => leaveBalances(projected, d).start)),
    ].map((start) => {
      const b = leaveBalances(projected, start);
      return { start, type: b.types.find((t: any) => t.id === type) };
    });
  return (
    <WorkdayDialog title="Take leave" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          try {
            onChange((d) =>
              setAllocations(d, dates, {
                mode: "Leave",
                leaveTypeId: type,
                half,
                remaining,
              }),
            );
            onClose();
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <p className="wd2-muted">
          {dates.length === 1 ? dates[0] : dates.length + " selected dates"} ·{" "}
          {dates.every((d) => d > localDate())
            ? "Planned leave"
            : "Past/today recorded; future dates planned"}
        </p>
        <label>
          Leave type
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend>Duration</legend>
          <div className="wd2-segments">
            {[
              ["full", "Full day"],
              ["am", "Morning"],
              ["pm", "Afternoon"],
            ].map(([value, label]) => (
              <label key={value}>
                <input
                  type="radio"
                  name="leave-duration"
                  checked={half === value}
                  onChange={() => setHalf(value)}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        {half !== "full" && (
          <label>
            Work the other half
            <select
              value={remaining}
              onChange={(e) => setRemaining(e.target.value)}
            >
              <option value="WFH">Home</option>
              <option value="WFO">Office</option>
            </select>
          </label>
        )}
        {previews.map((preview: any) => (
          <div key={preview.start}>
            <p className="wd2-muted">
              Year from {preview.start} · After this selection:{" "}
              {preview.type?.available === null
                ? "quota not set"
                : (preview.type?.available || 0) / 2 +
                  " days available after plans"}
            </p>
            {preview.type?.available !== null &&
              preview.type?.available < 0 && (
                <p className="wd2-warning">
                  This exceeds your allowance. You can still record it.
                </p>
              )}
          </div>
        ))}
        {error && <p role="alert">{error}</p>}
        <footer>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="wd2-primary" disabled={disabled || !type}>
            Save leave
          </button>
        </footer>
      </form>
    </WorkdayDialog>
  );
}
