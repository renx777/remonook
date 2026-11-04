import test from "node:test";
import assert from "node:assert/strict";
import {
  migrateWorkdays,
  withLeaveYearStart,
  workdaysV2,
  updateWorkdaysV2,
  validateWorkdaysV2,
  setAllocations,
  clearWorkday,
  confirmPlans,
  leaveBalances,
  leaveId,
  summarizeWorkdays,
  periodRange,
  targetProgress,
  targetWarnings,
  routinePreview,
  applyRoutine,
  importHolidaysV2,
} from "../src/workdays-v2.mjs";
import {
  parseHolidaySource,
  holidayDate,
  positionedLines,
  parsePdfPages,
} from "../src/workday-holidays.mjs";
import {
  seed,
  sharedState,
  openShared,
  applyIntent,
  Y,
  delta,
  vector,
  unpack,
  project,
} from "../src/sync-crdt.mjs";
import {
  empty,
  archive,
  parseArchive,
  androidBlockers,
} from "./.build/data.mjs";
const today = "2026-11-10",
  date = "2026-11-09",
  base = () => {
    const d = empty();
    d.web.workdays = {
      ...migrateWorkdays(undefined, "2026-01-01"),
      enabled: true,
    };
    return d;
  };
test("v1 migration preserves actuals, plans, types, policy dates and half-unit allowances", () => {
  const old = {
    version: 1,
    enabled: true,
    policies: [
      {
        effectiveFrom: "2026-01-01",
        weekdays: [1, 2, 3, 4, 5],
        startDate: "",
        excludeLeave: true,
        goalMode: "weekly",
        goalValue: 3,
      },
      {
        effectiveFrom: "2026-07-01",
        weekdays: [1, 2, 3, 4, 5],
        startDate: "",
        excludeLeave: true,
        goalMode: "percentage",
        goalValue: 40,
      },
    ],
    entries: {
      [date]: {
        actual: { status: "Leave", detail: "Sick", updatedAt: 1 },
        plan: { status: "WFO", detail: "", updatedAt: 0 },
      },
    },
    holidays: { "2026-12-25": "Christmas" },
    allowances: { 2026: { Sick: 8, Casual: 4, Annual: 20, Planned: 0 } },
  };
  const w = migrateWorkdays(old);
  validateWorkdaysV2(w);
  assert.equal(w.entries[date].actual.am.leaveTypeId, leaveId("Sick"));
  assert.equal(w.entries[date].plan.pm.mode, "WFO");
  assert.equal(w.leaveYears["2026-01-01"].quotas[leaveId("Annual")], 40);
  assert.equal(w.targets["legacy-2026-01-01"].endDate, "2026-06-30");
  assert.equal(w.holidays["2026-12-25"], "Christmas");
  assert.equal(migrateWorkdays(w), w);
});
test("half-day leave, plans, actual confirmation and holiday clearing are independent", () => {
  let d = base();
  d = setAllocations(
    d,
    [date],
    {
      mode: "Leave",
      leaveTypeId: leaveId("Sick"),
      half: "am",
      remaining: "WFO",
    },
    today,
  );
  let w = workdaysV2(d);
  assert.equal(
    leaveBalances(w, today, today).types.find((t) => t.id === leaveId("Sick"))
      .used,
    1,
  );
  assert.equal(summarizeWorkdays(w, date, date, today).office, 0.5);
  d = setAllocations(
    d,
    ["2026-11-11"],
    { mode: "Leave", leaveTypeId: leaveId("Annual") },
    today,
  );
  assert.equal(
    leaveBalances(workdaysV2(d), today, today).types.find(
      (t) => t.id === leaveId("Annual"),
    ).planned,
    2,
  );
  assert.equal(
    leaveBalances(workdaysV2(d), today, "2026-11-12").types.find(
      (t) => t.id === leaveId("Annual"),
    ).used,
    0,
  );
  d = confirmPlans(d, ["2026-11-11"], "2026-11-12");
  d = importHolidaysV2(d, [{ date, name: "Company day" }]);
  assert.ok(d.web.workdays.entries[date].actual);
  d = clearWorkday(d, date, "actual");
  assert.equal(d.web.workdays.holidays[date], "Company day");
  assert.equal(
    leaveBalances(workdaysV2(d), today, today).types.find(
      (t) => t.id === leaveId("Sick"),
    ).used,
    0,
  );
  d = clearWorkday(d, date, "holiday");
  assert.equal(d.web.workdays.holidays[date], undefined);
  assert.ok(d.web.workdays.entries["2026-11-11"].plan);
  assert.throws(() => confirmPlans(d, ["2026-11-20"], today), /past or today/);
});
test("custom leave years, adjustments and archived types keep historical usage", () => {
  let d = base();
  d = updateWorkdaysV2(d, (w) => ({
    ...withLeaveYearStart(w, "04-01", "2026-04-01"),
    leaveTypes: {
      ...w.leaveTypes,
      medical: {
        id: "medical",
        name: "Medical",
        color: "#998855",
        archived: false,
      },
    },
    leaveYears: {
      "2026-04-01": {
        start: "2026-04-01",
        quotas: { medical: 10 },
        adjustments: { medical: 2 },
      },
    },
  }));
  d = setAllocations(
    d,
    [date],
    { mode: "Leave", leaveTypeId: "medical", half: "pm" },
    today,
  );
  d = updateWorkdaysV2(d, (w) => ({
    ...w,
    leaveTypes: {
      ...w.leaveTypes,
      medical: { ...w.leaveTypes.medical, archived: true },
    },
  }));
  const result = leaveBalances(workdaysV2(d), today, today);
  assert.equal(result.start, "2026-04-01");
  assert.equal(result.types.find((t) => t.id === "medical").available, 11);
  assert.throws(
    () =>
      setAllocations(
        d,
        [date],
        { mode: "Leave", leaveTypeId: "medical" },
        today,
      ),
    /active/,
  );
});
test("targets use eligible half days, real period boundaries, projections and impossible-rule warnings", () => {
  let d = base();
  d = setAllocations(d, ["2026-11-02"], { mode: "WFO" }, today);
  d = setAllocations(
    d,
    ["2026-11-12"],
    { mode: "Leave", leaveTypeId: leaveId("Annual"), half: "am" },
    today,
  );
  const w = workdaysV2(d),
    rule = {
      id: "target",
      mode: "WFO",
      comparison: "min",
      unit: "percent",
      value: 33,
      period: "month",
      effectiveFrom: "2026-11-01",
      legacy: false,
    };
  let p = targetProgress(w, rule, today, today);
  assert.equal(p.actual, 1);
  assert.equal(p.eligible, 21);
  assert.equal(p.projectedEligible, 20.5);
  assert.equal(p.target, 7);
  assert.equal(p.projectedTarget, 7);
  p = targetProgress(
    w,
    { ...rule, comparison: "max", value: 31 },
    today,
    today,
  );
  assert.equal(p.target, 6.5);
  assert.deepEqual(periodRange("2026-12-31", "quarter"), {
    start: "2026-10-01",
    end: "2026-12-31",
  });
  assert.deepEqual(periodRange("2026-11-01", "week"), {
    start: "2026-10-26",
    end: "2026-11-01",
  });
  const impossible = { ...rule, unit: "days", value: 30 };
  assert.equal(targetProgress(w, impossible, today, today).target, 30);
  assert.ok(
    targetWarnings({ ...w, targets: { target: impossible } }, today, today)
      .length,
  );
});
test("routine preview and application preserve holidays, actuals and individual plans", () => {
  let d = base();
  const start = new Date().toISOString().slice(0, 10),
    end = periodRange(start).end;
  d = importHolidaysV2(d, [{ date: start, name: "Holiday" }]);
  const pattern = {
      0: "WFH",
      1: "WFO",
      2: "WFO",
      3: "WFH",
      4: "WFH",
      5: "WFH",
      6: "WFH",
    },
    preview = routinePreview(workdaysV2(d), start, end, pattern, start);
  assert.ok(preview.every((r) => r.date !== start));
  if (preview.length) {
    d = setAllocations(d, [preview[0].date], { mode: "WFO" }, start);
    const newRows = routinePreview(workdaysV2(d), start, end, pattern, start);
    d = applyRoutine(d, newRows);
    assert.equal(d.web.workdays.entries[preview[0].date].plan.am.mode, "WFO");
  }
  assert.equal(d.web.workdays.holidays[start], "Holiday");
});
test("holiday review handles quoted CSV, ambiguous dates and positioned PDF rows", () => {
  const csv = parseHolidaySource(
    'Date,Holiday\n2027-01-01,"New Year, company holiday"\n04/05/2027,Spring',
    { year: "2027", csv: true },
  );
  assert.equal(csv.rows[0].name, "New Year, company holiday");
  assert.equal(csv.rows[1].selected, false);
  assert.match(csv.rows[1].issue, /DMY/);
  assert.equal(holidayDate("04/05/2027", "2027", "MDY").date, "2027-04-05");
  assert.equal(holidayDate("31/02/2027", "2027", "DMY").date, "");
  const lines = positionedLines([
    { text: "2027-01-01", x: 10, y: 20, height: 10 },
    { text: "New Year", x: 130, y: 20, height: 10 },
    { text: "2027-12-25", x: 10, y: 40, height: 10 },
    { text: "Christmas", x: 130, y: 40, height: 10 },
  ]);
  assert.equal(parseHolidaySource(lines, { year: "2027" }).rows.length, 2);
});
test("atomic work allocations merge independent halves without combining leave and location fields", () => {
  const d = base(),
    state = sharedState(seed(d)),
    a = openShared(state),
    b = openShared(state),
    av = vector(a),
    bv = vector(b);
  const left = structuredClone(d),
    right = structuredClone(d);
  left.web.workdays.entries[date] = {
    actual: {
      am: { mode: "Leave", leaveTypeId: leaveId("Sick"), updatedAt: 1 },
    },
  };
  right.web.workdays.entries[date] = {
    actual: { pm: { mode: "WFO", updatedAt: 1 } },
  };
  applyIntent(a, d, left);
  applyIntent(b, d, right);
  const merged = openShared(state);
  Y.applyUpdate(merged, unpack(delta(a, av)));
  Y.applyUpdate(merged, unpack(delta(b, bv)));
  const w = project(merged).doc.web.workdays;
  validateWorkdaysV2(w);
  assert.equal(w.entries[date].actual.am.mode, "Leave");
  assert.equal(w.entries[date].actual.pm.mode, "WFO");
  a.destroy();
  b.destroy();
  merged.destroy();
});

test("v2 backup round trip retains half days, custom quotas and holidays and rejects malformed references", async () => {
  let d = setAllocations(
    base(),
    [date],
    { mode: "Leave", leaveTypeId: leaveId("Sick"), half: "am" },
    today,
  );
  d = importHolidaysV2(d, [{ date: "2026-12-25", name: "Christmas" }]);
  const restored = await parseArchive(await archive(d, new Map()));
  assert.deepEqual(restored.doc.web.workdays, d.web.workdays);
  assert.ok(androidBlockers(d).some((s) => s.includes("Workdays")));
  const bad = structuredClone(d.web.workdays);
  bad.entries[date].actual.am.leaveTypeId = "missing";
  assert.throws(() => validateWorkdaysV2(bad));
});

test("changing the leave year retains earlier cycles and closes a transition year at the new boundary", () => {
  let d = base();
  d = setAllocations(
    d,
    ["2026-02-02"],
    { mode: "Leave", leaveTypeId: leaveId("Sick") },
    today,
  );
  d = updateWorkdaysV2(d, (w) => ({
    ...withLeaveYearStart(w, "04-01", "2026-11-01"),
    leaveYears: {
      "2026-01-01": {
        start: "2026-01-01",
        quotas: { [leaveId("Sick")]: 20 },
        adjustments: {},
      },
    },
  }));
  const past = leaveBalances(workdaysV2(d), "2026-02-02", today);
  assert.equal(past.start, "2026-01-01");
  assert.equal(past.end, "2026-03-31");
  assert.equal(past.types.find((t) => t.id === leaveId("Sick")).used, 2);
  assert.equal(leaveBalances(workdaysV2(d), today, today).start, "2026-04-01");
});

test("PDF page ranges are bounded, deduplicated and reject reversed or empty ranges", () => {
  assert.deepEqual(parsePdfPages("1-3, 3, 5"), [1, 2, 3, 5]);
  for (const input of ["1-0", "5-2", "0", "1-11", "1,,3", ""])
    assert.throws(() => parsePdfPages(input));
});
test("holiday tables with a row number and month column use the full date, not '3 January'", () => {
  const page = [
    "MBB LABS PRIVATE LIMITED",
    "+91 80 6625 0001 | office@example.com",
    "HOLIDAY LIST",
    "Calendar Year 2026",
    "# MONTH DATE DAY O CCASION",
    "1 January 01-Jan-2026 Thursday New Year Day",
    "3 January 26-Jan-2026 Monday Republic Day",
    "6 May 01-May-2026 Friday May Day",
    "11 October 20-Oct-2026 Tuesday Ayudha Pooja/ Vijaya Dashami",
    "Page 1 of 1",
  ].join("\n");
  const { rows, skipped } = parseHolidaySource(page, { year: "2026" });
  assert.deepEqual(
    rows.map((r) => [r.date, r.name, r.selected]),
    [
      ["2026-01-01", "New Year Day", true],
      ["2026-01-26", "Republic Day", true],
      ["2026-05-01", "May Day", true],
      ["2026-10-20", "Ayudha Pooja / Vijaya Dashami", true],
    ],
  );
  assert.equal(skipped, 6, "titles, headers and footers are skipped");
  const list = parseHolidaySource("Republic Day 26 Jan\nGood Friday, April 3, 2026\nDiwali - 8th November", { year: "2026" }).rows;
  assert.deepEqual(list.map((r) => [r.date, r.name]), [
    ["2026-01-26", "Republic Day"],
    ["2026-04-03", "Good Friday"],
    ["2026-11-08", "Diwali"],
  ]);
});
