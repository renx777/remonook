import { test } from "node:test";
import assert from "node:assert/strict";
import {
  empty,
  archive,
  parseArchive,
  androidBlockers,
} from "./.build/data.mjs";
import {
  enableWorkdays,
  workdays,
  dayState,
  setWorkdays,
  saveWorkPolicy,
  workSummary,
  leaveSummary,
  parseHolidayText,
  holidayConflicts,
  importWorkHolidays,
  validateWorkdays,
  dateRange,
} from "../src/workdays.mjs";
const today = "2026-10-25";
const setup = () => enableWorkdays(empty(), true, today);
test("plans never mature into attendance; confirmation preserves the original plan and unrelated notes", () => {
  let d = setup();
  const notes = d.tables.bullets;
  d = setWorkdays(d, ["2026-10-26"], "WFO", "", today);
  assert.equal(dayState(workdays(d), "2026-10-26", "2026-10-27").pending, true);
  assert.equal(workSummary(workdays(d), today, "2026-10-27").completed, 0);
  d = setWorkdays(d, ["2026-10-26"], "WFH", "", "2026-10-27", "confirm");
  const state = dayState(workdays(d), "2026-10-26", "2026-10-27");
  assert.equal(state.actual.status, "WFH");
  assert.equal(state.plan.status, "WFO");
  assert.equal(state.pending, false);
  assert.equal(d.tables.bullets, notes);
  assert.throws(
    () => setWorkdays(d, ["2026-11-01"], "WFO", "", today, "confirm"),
    /Future/,
  );
});
test("bulk mixed dates, leave balances, holiday replacement and clear are independent of note content", () => {
  let d = setup();
  d = setWorkdays(d, ["2026-10-23", "2026-10-26"], "Leave", "Sick", today);
  let l = leaveSummary(workdays(d), "2026", today);
  assert.equal(l.Sick.used, 1);
  assert.equal(l.Sick.planned, 1);
  d = setWorkdays(d, ["2026-10-23"], "Holiday", "Company holiday", today);
  l = leaveSummary(workdays(d), "2026", today);
  assert.equal(l.Sick.used, 0);
  assert.equal(l.Sick.planned, 1);
  d = setWorkdays(d, ["2026-10-23", "2026-10-26"], "Clear", "", today);
  assert.deepEqual(workdays(d).entries, {});
  assert.deepEqual(workdays(d).holidays, {});
});
test("percentage goals exclude configured leave and holidays; monthly targets remain fixed", () => {
  let d = setup();
  const p = {
    ...workdays(d).policies[0],
    goalMode: "percentage",
    goalValue: 60,
  };
  d = saveWorkPolicy(d, p, "2026", {
    Sick: 5,
    Casual: 5,
    Planned: 10,
    Annual: 20,
  });
  assert.equal(workSummary(workdays(d), today, today).eligible, 22);
  assert.equal(workSummary(workdays(d), today, today).target, 14);
  d = setWorkdays(d, ["2026-10-01"], "Holiday", "Holiday", today);
  d = setWorkdays(d, ["2026-10-02"], "Leave", "Sick", today);
  let s = workSummary(workdays(d), today, today);
  assert.equal(s.eligible, 20);
  assert.equal(s.target, 12);
  d = saveWorkPolicy(
    d,
    { ...p, excludeLeave: false },
    "2026",
    workdays(d).allowances["2026"],
  );
  assert.equal(workSummary(workdays(d), today, today).eligible, 21);
  d = saveWorkPolicy(
    d,
    { ...p, goalMode: "monthly", goalValue: 12 },
    "2026",
    workdays(d).allowances["2026"],
  );
  assert.equal(workSummary(workdays(d), today, today).target, 12);
});
test("policy versions, custom workweeks, start dates and partial periods are respected", () => {
  let d = setup(),
    p = { ...workdays(d).policies[0], goalMode: "monthly", goalValue: 10 };
  d = saveWorkPolicy(d, p, "2026", {
    Sick: 0,
    Casual: 0,
    Planned: 0,
    Annual: 0,
  });
  const before = workSummary(workdays(d), "2026-10-01", today);
  d = saveWorkPolicy(
    d,
    {
      ...p,
      effectiveFrom: "2026-11-01",
      weekdays: [0, 1, 2, 3, 4],
      goalValue: 20,
    },
    "2026",
    workdays(d).allowances["2026"],
  );
  assert.deepEqual(workSummary(workdays(d), "2026-10-01", today), before);
  d = saveWorkPolicy(
    d,
    { ...p, startDate: "2026-10-16" },
    "2026",
    workdays(d).allowances["2026"],
  );
  assert.equal(workSummary(workdays(d), today, today).target, 5);
  assert.equal(dateRange("2028-02-01", "2028-02-29").length, 29);
  const weekly = workSummary(workdays(setup()), today, today);
  assert.equal(weekly.target, 14); // 22/5 * 3, rounded up.
});
test("holiday import parses supported formats, previews invalid and duplicate rows, and preserves conflicts by default", () => {
  const result = parseHolidayText(
    "2027\n01/01 New Year\n26-01-2027 Republic Day\n14-Jan-2027 Makar Sankranti\nOctober 2, 2027 | Gandhi Jayanti\n2027-12-25 Christmas\n31/02/2027 Bad\n2027-12-25 Duplicate",
    2026,
  );
  assert.deepEqual(
    result.rows.map((r) => r.date),
    ["2027-01-01", "2027-01-26", "2027-01-14", "2027-10-02", "2027-12-25"],
  );
  assert.equal(result.errors.length, 2);
  let d = setWorkdays(setup(), ["2027-01-01"], "WFO", "", today);
  assert.equal(holidayConflicts(workdays(d), result.rows).length, 1);
  d = importWorkHolidays(d, result.rows);
  assert.equal(workdays(d).entries["2027-01-01"].plan.status, "WFO");
  assert.equal(workdays(d).holidays["2027-01-01"], undefined);
  d = importWorkHolidays(d, result.rows, true);
  assert.equal(workdays(d).entries["2027-01-01"], undefined);
  assert.equal(workdays(d).holidays["2027-01-01"], "New Year");
});
test("Workdays round trip in full backup, block lossy Android export, and reject malformed backup metadata", async () => {
  const d = setWorkdays(setup(), ["2026-10-23"], "Leave", "Annual", today);
  const restored = await parseArchive(await archive(d, new Map()));
  assert.deepEqual(restored.doc.web.workdays, workdays(d));
  assert.ok(androidBlockers(d).some((s) => s.includes("Workdays")));
  for (const change of [
    (w) => (w.entries.bad = { actual: { status: "WFH" } }),
    (w) => (w.policies[0].weekdays = []),
    (w) => (w.entries["2026-10-23"].actual.detail = "Unknown"),
    (w) => (w.view = "bad"),
    (w) => (w.allowances["2026"] = { Sick: -1 }),
  ]) {
    const w = structuredClone(workdays(d));
    change(w);
    assert.throws(() => validateWorkdays(w), /Invalid Workdays/);
  }
});
test("unconfirmed leave is not spent or excluded after its date, and nonworkdays do not spend leave", () => {
  let d = setup();
  d = saveWorkPolicy(
    d,
    { ...workdays(d).policies[0], goalMode: "percentage", goalValue: 50 },
    "2026",
    { Sick: 8, Casual: 0, Planned: 0, Annual: 0 },
  );
  d = setWorkdays(d, ["2026-10-26"], "Leave", "Sick", today);
  assert.equal(workSummary(workdays(d), today, today).eligible, 21);
  assert.equal(workSummary(workdays(d), today, "2026-10-27").eligible, 22);
  assert.equal(leaveSummary(workdays(d), "2026", "2026-10-27").Sick.used, 0);
  d = setWorkdays(d, ["2026-10-24"], "Leave", "Sick", today);
  assert.equal(leaveSummary(workdays(d), "2026", today).Sick.used, 0);
  const corrupt = structuredClone(workdays(d));
  corrupt.entries = 1;
  assert.throws(() => validateWorkdays(corrupt), /Invalid Workdays/);
});
