import {validateWorkdaysV2} from './workdays-v2.mjs';
import { validEventDate, localDate } from "./calendar-events.mjs";

export const LEAVE_TYPES = ["Sick", "Casual", "Planned", "Annual"];
export const WORK_STATUSES = ["WFH", "WFO", "Leave"];
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const fail = () => {
  throw Error("Invalid Workdays data.");
};
export const monthStart = (date) => date.slice(0, 7) + "-01";
export function dayAfter(date, n = 1) {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function monthEnd(date) {
  const d = new Date(date.slice(0, 7) + "-01T12:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}
export function dateRange(start, end) {
  if (!validEventDate(start) || !validEventDate(end) || end < start)
    throw Error("Choose a valid date range.");
  const result = [];
  for (let d = start; d <= end; d = dayAfter(d)) {
    if (result.length >= 36600) throw Error("Date range is too large.");
    result.push(d);
  }
  return result;
}
export const weekday = (date) => new Date(date + "T12:00:00Z").getUTCDay();
export const defaultPolicy = (date) => ({
  effectiveFrom: monthStart(date),
  weekdays: [1, 2, 3, 4, 5],
  goalMode: "weekly",
  goalValue: 3,
  excludeLeave: true,
  startDate: "",
});
export const emptyWorkdays = () => ({
  version: 1,
  enabled: false,
  view: "day",
  policies: [],
  entries: {},
  holidays: {},
  allowances: {},
});
export const workdays = (doc) => doc.web.workdays || emptyWorkdays();
export function validateWorkdays(w) {
  if (w === undefined) return;
  if(w?.version===2)return validateWorkdaysV2(w);
  if (
    !w ||
    w.version !== 1 ||
    typeof w.enabled !== "boolean" ||
    !["day", "month"].includes(w.view) ||
    !Array.isArray(w.policies) ||
    w.policies.length > 200 ||
    [w.entries, w.holidays, w.allowances].some(
      (v) => !v || typeof v !== "object" || Array.isArray(v),
    )
  )
    fail();
  const effective = new Set();
  for (const p of w.policies) {
    if (
      !p ||
      !validEventDate(p.effectiveFrom) ||
      effective.has(p.effectiveFrom) ||
      !Array.isArray(p.weekdays) ||
      !p.weekdays.length ||
      p.weekdays.length > 7 ||
      new Set(p.weekdays).size !== p.weekdays.length ||
      p.weekdays.some((n) => !Number.isInteger(n) || n < 0 || n > 6) ||
      !["weekly", "monthly", "percentage"].includes(p.goalMode) ||
      !Number.isInteger(p.goalValue) ||
      p.goalValue < 0 ||
      p.goalValue > { weekly: 7, monthly: 31, percentage: 100 }[p.goalMode] ||
      typeof p.excludeLeave !== "boolean" ||
      typeof p.startDate !== "string" ||
      (p.startDate && !validEventDate(p.startDate))
    )
      fail();
    effective.add(p.effectiveFrom);
  }
  if (
    Object.keys(w.entries).length > 5000 ||
    Object.keys(w.holidays).length > 3000 ||
    Object.keys(w.allowances).length > 300
  )
    fail();
  for (const [date, e] of Object.entries(w.entries)) {
    if (
      !validEventDate(date) ||
      !e ||
      typeof e !== "object" ||
      Array.isArray(e) ||
      (!e.actual && !e.plan)
    )
      fail();
    for (const type of ["actual", "plan"])
      if (own(e, type)) {
        const r = e[type];
        if (
          !r ||
          typeof r !== "object" ||
          Array.isArray(r) ||
          !WORK_STATUSES.includes(r.status) ||
          typeof r.detail !== "string" ||
          r.detail.length > 160 ||
          (r.status === "Leave" && !LEAVE_TYPES.includes(r.detail)) ||
          !Number.isSafeInteger(r.updatedAt) ||
          r.updatedAt < 0
        )
          fail();
      }
  }
  for (const [date, name] of Object.entries(w.holidays))
    if (
      !validEventDate(date) ||
      typeof name !== "string" ||
      !name.trim() ||
      name.length > 160
    )
      fail();
  for (const [year, a] of Object.entries(w.allowances))
    if (
      !/^\d{4}$/.test(year) ||
      +year < 1900 ||
      +year > 2199 ||
      !a ||
      typeof a !== "object" ||
      Array.isArray(a) ||
      LEAVE_TYPES.some(
        (t) => !own(a, t) || !Number.isInteger(a[t]) || a[t] < 0 || a[t] > 366,
      )
    )
      fail();
}
export function updateWorkdays(doc, w) {
  validateWorkdays(w);
  return { ...doc, web: { ...doc.web, workdays: w } };
}
export function enableWorkdays(doc, enabled, date = localDate()) {
  const w = workdays(doc);
  return updateWorkdays(doc, {
    ...w,
    enabled,
    policies: w.policies.length ? w.policies : [defaultPolicy(date)],
  });
}
export function policyOn(w, date) {
  return (
    [...w.policies]
      .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))
      .find((p) => p.effectiveFrom <= date) || null
  );
}
export function dayState(w, date, today = localDate()) {
  const e = w.entries[date] || {};
  const actual = date <= today ? e.actual : undefined;
  const plan = e.plan;
  return {
    actual,
    plan,
    holiday: w.holidays[date] || "",
    pending: !!plan && !actual && date <= today,
    status: w.holidays[date] ? "Holiday" : actual?.status || plan?.status || "",
    planned: !actual && !!plan,
  };
}
export function setWorkdays(
  doc,
  dates,
  status,
  detail = "",
  today = localDate(),
  intent = "auto",
) {
  if (
    !Array.isArray(dates) ||
    !dates.length ||
    dates.length > 366 ||
    dates.some((d) => !validEventDate(d))
  )
    throw Error("Select between 1 and 366 valid dates.");
  const w = workdays(doc),
    entries = { ...w.entries },
    holidays = { ...w.holidays };
  for (const date of new Set(dates)) {
    if (status === "Clear") {
      delete entries[date];
      delete holidays[date];
      continue;
    }
    if (status === "Holiday") {
      const name = String(detail).trim();
      if (!name || name.length > 160)
        throw Error("Add a holiday name (up to 160 characters).");
      holidays[date] = name;
      delete entries[date];
      continue;
    }
    if (
      !WORK_STATUSES.includes(status) ||
      (status === "Leave" && !LEAVE_TYPES.includes(detail))
    )
      throw Error("Choose a valid work status and leave type.");
    if (intent === "confirm" && date > today)
      throw Error("Future dates can only be planned.");
    const field = date > today ? "plan" : intent === "plan" ? "plan" : "actual";
    entries[date] = {
      ...entries[date],
      [field]: {
        status,
        detail: status === "Leave" ? detail : "",
        updatedAt: Date.now(),
      },
    };
    delete holidays[date];
  }
  return updateWorkdays(doc, { ...w, entries, holidays });
}
export function saveWorkPolicy(doc, policy, year, allowance) {
  const w = workdays(doc);
  return updateWorkdays(doc, {
    ...w,
    policies: [
      ...w.policies.filter((p) => p.effectiveFrom !== policy.effectiveFrom),
      policy,
    ].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom)),
    allowances: { ...w.allowances, [year]: allowance },
  });
}
// Goals use the policy effective on each date. Partial weeks/months are prorated
// against scheduled days, capped to eligible days, then rounded up once.
export function workSummary(w, date, today = localDate()) {
  const days = dateRange(monthStart(date), monthEnd(date)),
    buckets = new Map();
  let completed = 0,
    home = 0,
    planned = 0,
    leave = 0,
    missing = 0;
  const pending = [];
  for (const d of days) {
    const p = policyOn(w, d);
    if (
      !p ||
      (p.startDate && d < p.startDate) ||
      !p.weekdays.includes(weekday(d))
    )
      continue;
    const monday = dayAfter(d, -((weekday(d) + 6) % 7));
    const key =
      p.effectiveFrom +
      ":" +
      (p.goalMode === "weekly" ? monday : monthStart(d));
    if (!buckets.has(key)) {
      const scheduled =
        p.goalMode === "weekly"
          ? p.weekdays.length
          : days.filter((x) => p.weekdays.includes(weekday(x))).length;
      buckets.set(key, { p, scheduled, active: 0, eligible: 0 });
    }
    const bucket = buckets.get(key);
    bucket.active++;
    const s = dayState(w, d, today);
    if (s.pending) pending.push(d);
    if (s.holiday) continue;
    if (s.actual?.status === "Leave") leave++;
    if (
      p.excludeLeave &&
      (s.actual?.status === "Leave" ||
        (!s.actual && d > today && s.plan?.status === "Leave"))
    )
      continue;
    if (s.actual?.status === "WFO") completed++;
    else if (s.actual?.status === "WFH") home++;
    else if (d > today && s.plan?.status === "WFO") planned++;
    else if (d < today && !s.actual) missing++;
    bucket.eligible++;
  }
  let rawTarget = 0,
    eligible = 0;
  for (const { p, scheduled, active, eligible: n } of buckets.values()) {
    eligible += n;
    rawTarget +=
      p.goalMode === "percentage"
        ? (n * p.goalValue) / 100
        : Math.min(n, (p.goalValue * active) / Math.max(1, scheduled));
  }
  const target = Math.ceil(rawTarget - 1e-9);
  return {
    target,
    completed,
    home,
    planned,
    leave,
    eligible,
    missing,
    pending,
    remaining: Math.max(0, target - completed - planned),
    met: completed >= target,
  };
}
export function leaveSummary(w, year, today = localDate()) {
  const result = Object.fromEntries(
    LEAVE_TYPES.map((t) => [
      t,
      { used: 0, planned: 0, allowance: w.allowances[year]?.[t] ?? null },
    ]),
  );
  for (const [date, e] of Object.entries(w.entries)) {
    const p = policyOn(w, date);
    if (
      !date.startsWith(year + "-") ||
      w.holidays[date] ||
      !p ||
      !p.weekdays.includes(weekday(date)) ||
      (p.startDate && date < p.startDate)
    )
      continue;
    if (date <= today && e.actual?.status === "Leave")
      result[e.actual.detail].used++;
    else if (date > today && e.plan?.status === "Leave")
      result[e.plan.detail].planned++;
  }
  return result;
}
const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];
export function parseHolidayText(text, year) {
  if (typeof text !== "string" || text.length > 100000)
    throw Error("Paste a holiday list under 100 KB.");
  const rows = [],
    errors = [],
    seen = new Set();
  let currentYear = String(year);
  for (const [i, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line) continue;
    if (/^20\d{2}$/.test(line)) {
      currentYear = line;
      continue;
    }
    if (/^(date|holiday|name)[\s,;|\t]/i.test(line)) continue;
    let m, date, name;
    if ((m = line.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[\s,;|\t]+(.+)$/))) {
      date = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
      name = m[4];
    } else if (
      (m = line.match(
        /^(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{4}))?[\s,;|\t]+(.+)$/,
      ))
    ) {
      date = `${m[3] || currentYear}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
      name = m[4];
    } else if (
      (m = line.match(
        /^(\d{1,2})[ -]([A-Za-z]+)(?:[ ,\-]+(\d{4}))?[\s,;|\t]+(.+)$/,
      ))
    ) {
      const month = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1;
      date = `${m[3] || currentYear}-${String(month).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
      name = m[4];
    } else if (
      (m = line.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})[\s,;|\t]+(.+)$/))
    ) {
      const month = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1;
      date = `${m[3]}-${String(month).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
      name = m[4];
    }
    name = name?.replace(/^[,;|\s]+/, "").trim();
    if (
      !date ||
      !validEventDate(date) ||
      !name ||
      name.length > 160 ||
      seen.has(date)
    ) {
      errors.push({ line: i + 1, text: line.slice(0, 120) });
      continue;
    }
    seen.add(date);
    rows.push({ date, name });
  }
  if (rows.length > 366) throw Error("Import up to 366 holidays at a time.");
  return { rows, errors };
}
export const holidayConflicts = (w, rows) =>
  rows.filter(
    (r) =>
      w.entries[r.date] ||
      (w.holidays[r.date] && w.holidays[r.date] !== r.name),
  );
export function importWorkHolidays(doc, rows, replace = false) {
  const w = workdays(doc),
    entries = { ...w.entries },
    holidays = { ...w.holidays };
  for (const r of rows) {
    if (!validEventDate(r.date) || typeof r.name !== "string" || !r.name.trim())
      throw Error("Invalid holiday.");
    const conflict =
      entries[r.date] || (holidays[r.date] && holidays[r.date] !== r.name);
    if (conflict && !replace) continue;
    holidays[r.date] = r.name;
    if (replace) delete entries[r.date];
  }
  return updateWorkdays(doc, { ...w, entries, holidays });
}
