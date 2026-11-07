import { useEffect, useState } from "react";
import {
  HALVES,
  datesBetween,
  dayAfter,
  periodRange,
  scheduleOn,
  scheduled,
  weekday,
} from "./workdays-v2.mjs";

export const MODE_NAME: Record<string, string> = {
  WFO: "Office",
  WFH: "Home",
  Leave: "Leave",
};

export function usePhone(query = "(max-width:760px)") {
  const [phone, setPhone] = useState(
    () => typeof window !== "undefined" && !!window.matchMedia?.(query).matches,
  );
  useEffect(() => {
    const media = window.matchMedia?.(query);
    if (!media) return;
    const change = () => setPhone(media.matches);
    change();
    media.addEventListener?.("change", change);
    return () => media.removeEventListener?.("change", change);
  }, [query]);
  return phone;
}

/** Sunday-first weeks covering the month that contains `date`. */
export function monthGrid(date: string) {
  const { start, end } = periodRange(date, "month");
  const first = dayAfter(start, -weekday(start)),
    last = dayAfter(end, 6 - weekday(end));
  return datesBetween(first, last);
}

export type DayInfo = {
  date: string;
  /** Not a scheduled workday, or a company holiday. */
  off: boolean;
  holiday: string;
  /** Mode per half day, empty when nothing is recorded or planned. */
  modes: string[];
  planned: boolean;
  pending: boolean;
  label: string;
};

export function dayInfo(w: any, date: string, today: string): DayInfo {
  const e = w.entries[date] || {},
    actual = date <= today ? e.actual : undefined,
    plan = e.plan,
    holiday = w.holidays[date] || "",
    off = !scheduled(w, date) || !!holiday,
    slots = actual || plan,
    modes = HALVES.map((h: string) => slots?.[h]?.mode || ""),
    planned = !actual && !!plan,
    pending =
      date <= today &&
      HALVES.some((h: string) => plan?.[h] && !actual?.[h]),
    names = modes.map((m: string) => MODE_NAME[m] || ""),
    what = names[0] === names[1] ? names[0] : names.filter(Boolean).join(" / ");
  const label = holiday
    ? holiday + " (holiday)"
    : what
      ? what + (planned ? " (planned)" : date <= today ? " (recorded)" : "")
      : off
        ? weekday(date) === 0 || weekday(date) === 6
          ? "Weekend"
          : "Not a workday"
        : date < today
          ? "No record"
          : "Not planned";
  return { date, off, holiday, modes, planned, pending, label };
}

export type Split = {
  start: string;
  end: string;
  office: number;
  home: number;
  leave: number;
  /** Eligible half days with neither a record nor a plan. */
  unset: number;
  /** Recorded only (no plans). */
  recorded: { office: number; home: number; leave: number };
  planned: number;
  pending: string[];
  missing: string[];
  /** Share denominator: recorded, planned and unrecorded past half days (leave excluded when the schedule says so). */
  base: number;
  share: number | null;
};

/** Counts in days (half days add 0.5). Past days count only what was recorded; future days count plans. */
export function splitFor(w: any, start: string, end: string, today: string): Split {
  const out: Split = {
    start,
    end,
    office: 0,
    home: 0,
    leave: 0,
    unset: 0,
    recorded: { office: 0, home: 0, leave: 0 },
    planned: 0,
    pending: [],
    missing: [],
    base: 0,
    share: null,
  };
  const key: Record<string, "office" | "home" | "leave"> = {
    WFO: "office",
    WFH: "home",
    Leave: "leave",
  };
  for (const date of datesBetween(start, end)) {
    const e = w.entries[date] || {};
    if (date <= today && HALVES.some((h: string) => e.plan?.[h] && !e.actual?.[h]))
      out.pending.push(date);
    if (!scheduled(w, date) || w.holidays[date]) continue;
    const p = scheduleOn(w, date);
    let gap = false;
    for (const half of HALVES) {
      const actual = date <= today ? e.actual?.[half] : null,
        plan = date > today ? e.plan?.[half] : null,
        slot = actual || plan;
      if (!slot) {
        out.unset += 0.5;
        // Unplanned future days don't count yet; unrecorded past days do.
        if (date <= today) out.base += 0.5;
        if (date < today) gap = true;
        continue;
      }
      if (!p?.excludeLeave || slot.mode !== "Leave") out.base += 0.5;
      out[key[slot.mode]] += 0.5;
      if (actual) out.recorded[key[slot.mode]] += 0.5;
      else out.planned += 0.5;
    }
    if (gap) out.missing.push(date);
  }
  out.share = out.base ? Math.round((out.office / out.base) * 100) : null;
  return out;
}

/** The office percentage target that the summaries compare against, if any. */
export function primaryTarget(w: any) {
  const rules = Object.values(w.targets || {}) as any[];
  return (
    rules.find((r) => r.mode === "WFO" && r.unit === "percent" && r.comparison === "min") ||
    rules.find((r) => r.mode === "WFO" && r.unit === "percent") ||
    null
  );
}

export type Status = { text: string; tone: "met" | "below" | "track" | "risk" | "plain" };

export function statusFor(split: Split, rule: any, today: string): Status | null {
  if (split.share === null) return null;
  if (split.start > today)
    return split.planned ? { text: "planned", tone: "plain" } : null;
  if (!rule) return null;
  const ok =
    rule.comparison === "max" ? split.share <= rule.value : split.share >= rule.value;
  if (split.end < today) return ok ? { text: "met", tone: "met" } : { text: "below", tone: "below" };
  return ok ? { text: "on track", tone: "track" } : { text: "at risk", tone: "risk" };
}

export const targetText = (rule: any) =>
  `${rule.mode === "WFH" ? "Home" : "Office"} ${rule.comparison === "min" ? "≥" : "≤"} ${rule.value}${
    rule.unit === "percent" ? "%" : rule.value === 1 ? " day" : " days"
  } a ${rule.period}`;

export const fmtDays = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export const pct = (part: number, total: number) =>
  total > 0 ? (part / total) * 100 + "%" : "0%";

export function longDate(date: string, options: Intl.DateTimeFormatOptions) {
  return new Date(date + "T12:00:00").toLocaleDateString(undefined, options);
}
