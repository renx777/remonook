import { validEventDate, localDate } from "./calendar-events.mjs";
export const HALVES = ["am", "pm"],
  MODES = ["WFH", "WFO", "Leave"];
export const dayAfter = (date, n = 1) => {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const weekday = (date) => new Date(date + "T12:00:00Z").getUTCDay();
export function datesBetween(start, end) {
  if (!validEventDate(start) || !validEventDate(end) || end < start)
    throw Error("Choose a valid date range.");
  const out = [];
  for (let d = start; d <= end; d = dayAfter(d)) {
    if (out.length >= 3660) throw Error("Choose a range under ten years.");
    out.push(d);
  }
  return out;
}
export function periodRange(date, period = "month") {
  const d = new Date(date + "T12:00:00Z");
  if (period === "week") {
    const start = dayAfter(date, -((weekday(date) + 6) % 7));
    return {
      start: start < "1900-01-01" ? "1900-01-01" : start,
      end: [dayAfter(start, 6), "2199-12-31"].sort()[0],
    };
  }
  d.setUTCDate(1);
  if (period === "quarter") d.setUTCMonth(Math.floor(d.getUTCMonth() / 3) * 3);
  const start = d.toISOString().slice(0, 10);
  d.setUTCMonth(d.getUTCMonth() + (period === "quarter" ? 3 : 1));
  d.setUTCDate(0);
  return { start, end: d.toISOString().slice(0, 10) };
}
const defaults = ["Sick", "Casual", "Planned", "Annual"];
export const leaveId = (name) => "legacy-" + name.toLowerCase();
export const defaultSchedule = (date) => ({
  effectiveFrom: date.slice(0, 7) + "-01",
  weekdays: [1, 2, 3, 4, 5],
  startDate: "",
  excludeLeave: true,
});
export function migrateWorkdays(old, date = localDate()) {
  if (old?.version === 2) return old;
  const leaveTypes = Object.fromEntries(
    defaults.map((name) => [
      leaveId(name),
      { id: leaveId(name), name, color: "#c59a50", archived: false },
    ]),
  );
  const entries = {};
  for (const [date, e] of Object.entries(old?.entries || {})) {
    entries[date] = {};
    for (const kind of ["plan", "actual"])
      if (e[kind]) {
        const r = e[kind],
          slot = {
            mode: r.status,
            ...(r.status === "Leave" ? { leaveTypeId: leaveId(r.detail) } : {}),
            updatedAt: r.updatedAt,
          };
        entries[date][kind] = { am: { ...slot }, pm: { ...slot } };
      }
  }
  const leaveYears = {};
  for (const [year, a] of Object.entries(old?.allowances || {}))
    leaveYears[year + "-01-01"] = {
      start: year + "-01-01",
      quotas: Object.fromEntries(
        defaults.map((name) => [leaveId(name), a[name] * 2]),
      ),
      adjustments: {},
    };
  const schedules = (
    old?.policies?.length ? old.policies : [defaultSchedule(date)]
  ).map((p) => ({
    effectiveFrom: p.effectiveFrom,
    weekdays: p.weekdays,
    startDate: p.startDate,
    excludeLeave: p.excludeLeave,
  }));
  const targets = {};
  for (const p of old?.policies || []) {
    const id = "legacy-" + p.effectiveFrom,
      next = (old.policies || [])
        .filter((q) => q.effectiveFrom > p.effectiveFrom)
        .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))[0];
    targets[id] = {
      id,
      mode: "WFO",
      comparison: "min",
      unit: p.goalMode === "percentage" ? "percent" : "days",
      period: p.goalMode === "weekly" ? "week" : "month",
      value: p.goalValue,
      effectiveFrom: p.effectiveFrom,
      legacy: true,
      ...(next ? { endDate: dayAfter(next.effectiveFrom, -1) } : {}),
    };
  }
  return {
    version: 2,
    enabled: old?.enabled || false,
    leaveYearStart: "01-01",
    leaveYearPolicies: { "1900-01-01": "01-01" },
    schedules,
    entries,
    holidays: { ...old?.holidays },
    leaveTypes,
    leaveYears,
    targets,
  };
}
export const workdaysV2 = (doc, date = localDate()) =>
  migrateWorkdays(doc.web.workdays, date);
const object = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const idOK = (id) =>
  typeof id === "string" &&
  /^[a-zA-Z0-9_-]{1,80}$/.test(id) &&
  !["__proto__", "constructor", "prototype"].includes(id);
const boundedMap = (o, max) => object(o) && Object.keys(o).length <= max;
const validUnits = (n) => Number.isSafeInteger(n) && n >= 0 && n <= 20000;
export function validateWorkdaysV2(w) {
  const bad = () => {
    throw Error("Invalid Workdays data.");
  };
  if (
    !object(w) ||
    w.version !== 2 ||
    typeof w.enabled !== "boolean" ||
    !/^\d{2}-\d{2}$/.test(w.leaveYearStart) ||
    !validEventDate("2001-" + w.leaveYearStart) ||
    !Array.isArray(w.schedules) ||
    !w.schedules.length ||
    w.schedules.length > 200 ||
    !boundedMap(w.entries, 10000) ||
    !boundedMap(w.holidays, 3000) ||
    !boundedMap(w.leaveTypes, 100) ||
    !boundedMap(w.leaveYears, 300) ||
    !boundedMap(w.targets, 200)
  )
    bad();
  if (w.leaveYearPolicies !== undefined) {
    if (!boundedMap(w.leaveYearPolicies, 200)) bad();
    for (const [date, monthDay] of Object.entries(w.leaveYearPolicies))
      if (
        !validEventDate(date) ||
        typeof monthDay !== "string" ||
        !validEventDate("2001-" + monthDay)
      )
        bad();
  }
  const seen = new Set();
  for (const p of w.schedules) {
    if (
      !validEventDate(p.effectiveFrom) ||
      seen.has(p.effectiveFrom) ||
      !Array.isArray(p.weekdays) ||
      !p.weekdays.length ||
      p.weekdays.length > 7 ||
      new Set(p.weekdays).size !== p.weekdays.length ||
      p.weekdays.some((d) => !Number.isInteger(d) || d < 0 || d > 6) ||
      typeof p.excludeLeave !== "boolean" ||
      typeof p.startDate !== "string" ||
      (p.startDate && !validEventDate(p.startDate))
    )
      bad();
    seen.add(p.effectiveFrom);
  }
  for (const [id, t] of Object.entries(w.leaveTypes))
    if (
      !idOK(id) ||
      t.id !== id ||
      typeof t.name !== "string" ||
      !t.name.trim() ||
      t.name.length > 60 ||
      !/^#[a-f0-9]{6}$/i.test(t.color) ||
      typeof t.archived !== "boolean"
    )
      bad();
  for (const [date, e] of Object.entries(w.entries)) {
    if (
      !validEventDate(date) ||
      !object(e) ||
      Object.keys(e).some((k) => !["plan", "actual"].includes(k))
    )
      bad();
    for (const kind of ["plan", "actual"])
      if (e[kind]) {
        if (
          !object(e[kind]) ||
          Object.keys(e[kind]).some((k) => !HALVES.includes(k))
        )
          bad();
        for (const h of HALVES)
          if (e[kind][h]) {
            const s = e[kind][h];
            if (
              !object(s) ||
              !MODES.includes(s.mode) ||
              !Number.isSafeInteger(s.updatedAt) ||
              s.updatedAt < 0 ||
              (s.mode === "Leave" &&
                !Object.hasOwn(w.leaveTypes, s.leaveTypeId)) ||
              (s.mode !== "Leave" && s.leaveTypeId !== undefined)
            )
              bad();
          }
      }
  }
  for (const [date, name] of Object.entries(w.holidays))
    if (
      !validEventDate(date) ||
      typeof name !== "string" ||
      !name.trim() ||
      name.length > 160
    )
      bad();
  for (const [start, y] of Object.entries(w.leaveYears)) {
    if (
      !validEventDate(start) ||
      y.start !== start ||
      !boundedMap(y.quotas, 100) ||
      !boundedMap(y.adjustments, 100)
    )
      bad();
    for (const [id, n] of Object.entries(y.quotas))
      if (!Object.hasOwn(w.leaveTypes, id) || (n !== null && !validUnits(n)))
        bad();
    for (const [id, n] of Object.entries(y.adjustments))
      if (
        !Object.hasOwn(w.leaveTypes, id) ||
        !Number.isSafeInteger(n) ||
        Math.abs(n) > 20000
      )
        bad();
  }
  for (const [id, t] of Object.entries(w.targets)) {
    if (
      !idOK(id) ||
      t.id !== id ||
      !["WFH", "WFO"].includes(t.mode) ||
      !["min", "max"].includes(t.comparison) ||
      !["days", "percent"].includes(t.unit) ||
      !["week", "month", "quarter"].includes(t.period) ||
      !Number.isFinite(t.value) ||
      t.value < 0 ||
      t.value > (t.unit === "percent" ? 100 : 92) ||
      !Number.isInteger(t.value * 2) ||
      !validEventDate(t.effectiveFrom) ||
      typeof t.legacy !== "boolean" ||
      (t.endDate !== undefined &&
        (!validEventDate(t.endDate) || t.endDate < t.effectiveFrom))
    )
      bad();
    if (
      !t.legacy &&
      periodRange(t.effectiveFrom, t.period).start !== t.effectiveFrom
    )
      bad();
  }
}
/** @param {any} doc @param {(w:any)=>any} fn */
export function updateWorkdaysV2(doc, fn) {
  const next = fn(workdaysV2(doc));
  validateWorkdaysV2(next);
  return { ...doc, web: { ...doc.web, workdays: next } };
}
export function scheduleOn(w, date) {
  return (
    [...w.schedules]
      .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))
      .find((p) => p.effectiveFrom <= date) || null
  );
}
export function scheduled(w, date) {
  const p = scheduleOn(w, date);
  return (
    !!p &&
    (!p.startDate || p.startDate <= date) &&
    p.weekdays.includes(weekday(date))
  );
}
export function workdayState(w, date, today = localDate()) {
  const e = w.entries[date] || {},
    actual = date <= today ? e.actual : undefined,
    plan = e.plan;
  const label = (slots) =>
    HALVES.map((h) => {
      const s = slots?.[h];
      return s?.mode === "Leave"
        ? w.leaveTypes[s.leaveTypeId]?.name || "Leave"
        : s?.mode === "WFH"
          ? "Home"
          : s?.mode === "WFO"
            ? "Office"
            : "Unrecorded";
    });
  const labels = label(actual || plan),
    modes = HALVES.map((h) => (actual || plan)?.[h]?.mode || "");
  return {
    actual,
    plan,
    holiday: w.holidays[date] || "",
    pending: date <= today && HALVES.some((h) => plan?.[h] && !actual?.[h]),
    planned: !actual && !!plan,
    label: labels[0] === labels[1] ? labels[0] : labels.join(" / "),
    modes,
  };
}
export function setAllocations(
  doc,
  dates,
  { mode, leaveTypeId = "", half = "full", remaining = "WFH", intent = "auto" },
  today = localDate(),
) {
  if (
    !Array.isArray(dates) ||
    !dates.length ||
    dates.length > 366 ||
    dates.some((d) => !validEventDate(d)) ||
    !MODES.includes(mode) ||
    !["full", "am", "pm"].includes(half) ||
    !["WFH", "WFO"].includes(remaining) ||
    !["auto", "plan", "actual"].includes(intent)
  )
    throw Error("Choose valid dates and a work mode.");
  return updateWorkdaysV2(doc, (w) => {
    if (
      mode === "Leave" &&
      (!Object.hasOwn(w.leaveTypes, leaveTypeId) ||
        w.leaveTypes[leaveTypeId].archived)
    )
      throw Error("Choose an active leave type.");
    const entries = { ...w.entries };
    for (const date of new Set(dates)) {
      if (intent === "actual" && date > today)
        throw Error("Future dates can only be planned.");
      const kind = intent === "plan" || date > today ? "plan" : "actual",
        slot = {
          mode,
          ...(mode === "Leave" ? { leaveTypeId } : {}),
          updatedAt: Date.now(),
        };
      entries[date] = {
        ...entries[date],
        [kind]: {
          am:
            half === "pm"
              ? { mode: remaining, updatedAt: slot.updatedAt }
              : { ...slot },
          pm:
            half === "am"
              ? { mode: remaining, updatedAt: slot.updatedAt }
              : { ...slot },
        },
      };
    }
    return { ...w, entries };
  });
}
export function clearWorkday(doc, date, kind) {
  if (!validEventDate(date) || !["actual", "plan", "holiday"].includes(kind))
    throw Error("Choose a record to clear.");
  return updateWorkdaysV2(doc, (w) => {
    if (kind === "holiday") {
      const holidays = { ...w.holidays };
      delete holidays[date];
      return { ...w, holidays };
    }
    const entries = { ...w.entries },
      e = { ...entries[date] };
    delete e[kind];
    if (Object.keys(e).length) entries[date] = e;
    else delete entries[date];
    return { ...w, entries };
  });
}
export function confirmPlans(doc, dates, today = localDate()) {
  return updateWorkdaysV2(doc, (w) => {
    if (
      dates.length > 366 ||
      dates.some((d) => !validEventDate(d) || d > today)
    )
      throw Error("Only past or today’s plans can be confirmed.");
    const entries = { ...w.entries };
    for (const date of dates) {
      const e = entries[date];
      if (e?.plan) entries[date] = { ...e, actual: { ...e.plan, ...e.actual } };
    }
    return { ...w, entries };
  });
}
export function withLeaveYearStart(w, monthDay, effectiveDate) {
  const candidate = effectiveDate.slice(0, 4) + "-" + monthDay,
    start =
      effectiveDate >= candidate
        ? candidate
        : +effectiveDate.slice(0, 4) - 1 + "-" + monthDay;
  return {
    ...w,
    leaveYearStart: monthDay,
    leaveYearPolicies: {
      ...(w.leaveYearPolicies || { "1900-01-01": w.leaveYearStart }),
      [start]: monthDay,
    },
  };
}
export function leaveYear(w, date) {
  const policy = Object.entries(
      w.leaveYearPolicies || { "1900-01-01": w.leaveYearStart },
    )
      .filter(([start]) => start <= date)
      .sort((a, b) => b[0].localeCompare(a[0]))[0],
    monthDay = policy?.[1] || "01-01",
    candidate = date.slice(0, 4) + "-" + monthDay;
  return date >= candidate ? candidate : +date.slice(0, 4) - 1 + "-" + monthDay;
}
export function leaveBalances(w, date, today = localDate()) {
  const start = leaveYear(w, date),
    anniversary = +start.slice(0, 4) + 1 + start.slice(4),
    next = [
      anniversary,
      ...Object.keys(w.leaveYearPolicies || {}).filter((d) => d > start),
    ].sort()[0],
    year = w.leaveYears[start];
  const result = Object.fromEntries(
    Object.values(w.leaveTypes).map((t) => [
      t.id,
      {
        ...t,
        allowance: year?.quotas[t.id] ?? null,
        adjustment: year?.adjustments[t.id] || 0,
        used: 0,
        planned: 0,
      },
    ]),
  );
  for (const [d, e] of Object.entries(w.entries)) {
    if (d < start || d >= next || !scheduled(w, d) || w.holidays[d]) continue;
    for (const half of HALVES) {
      const actual = d <= today ? e.actual?.[half] : null,
        plan = d > today ? e.plan?.[half] : null;
      if (actual?.mode === "Leave") result[actual.leaveTypeId].used++;
      else if (plan?.mode === "Leave") result[plan.leaveTypeId].planned++;
    }
  }
  return {
    start,
    end: dayAfter(next, -1),
    types: Object.values(result).map((t) => ({
      ...t,
      remaining:
        t.allowance === null ? null : t.allowance + t.adjustment - t.used,
      available:
        t.allowance === null
          ? null
          : t.allowance + t.adjustment - t.used - t.planned,
    })),
  };
}
export function summarizeWorkdays(w, start, end, today = localDate()) {
  const result = {
    home: 0,
    office: 0,
    leave: 0,
    plannedHome: 0,
    plannedOffice: 0,
    plannedLeave: 0,
    eligible: 0,
    projectedEligible: 0,
    missing: 0,
    exceptions: 0,
    pending: [],
    rows: [],
  };
  for (const date of datesBetween(start, end)) {
    const e = w.entries[date] || {},
      p = scheduleOn(w, date),
      eligible = scheduled(w, date) && !w.holidays[date],
      row = {
        date,
        home: 0,
        office: 0,
        leave: 0,
        plannedHome: 0,
        plannedOffice: 0,
        plannedLeave: 0,
      };
    if (date <= today && HALVES.some((h) => e.plan?.[h] && !e.actual?.[h]))
      result.pending.push(date);
    for (const half of HALVES) {
      const actual = date <= today ? e.actual?.[half] : null,
        plan = date > today ? e.plan?.[half] : null;
      if (!eligible) {
        if (actual) result.exceptions += 0.5;
        continue;
      }
      if (!p.excludeLeave || actual?.mode !== "Leave") result.eligible += 0.5;
      if (!p.excludeLeave || (actual || plan)?.mode !== "Leave")
        result.projectedEligible += 0.5;
      if (actual) {
        const key = { WFH: "home", WFO: "office", Leave: "leave" }[actual.mode];
        row[key] += 0.5;
        result[key] += 0.5;
      } else if (plan) {
        const key = {
          WFH: "plannedHome",
          WFO: "plannedOffice",
          Leave: "plannedLeave",
        }[plan.mode];
        row[key] += 0.5;
        result[key] += 0.5;
      } else if (date < today) result.missing += 0.5;
    }
    result.rows.push(row);
  }
  return result;
}
export function targetProgress(w, rule, date, today = localDate()) {
  const range = periodRange(date, rule.period),
    start = range.start > rule.effectiveFrom ? range.start : rule.effectiveFrom,
    end = rule.endDate && rule.endDate < range.end ? rule.endDate : range.end;
  if (start > end) return null;
  const s = summarizeWorkdays(w, start, end, today),
    key = rule.mode === "WFH" ? "home" : "office",
    plannedKey = rule.mode === "WFH" ? "plannedHome" : "plannedOffice",
    round = (n) =>
      rule.comparison === "min"
        ? Math.ceil(n * (rule.legacy ? 1 : 2) - 1e-9) / (rule.legacy ? 1 : 2)
        : Math.floor(n * 2 + 1e-9) / 2;
  const prorate = datesBetween(range.start, range.end).filter((d) =>
      scheduled(w, d),
    ).length,
    active = datesBetween(start, end).filter((d) => scheduled(w, d)).length;
  const raw = (denominator) =>
    rule.unit === "percent"
      ? (denominator * rule.value) / 100
      : rule.legacy
        ? Math.min(denominator, (rule.value * active) / Math.max(1, prorate))
        : rule.value;
  const target = round(raw(s.eligible)),
    projectedTarget = round(raw(s.projectedEligible)),
    actual = s[key],
    projected = actual + s[plannedKey];
  return {
    ...range,
    rule,
    actual,
    projected,
    target,
    projectedTarget,
    eligible: s.eligible,
    projectedEligible: s.projectedEligible,
    missing: s.missing,
    noDays: s.eligible === 0,
    met:
      s.eligible > 0 &&
      (rule.comparison === "min" ? actual >= target : actual <= target),
    projectedMet:
      s.projectedEligible > 0 &&
      (rule.comparison === "min"
        ? projected >= projectedTarget
        : projected <= projectedTarget),
  };
}
export function targetWarnings(w, date, today = localDate()) {
  const out = [];
  for (const period of ["week", "month", "quarter"]) {
    const active = Object.values(w.targets)
      .filter((t) => t.period === period)
      .map((t) => targetProgress(w, t, date, today))
      .filter(Boolean);
    for (const mode of ["WFH", "WFO"]) {
      const rules = active.filter((p) => p.rule.mode === mode),
        min = Math.max(
          0,
          ...rules
            .filter((p) => p.rule.comparison === "min")
            .map((p) => p.projectedTarget),
        ),
        max = Math.min(
          Infinity,
          ...rules
            .filter((p) => p.rule.comparison === "max")
            .map((p) => p.projectedTarget),
        );
      if (min > max) out.push(`${period}: ${mode} minimum exceeds its limit.`);
    }
    const mins = ["WFH", "WFO"].map((mode) =>
      Math.max(
        0,
        ...active
          .filter((p) => p.rule.mode === mode && p.rule.comparison === "min")
          .map((p) => p.projectedTarget),
      ),
    );
    if (mins[0] + mins[1] > (active[0]?.projectedEligible ?? Infinity))
      out.push(
        `${period}: minimum Home and Office days exceed available workdays.`,
      );
  }
  return out;
}
export function routinePreview(w, start, end, pattern, today = localDate()) {
  if (datesBetween(start, end).length > 366)
    throw Error("Plan up to one year at a time.");
  return datesBetween(start, end)
    .filter(
      (d) =>
        d >= today &&
        scheduled(w, d) &&
        !w.holidays[d] &&
        ["WFH", "WFO"].includes(pattern[weekday(d)]),
    )
    .map((date) => ({
      date,
      mode: pattern[weekday(date)],
      conflict: !!w.entries[date]?.plan,
      actual: !!w.entries[date]?.actual,
    }));
}
export function applyRoutine(doc, rows, replaceDates = []) {
  if (
    rows.length > 366 ||
    rows.some(
      (r) => !validEventDate(r.date) || !["WFH", "WFO"].includes(r.mode),
    )
  )
    throw Error("Invalid routine.");
  return updateWorkdaysV2(doc, (w) => {
    const entries = { ...w.entries };
    for (const r of rows) {
      if (
        r.date < localDate() ||
        !scheduled(w, r.date) ||
        w.holidays[r.date] ||
        entries[r.date]?.actual ||
        (entries[r.date]?.plan && !replaceDates.includes(r.date))
      )
        continue;
      const slot = { mode: r.mode, updatedAt: Date.now() };
      entries[r.date] = {
        ...entries[r.date],
        plan: { am: { ...slot }, pm: { ...slot } },
      };
    }
    return { ...w, entries };
  });
}
export function importHolidaysV2(doc, rows, replaceDates = []) {
  if (rows.length > 366) throw Error("Import up to 366 holidays at a time.");
  return updateWorkdaysV2(doc, (w) => {
    const holidays = { ...w.holidays };
    for (const r of rows) {
      if (
        !validEventDate(r.date) ||
        typeof r.name !== "string" ||
        !r.name.trim() ||
        r.name.length > 160
      )
        throw Error("Check each holiday date and name.");
      if (
        holidays[r.date] &&
        holidays[r.date] !== r.name &&
        !replaceDates.includes(r.date)
      )
        continue;
      holidays[r.date] = r.name.trim();
    }
    return { ...w, holidays };
  });
}
