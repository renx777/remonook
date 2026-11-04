import test from 'node:test';
import assert from 'node:assert/strict';
import { splitFor, statusFor, dayInfo, primaryTarget, monthGrid } from './.build/workdays-stats.mjs';

const slot = (mode) => ({ am: { mode, updatedAt: 1 }, pm: { mode, updatedAt: 1 } });
const w = {
  schedules: [{ effectiveFrom: '2026-11-01', weekdays: [1, 2, 3, 4, 5], startDate: '', excludeLeave: true }],
  holidays: { '2026-11-24': 'Company day' },
  leaveTypes: { annual: { id: 'annual', name: 'Annual' } },
  targets: { t: { id: 't', mode: 'WFO', comparison: 'min', unit: 'percent', period: 'quarter', value: 60 } },
  entries: {
    '2026-11-02': { actual: slot('WFO') },
    '2026-11-03': { plan: slot('WFH') }, // past plan, never auto-converted
    '2026-11-04': { actual: { am: { mode: 'WFO', updatedAt: 1 }, pm: { mode: 'WFH', updatedAt: 1 } } },
    '2026-11-05': { plan: slot('WFO') },
    '2026-11-06': { plan: { am: { mode: 'Leave', leaveTypeId: 'annual', updatedAt: 1 }, pm: { mode: 'Leave', leaveTypeId: 'annual', updatedAt: 1 } } },
  },
};

test('split counts records for past days and plans for future days', () => {
  const s = splitFor(w, '2026-11-01', '2026-11-30', '2026-11-04');
  assert.equal(s.office, 2.5); // 2nd + morning of 4th + planned 5th
  assert.equal(s.home, 0.5);
  assert.equal(s.leave, 1);
  assert.deepEqual(s.recorded, { office: 1.5, home: 0.5, leave: 0 });
  assert.equal(s.planned, 2);
  assert.deepEqual(s.pending, ['2026-11-03']);
  assert.deepEqual(s.missing, ['2026-11-03'], 'an unconfirmed past plan is not a record');
  // Base: recorded 2 + planned office 1 + unrecorded past 1; leave excluded, unplanned future days not counted yet.
  assert.equal(s.base, 4);
  assert.equal(s.share, 63);
});

test('status compares the share with the office target', () => {
  const rule = primaryTarget(w);
  assert.equal(rule.id, 't');
  const past = splitFor(w, '2026-11-01', '2026-11-03', '2026-11-30');
  assert.deepEqual(statusFor(past, rule, '2026-11-30'), { text: 'below', tone: 'below' });
  const now = splitFor(w, '2026-11-01', '2026-11-30', '2026-11-04');
  assert.deepEqual(statusFor(now, rule, '2026-11-04'), { text: 'on track', tone: 'track' });
  assert.equal(statusFor(splitFor(w, '2026-12-01', '2026-12-31', '2026-11-04'), rule, '2026-11-04'), null);
});

test('day info labels holidays, weekends, half days and plans', () => {
  assert.equal(dayInfo(w, '2026-11-24', '2026-11-04').label, 'Company day (holiday)');
  assert.equal(dayInfo(w, '2026-11-07', '2026-11-04').label, 'Weekend');
  assert.equal(dayInfo(w, '2026-11-04', '2026-11-04').label, 'Office / Home (recorded)');
  assert.equal(dayInfo(w, '2026-11-05', '2026-11-04').label, 'Office (planned)');
  assert.equal(dayInfo(w, '2026-11-03', '2026-11-04').pending, true);
});

test('month grid starts on Sunday and covers whole weeks', () => {
  const g = monthGrid('2026-11-15');
  assert.equal(g[0], '2026-11-01');
  assert.equal(g.length % 7, 0);
  assert.equal(g.at(-1), '2026-12-05');
});
