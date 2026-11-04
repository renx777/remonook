import { useMemo, useState, type CSSProperties } from "react";
import type { Workspace } from "./data";
import {
  dayAfter,
  datesBetween,
  periodRange,
  leaveBalances,
  targetProgress,
  targetWarnings,
  confirmPlans,
} from "./workdays-v2.mjs";
import {
  dayInfo,
  splitFor,
  primaryTarget,
  statusFor,
  targetText,
  fmtDays,
  pct,
  longDate,
  monthGrid,
  type DayInfo,
  type Split,
} from "./workdays-stats";
import { WorkMode } from "./WorkMode";
import { Icon } from "./icons";
import "./workdays-overview.css";

type Change = (fn: (d: Workspace) => Workspace) => void;
type Props = {
  doc: Workspace;
  w: any;
  anchor: string;
  today: string;
  disabled: boolean;
  phone: boolean;
  onAnchor: (date: string) => void;
  onPlan: (date: string) => void;
  onSettings: () => void;
  onLeave: () => void;
  change: Change;
};

const MONTHS = Array.from({ length: 12 }, (_, m) =>
  new Date(2000, m, 1).toLocaleDateString(undefined, { month: "short" }),
);

export function SplitBar({
  split,
  target,
  thin = false,
  label,
}: {
  split: Split;
  target?: number | null;
  thin?: boolean;
  label?: string;
}) {
  const total = split.office + split.home + split.leave + split.unset;
  return (
    <span
      className={"wd2-split" + (thin ? " thin" : "")}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {(["office", "home", "leave", "unset"] as const).map(
        (k) =>
          split[k] > 0 && (
            <i key={k} data-k={k} style={{ width: pct(split[k], total) }} />
          ),
      )}
      {target != null && (
        <b className="wd2-split-target" style={{ left: target + "%" }} />
      )}
    </span>
  );
}

function cellStyle(info: DayInfo): CSSProperties | undefined {
  const [a, b] = info.modes;
  if (!a && !b) return undefined;
  return {
    ["--a" as any]: `var(--wd-${a || b})`,
    ["--b" as any]: `var(--wd-${b || a})`,
  };
}

function cellClass(info: DayInfo, today: string, selected?: string) {
  const set = info.modes.some(Boolean);
  return [
    "wd2-day",
    info.off && !set ? "off" : "",
    info.holiday ? "holiday" : "",
    set ? (info.planned ? "planned" : "recorded") : "",
    set && info.modes[0] !== info.modes[1] ? "half" : "",
    !set && !info.off ? (info.date < today ? "missing" : "open") : "",
    info.date === today ? "today" : "",
    info.date === selected ? "selected" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function shareLine(split: Split, rule: any, today: string) {
  const status = statusFor(split, rule, today);
  return (
    <>
      <b>{split.share === null ? "–" : split.share + "%"}</b> office
      {rule && ` · target ${rule.value}%`}
      {status && (
        <span className={"wd2-status " + status.tone}>
          {" · "}
          {status.tone === "met" ? "✓ " : status.tone === "below" ? "✕ " : ""}
          {status.text}
        </span>
      )}
    </>
  );
}

function yearTargets(w: any, year: number, today: string) {
  return (Object.values(w.targets || {}) as any[]).map((rule) => {
    let d = `${year}-01-01`,
      met = 0,
      done = 0,
      current: boolean | null = null;
    const last = `${year}-12-31`;
    for (let guard = 0; d <= last && guard < 60; guard++) {
      const range = periodRange(d, rule.period);
      if (range.start > today) break;
      const p = targetProgress(w, rule, d, today);
      if (p && !p.noDays) {
        if (p.end < today) {
          done++;
          if (p.met) met++;
        } else current = p.projectedMet;
      }
      d = dayAfter(range.end);
    }
    return { rule, met, done, current };
  });
}

function TodoList({
  w,
  year,
  today,
  disabled,
  change,
  onPlan,
}: {
  w: any;
  year: number;
  today: string;
  disabled: boolean;
  change: Change;
  onPlan: (date: string) => void;
}) {
  const yearStart = `${year}-01-01`,
    yearEnd = `${year}-12-31`,
    past = yearStart <= today ? splitFor(w, yearStart, [today, yearEnd].sort()[0], today) : null,
    soon = splitFor(w, dayAfter(today), dayAfter(today, 14), today),
    soonOpen = datesBetween(dayAfter(today), dayAfter(today, 14)).filter((d) => {
      const i = dayInfo(w, d, today);
      return !i.off && !i.modes.some(Boolean);
    }),
    warnings = targetWarnings(w, today, today);
  const items = [];
  if (past?.pending.length)
    items.push(
      <li key="pending">
        {past.pending.length} past {past.pending.length === 1 ? "plan" : "plans"} to confirm ·{" "}
        <button
          className="wd2-link"
          disabled={disabled}
          onClick={() => change((d) => confirmPlans(d, past.pending))}
        >
          Confirm all
        </button>
        {" · "}
        <button className="wd2-link" onClick={() => onPlan(past.pending[0])}>
          Review
        </button>
      </li>,
    );
  if (past?.missing.length)
    items.push(
      <li key="missing">
        {past.missing.length === 1
          ? `No record for ${longDate(past.missing[0], { weekday: "short", day: "numeric", month: "short" })}`
          : `${past.missing.length} workdays with no record`}{" "}
        ·{" "}
        <button className="wd2-link" onClick={() => onPlan(past.missing.at(-1)!)}>
          Add
        </button>
      </li>,
    );
  if (soonOpen.length && soon.base)
    items.push(
      <li key="soon">
        {soonOpen.length} {soonOpen.length === 1 ? "day" : "days"} in the next two weeks not planned ·{" "}
        <button className="wd2-link" onClick={() => onPlan(soonOpen[0])}>
          Plan
        </button>
      </li>,
    );
  for (const warning of warnings)
    items.push(
      <li key={warning} className="wd2-warning-line">
        {warning}
      </li>,
    );
  return items.length ? (
    <ul className="wd2-lines">{items}</ul>
  ) : (
    <p className="wd2-muted">All caught up.</p>
  );
}

function LeaveLeft({ w, today, onLeave }: { w: any; today: string; onLeave: () => void }) {
  const types = leaveBalances(w, today, today).types.filter(
    (t: any) => !t.archived && t.allowance !== null,
  );
  if (!types.length)
    return (
      <p className="wd2-muted">
        No allowances yet ·{" "}
        <button className="wd2-link" onClick={onLeave}>
          Set allowances
        </button>
      </p>
    );
  return (
    <>
      {types.map((t: any) => {
        // Balances are stored in half days.
        const quota = (t.allowance + t.adjustment) / 2;
        return (
          <div className="wd2-leave-left" key={t.id}>
            <div>
              <span>{t.name}</span>
              <span>
                <b>{fmtDays(t.remaining / 2)}</b> of {fmtDays(quota)}
                {t.planned ? ` · ${fmtDays(t.planned / 2)} planned` : ""}
              </span>
            </div>
            <span className="wd2-meter" aria-hidden="true">
              <i style={{ width: pct(Math.min(quota, t.used / 2), quota) }} />
            </span>
          </div>
        );
      })}
    </>
  );
}

function YearView(props: Props) {
  const { w, anchor, today, onAnchor, onPlan } = props,
    year = +anchor.slice(0, 4),
    rule = primaryTarget(w),
    [table, setTable] = useState(false);
  const data = useMemo(() => {
    const months = MONTHS.map((name, m) => {
      const start = `${year}-${String(m + 1).padStart(2, "0")}-01`,
        end = periodRange(start, "month").end,
        days = datesBetween(start, end).map((d) => dayInfo(w, d, today));
      return { name, start, split: splitFor(w, start, end, today), days };
    });
    const quarters = [0, 1, 2, 3].map((q) => {
      const start = months[q * 3].start;
      return {
        name: "Q" + (q + 1),
        months: `${MONTHS[q * 3]}–${MONTHS[q * 3 + 2]}`,
        split: splitFor(w, start, periodRange(start, "quarter").end, today),
      };
    });
    return {
      months,
      quarters,
      year: splitFor(w, `${year}-01-01`, `${year}-12-31`, today),
      targets: yearTargets(w, year, today),
    };
  }, [w, year, today]);
  const ys = data.year;
  return (
    <div className="wd2-year">
      <div className="wd2-year-top">
        <div className="wd2-headline">
          <p>Office share, {year}</p>
          <p>
            <span className="wd2-big">{ys.share === null ? "–" : ys.share + "%"}</span>
            {rule && <span> target {rule.value}%</span>}
            {(() => {
              const s = statusFor(ys, rule, today);
              return s ? (
                <span className={"wd2-status " + s.tone}>
                  {" · "}
                  {s.tone === "met" ? "✓ " : s.tone === "below" ? "✕ " : ""}
                  {s.text}
                </span>
              ) : null;
            })()}
          </p>
        </div>
        <div className="wd2-year-split">
          <SplitBar
            split={ys}
            label={`${year}: Office ${fmtDays(ys.office)}, Home ${fmtDays(ys.home)}, Leave ${fmtDays(ys.leave)} days including plans`}
          />
          <span className="wd2-legend">
            <span><i data-k="office" /> Office <b>{fmtDays(ys.office)}</b></span>
            <span><i data-k="home" /> Home <b>{fmtDays(ys.home)}</b></span>
            <span><i data-k="leave" /> Leave <b>{fmtDays(ys.leave)}</b></span>
            <span>days{ys.planned ? ` · ${fmtDays(ys.planned)} of them planned` : ""}</span>
          </span>
        </div>
        <span className="wd2-stepper">
          <button className="icon-button" aria-label="Previous year" onClick={() => onAnchor(`${year - 1}-01-01`)}>
            <Icon name="back" size={16} />
          </button>
          <b>{year}</b>
          <button className="icon-button" aria-label="Next year" onClick={() => onAnchor(`${year + 1}-01-01`)}>
            <Icon name="forward" size={16} />
          </button>
        </span>
      </div>

      <section className="wd2-glance" aria-label="Year at a glance">
        <div className="wd2-glance-head">
          <h3>Every day of {year}</h3>
          <span className="wd2-legend">
            <span><i className="planned" /> Planned</span>
            <span><i className="off" /> Weekend or holiday</span>
            <button className="wd2-link" aria-pressed={table} onClick={() => setTable((v) => !v)}>
              {table ? "Show as calendar" : "Show as table"}
            </button>
          </span>
        </div>
        {table ? (
          <table className="wd2-table">
            <thead>
              <tr>
                <th scope="col">Month</th>
                <th scope="col">Office</th>
                <th scope="col">Home</th>
                <th scope="col">Leave</th>
                <th scope="col">Open</th>
                <th scope="col">Office share</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.months.map((m) => (
                <tr key={m.name}>
                  <th scope="row">{m.name}</th>
                  <td>{fmtDays(m.split.office)}</td>
                  <td>{fmtDays(m.split.home)}</td>
                  <td>{fmtDays(m.split.leave)}</td>
                  <td>{fmtDays(m.split.unset)}</td>
                  <td>{m.split.share === null ? "–" : m.split.share + "%"}</td>
                  <td>{statusFor(m.split, rule, today)?.text || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="wd2-heat" role="table" aria-label={`Work mode by day, ${year}`}>
            <div className="wd2-heat-row wd2-ruler" aria-hidden="true">
              <span />
              <span className="wd2-heat-days">
                {Array.from({ length: 31 }, (_, i) => (
                  <span key={i}>{[1, 8, 15, 22, 29].includes(i + 1) ? i + 1 : ""}</span>
                ))}
              </span>
              <span>Split · office share</span>
            </div>
            {data.months.map((m, i) => {
              const status = statusFor(m.split, rule, today),
                current = m.start.slice(0, 7) === today.slice(0, 7);
              return (
                <div
                  role="row"
                  key={m.name}
                  className={"wd2-heat-row" + (i % 3 === 0 && i ? " quarter" : "") + (current ? " current" : "")}
                >
                  <span role="rowheader">
                    <small>{i % 3 === 0 ? "Q" + (i / 3 + 1) : ""}</small>
                    {m.name}
                  </span>
                  <span className="wd2-heat-days">
                    {m.days.map((d) => (
                      <button
                        role="cell"
                        key={d.date}
                        className={cellClass(d, today)}
                        style={cellStyle(d)}
                        title={`${longDate(d.date, { weekday: "short", day: "numeric", month: "short" })} · ${d.label}`}
                        aria-label={`${longDate(d.date, { weekday: "long", day: "numeric", month: "long" })}, ${d.label}`}
                        onClick={() => onPlan(d.date)}
                      />
                    ))}
                  </span>
                  <span role="cell" className="wd2-heat-sum">
                    <SplitBar split={m.split} thin />
                    <b>{m.split.share === null ? "–" : m.split.share + "%"}</b>
                    {status && <span className={"wd2-status " + status.tone}>{status.text}</span>}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="wd2-quarters" aria-label="Quarters">
        {data.quarters.map((q) => {
          const s = statusFor(q.split, rule, today);
          return (
            <div key={q.name}>
              <span className="wd2-muted">
                {q.name} · {q.months}
              </span>
              <span>
                <span className="wd2-mid">{q.split.share === null ? "–" : q.split.share + "%"}</span>{" "}
                {s && (
                  <span className={"wd2-status " + s.tone}>
                    {s.tone === "met" ? "✓ " : s.tone === "below" ? "✕ " : ""}
                    {s.text}
                  </span>
                )}
              </span>
              <SplitBar split={q.split} thin />
              <span className="wd2-muted">
                {fmtDays(q.split.office)} office · {fmtDays(q.split.home)} home · {fmtDays(q.split.leave)} leave
              </span>
            </div>
          );
        })}
      </section>

      <div className="wd2-bottom">
        <section aria-label="Targets">
          <div className="wd2-section-title">
            <h3>Targets</h3>
            <button className="wd2-link" onClick={props.onSettings}>
              Edit
            </button>
          </div>
          {data.targets.length ? (
            <ul className="wd2-lines">
              {data.targets.map(({ rule: t, met, done, current }) => (
                <li key={t.id}>
                  {targetText(t)}
                  <span className="wd2-muted">
                    {done ? ` · ${met === done ? "✓" : "✕"} ${met} of ${done} met` : ""}
                    {current !== null ? ` · this ${t.period} ${current ? "on track" : "at risk"}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="wd2-muted">
              No targets yet ·{" "}
              <button className="wd2-link" onClick={props.onSettings}>
                Add one
              </button>
            </p>
          )}
        </section>
        <section aria-label="Leave left">
          <div className="wd2-section-title">
            <h3>Leave left</h3>
            <button className="wd2-link" onClick={props.onLeave}>
              Manage
            </button>
          </div>
          <LeaveLeft w={w} today={today} onLeave={props.onLeave} />
        </section>
        <section aria-label="To do">
          <div className="wd2-section-title">
            <h3>To do</h3>
          </div>
          <TodoList
            w={w}
            year={year}
            today={today}
            disabled={props.disabled}
            change={props.change}
            onPlan={onPlan}
          />
        </section>
      </div>
    </div>
  );
}

function MonthView(props: Props) {
  const { doc, w, anchor, today, onAnchor, change } = props,
    [selected, setSelected] = useState(
      anchor.slice(0, 7) === today.slice(0, 7) ? today : anchor,
    ),
    rule = primaryTarget(w),
    month = periodRange(anchor, "month"),
    split = useMemo(() => splitFor(w, month.start, month.end, today), [w, month.start, today]),
    quarter = periodRange(today, "quarter"),
    q = useMemo(() => splitFor(w, quarter.start, [today, quarter.end].sort()[0], today), [w, quarter.start, today]),
    y = useMemo(() => splitFor(w, today.slice(0, 4) + "-01-01", today, today), [w, today]),
    title = longDate(month.start, { month: "long", year: "numeric" }),
    sel = selected.slice(0, 7) === month.start.slice(0, 7) ? selected : null,
    leave = leaveBalances(w, today, today).types.filter((t: any) => !t.archived && t.allowance !== null),
    pending = splitFor(w, today.slice(0, 4) + "-01-01", today, today).pending;
  const recordedNote =
    split.planned > 0
      ? `Recorded so far: ${fmtDays(split.recorded.office)} office · ${fmtDays(split.recorded.home)} home${split.recorded.leave ? ` · ${fmtDays(split.recorded.leave)} leave` : ""}. The rest are plans.`
      : "";
  return (
    <div className="wd2-month-view">
      <div className="wd2-month-head">
        <h3>{title}</h3>
        <button className="icon-button" aria-label="Previous month" onClick={() => onAnchor(dayAfter(month.start, -1))}>
          <Icon name="back" size={18} />
        </button>
        <button className="icon-button" aria-label="Next month" onClick={() => onAnchor(dayAfter(month.end))}>
          <Icon name="forward" size={18} />
        </button>
      </div>
      <div className="wd2-cal" role="grid" aria-label={`Work mode by day, ${title}`}>
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <span key={i} className="wd2-cal-wd" aria-hidden="true">
            {d}
          </span>
        ))}
        {monthGrid(month.start).map((d) => {
          const info = dayInfo(w, d, today),
            inMonth = d.slice(0, 7) === month.start.slice(0, 7);
          return (
            <button
              key={d}
              role="gridcell"
              className={"wd2-cal-day" + (inMonth ? "" : " out") + (info.off ? " off" : "") + (d === today ? " today" : "") + (d === sel ? " selected" : "") + (info.holiday ? " holiday" : "")}
              aria-label={`${longDate(d, { weekday: "long", day: "numeric", month: "long" })}, ${info.label}`}
              aria-selected={d === sel}
              onClick={() => (inMonth ? setSelected(d) : (onAnchor(d), setSelected(d)))}
            >
              <span className="wd2-cal-num">{+d.slice(8)}</span>
              <span className={cellClass(info, today) + " mark"} style={cellStyle(info)} aria-hidden="true" />
            </button>
          );
        })}
      </div>
      <p className="wd2-legend wd2-cal-legend">
        <span><i data-k="office" /> Office</span>
        <span><i data-k="home" /> Home</span>
        <span><i data-k="leave" /> Leave</span>
        <span>outlined = planned</span>
      </p>

      <section className="wd2-mv-section" aria-label="Monthly split">
        <div className="wd2-section-title">
          <h3>Monthly split</h3>
          <span className="wd2-share-line">{shareLine(split, rule, today)}</span>
        </div>
        <SplitBar
          split={split}
          target={rule?.value}
          label={`${title}: Office ${fmtDays(split.office)}, Home ${fmtDays(split.home)}, Leave ${fmtDays(split.leave)} days including plans`}
        />
        <div className="wd2-counts">
          <span><b>{fmtDays(split.office)}</b> Office</span>
          <span><b>{fmtDays(split.home)}</b> Home</span>
          <span><b>{fmtDays(split.leave)}</b> Leave</span>
        </div>
        {recordedNote && <span className="wd2-muted">{recordedNote}</span>}
      </section>

      {sel && (
        <section className="wd2-mv-section" aria-label="Selected day">
          <div className="wd2-mv-day">
            <h3>
              {sel === today ? "Today" : longDate(sel, { weekday: "long" })}{" "}
              <span>
                · {sel === today ? longDate(sel, { weekday: "short" }) + " " : ""}
                {+sel.slice(8)}
                {sel === today ? "" : " " + longDate(sel, { month: "short" })}
              </span>
            </h3>
            <WorkMode compact doc={doc} date={sel} disabled={props.disabled} onChange={change} />
          </div>
        </section>
      )}
      <section className="wd2-mv-section" aria-label="Summary">
        <dl className="wd2-facts">
          <div>
            <dt>Q{Math.floor((+today.slice(5, 7) - 1) / 3) + 1} so far</dt>
            <dd>{shareLine(q, rule, today)}</dd>
          </div>
          <div>
            <dt>{today.slice(0, 4)} so far</dt>
            <dd>{shareLine(y, rule, today)}</dd>
          </div>
          {!!leave.length && (
            <div>
              <dt>Leave left</dt>
              <dd>{leave.map((t: any) => `${t.name} ${fmtDays(t.remaining / 2)}`).join(" · ")}</dd>
            </div>
          )}
          {!!pending.length && (
            <div>
              <dt>
                {pending.length} past {pending.length === 1 ? "plan" : "plans"} to confirm
              </dt>
              <dd>
                <button className="wd2-link" disabled={props.disabled} onClick={() => change((d) => confirmPlans(d, pending))}>
                  Confirm
                </button>{" "}
                <button className="wd2-link" onClick={() => props.onPlan(pending[0])}>
                  Review
                </button>
              </dd>
            </div>
          )}
        </dl>
      </section>
    </div>
  );
}

export function WorkdaysOverview(props: Props) {
  return props.phone ? <MonthView {...props} /> : <YearView {...props} />;
}
