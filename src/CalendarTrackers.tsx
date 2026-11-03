import { useState, lazy, Suspense } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import type { Workspace } from "./data";
import { Icon } from "./icons";
import {
  dailyTrackers,
  addDailyTracker,
  enableDailyTracker,
  setDailyTracker,
} from "./daily-trackers.mjs";
import { workdaysV2, updateWorkdaysV2 } from "./workdays-v2.mjs";
import { WorkMode } from "./WorkMode";
const WorkdaysCalendar = lazy(() =>
  import("./WorkdaysCalendar").then((m) => ({ default: m.WorkdaysCalendar })),
);
import { localDate } from "./calendar-events.mjs";
import "./calendar-trackers.css";
export function CalendarTrackers({
  doc,
  date,
  disabled,
  onChange,
  onDate,
}: {
  doc: Workspace;
  date: string;
  disabled: boolean;
  onDate?: (date: string) => void;
  onChange: (update: (doc: Workspace) => Workspace) => void;
}) {
  const [workspace, setWorkspace] = useState(false),
    [open, setOpen] = useState(false),
    [label, setLabel] = useState(""),
    [options, setOptions] = useState(""),
    [error, setError] = useState("");
  const data = dailyTrackers(doc),
    w = workdaysV2(doc, date),
    fields = Object.values(data.definitions) as any[],
    enabled = fields.filter((f) => f.enabled),
    future = date > localDate();
  const change = (fn: (doc: Workspace) => Workspace) => {
    try {
      onChange(fn);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <section className="calendar-trackers" aria-label="Daily trackers">
      <div className="calendar-trackers-heading">
        <strong>Daily trackers</strong>
        <button
          aria-label="Manage daily trackers"
          onClick={() => setOpen(true)}
        >
          <Icon name="sliders" size={16} />
          {w.enabled || enabled.length ? "Edit" : "Set up"}
        </button>
      </div>
      {w.enabled && (
        <WorkMode
          doc={doc}
          date={date}
          disabled={disabled}
          onChange={onChange}
          onWorkspace={() => setWorkspace(true)}
        />
      )}
      {enabled.map((field) => (
        <div
          className="daily-tracker-field"
          role="group"
          aria-label={field.label}
          key={field.id}
        >
          <span className="daily-tracker-label">{field.label}</span>
          <div className="daily-tracker-options">
            {Object.entries(field.options).map(([id, name]) => (
              <label
                key={id}
                className={
                  data.entries[date]?.[field.id] === id ? "selected" : ""
                }
              >
                <input
                  type="radio"
                  disabled={disabled}
                  name={field.id + "-" + date}
                  checked={data.entries[date]?.[field.id] === id}
                  onChange={() =>
                    change((d) => setDailyTracker(d, date, field.id, id))
                  }
                />
                <span>{name as string}</span>
              </label>
            ))}
            <button
              aria-label={"Clear " + field.label}
              hidden={!data.entries[date]?.[field.id]}
              disabled={disabled}
              onClick={() =>
                change((d) => setDailyTracker(d, date, field.id, null))
              }
            >
              <Icon name="close" size={14} />
            </button>
          </div>
        </div>
      ))}
      {error && !open && <p role="alert">{error}</p>}
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal
          container={document.querySelector(".app") || document.body}
        >
          <Dialog.Overlay className="tracker-overlay" />
          <Dialog.Content
            className="tracker-dialog"
            aria-describedby="tracker-description"
          >
            <header>
              <Dialog.Title>Daily trackers</Dialog.Title>
              <Dialog.Close aria-label="Close daily tracker settings">
                <Icon name="close" size={20} />
              </Dialog.Close>
            </header>
            <Dialog.Description id="tracker-description">
              Choose what to track. Disabled trackers keep their history.
            </Dialog.Description>
            <label className="tracker-setting">
              <span>
                <strong>Workdays</strong>
                <small>WFH/WFO check-in, plans and office goals</small>
              </span>
              <input
                type="checkbox"
                role="switch"
                aria-label="Enable Workdays tracker"
                checked={w.enabled}
                disabled={disabled}
                onChange={(e) =>
                  change((d) =>
                    updateWorkdaysV2(d, (w) => ({
                      ...w,
                      enabled: e.target.checked,
                    })),
                  )
                }
              />
            </label>
            {fields.map((field) => (
              <label className="tracker-setting" key={field.id}>
                <span>
                  <strong>{field.label}</strong>
                  <small>{Object.values(field.options).join(" · ")}</small>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  aria-label={"Enable " + field.label + " tracker"}
                  checked={field.enabled}
                  disabled={disabled}
                  onChange={(e) =>
                    change((d) =>
                      enableDailyTracker(d, field.id, e.target.checked),
                    )
                  }
                />
              </label>
            ))}
            <div className="tracker-presets">
              <span>Try a template</span>
              {[
                ["Mood", "Great, Okay, Low"],
                ["Exercise", "Rest, Light, Workout"],
                ["Energy", "High, Medium, Low"],
              ].map(([name, choices]) => (
                <button
                  key={name}
                  disabled={disabled || fields.some((f) => f.label === name)}
                  onClick={() =>
                    change((d) => addDailyTracker(d, name, choices.split(",")))
                  }
                >
                  {name}
                  <Icon name="plus" size={14} />
                </button>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                try {
                  onChange((d) =>
                    addDailyTracker(d, label, options.split(",")),
                  );
                  setLabel("");
                  setOptions("");
                  setError("");
                } catch (err) {
                  setError((err as Error).message);
                }
              }}
            >
              <h3>Create your own tracker</h3>
              <label>
                Name
                <input
                  aria-label="Tracker name"
                  required
                  maxLength={60}
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. Study session"
                />
              </label>
              <label>
                Options, separated by commas
                <input
                  aria-label="Tracker options"
                  required
                  value={options}
                  onChange={(e) => setOptions(e.target.value)}
                  placeholder="Not today, Short, Deep focus"
                />
              </label>
              <p>Choose 2–8 options. Each day has one answer.</p>
              <button disabled={disabled || fields.length >= 20}>
                Add tracker
              </button>
            </form>
            {error && <p role="alert">{error}</p>}
            <Dialog.Close className="tracker-done">Done</Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      {workspace && (
        <Suspense fallback={<p role="status">Loading Workdays…</p>}>
          <WorkdaysCalendar
            doc={doc}
            date={date}
            disabled={disabled}
            onChange={onChange}
            onDate={onDate || (() => {})}
            onClose={() => setWorkspace(false)}
          />
        </Suspense>
      )}
    </section>
  );
}
