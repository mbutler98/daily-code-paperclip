import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addMonths, addDays, daysBetween, daysInMonth, isLeapYear, parseDate,
  rollForward, todayISO, bandOf, classify, formatDate,
} from '../core.js';

test('parseDate accepts real dates and rejects impossible ones', () => {
  assert.deepEqual(parseDate('2027-03-14'), { y: 2027, m: 3, d: 14 });
  assert.deepEqual(parseDate('2028-02-29'), { y: 2028, m: 2, d: 29 });
  assert.equal(parseDate('2027-02-29'), null);
  assert.equal(parseDate('2026-04-31'), null);
  assert.equal(parseDate('2026-13-01'), null);
  assert.equal(parseDate('2026-1-01'), null);
  assert.equal(parseDate(''), null);
  assert.equal(parseDate(undefined), null);
});

test('leap years follow the Gregorian rule', () => {
  assert.equal(isLeapYear(2028), true);
  assert.equal(isLeapYear(2100), false);
  assert.equal(isLeapYear(2000), true);
  assert.equal(daysInMonth(2028, 2), 29);
  assert.equal(daysInMonth(2027, 2), 28);
});

test('daysBetween counts calendar days, across month ends, years and DST', () => {
  assert.equal(daysBetween('2026-10-16', '2026-10-16'), 0);
  assert.equal(daysBetween('2026-10-31', '2026-11-01'), 1);
  assert.equal(daysBetween('2026-12-31', '2027-01-01'), 1);
  assert.equal(daysBetween('2028-02-28', '2028-03-01'), 2);
  assert.equal(daysBetween('2027-02-28', '2027-03-01'), 1);
  assert.equal(daysBetween('2026-10-16', '2026-10-02'), -14);
  // Spans both DST changes in North America and Europe.
  assert.equal(daysBetween('2026-03-01', '2026-11-30'), 274);
});

test('addDays crosses month and year ends', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2027-02-28', 1), '2027-03-01');
});

// The contract table from EXPERIENCE.md — Date & Time Rules.
test('addMonths clamps at month end instead of overflowing', () => {
  assert.equal(addMonths('2027-01-31', 1), '2027-02-28');
  assert.equal(addMonths('2028-01-31', 1), '2028-02-29');
  assert.equal(addMonths('2026-08-31', 1), '2026-09-30');
});

test('addMonths restores the anchor day after a clamped month', () => {
  assert.equal(addMonths('2027-02-28', 1, 31), '2027-03-31');
  assert.equal(addMonths('2027-03-31', 1, 31), '2027-04-30');
  assert.equal(addMonths('2027-04-30', 1, 31), '2027-05-31');
});

test('addMonths handles leap days on yearly steps', () => {
  assert.equal(addMonths('2028-02-29', 12), '2029-02-28');
  assert.equal(addMonths('2029-02-28', 12, 29), '2030-02-28');
  assert.equal(addMonths('2031-02-28', 12, 29), '2032-02-29');
});

test('addMonths rolls over the year', () => {
  assert.equal(addMonths('2026-12-31', 1), '2027-01-31');
  assert.equal(addMonths('2026-11-15', 3), '2027-02-15');
  assert.equal(addMonths('2026-01-15', 24), '2028-01-15');
});

test('monthly roll never drifts from the 31st over a year', () => {
  let date = '2027-01-31';
  const seen = [];
  for (let i = 0; i < 12; i++) {
    date = addMonths(date, 1, 31);
    seen.push(date);
  }
  assert.deepEqual(seen, [
    '2027-02-28', '2027-03-31', '2027-04-30', '2027-05-31', '2027-06-30', '2027-07-31',
    '2027-08-31', '2027-09-30', '2027-10-31', '2027-11-30', '2027-12-31', '2028-01-31',
  ]);
});

const yearly = { unit: 'month', interval: 12 };
const monthly = { unit: 'month', interval: 1 };

test('rollForward on time moves one period', () => {
  const item = { expiry: '2026-10-14', recurrence: yearly, anchorDay: 14 };
  assert.equal(rollForward(item, '2026-10-10'), '2027-10-14');
});

test('rollForward keeps the anniversary when marked renewed late', () => {
  const item = { expiry: '2026-10-14', recurrence: yearly, anchorDay: 14 };
  assert.equal(rollForward(item, '2026-11-04'), '2027-10-14');
});

test('rollForward skips as many periods as needed to land after today', () => {
  const item = { expiry: '2026-07-05', recurrence: monthly, anchorDay: 5 };
  assert.equal(rollForward(item, '2026-10-16'), '2026-11-05');
});

test('rollForward lands strictly after today, never on it', () => {
  const item = { expiry: '2026-09-16', recurrence: monthly, anchorDay: 16 };
  assert.equal(rollForward(item, '2026-10-16'), '2026-11-16');
});

test('rollForward respects every-N-months and the month-end anchor', () => {
  const item = { expiry: '2026-08-31', recurrence: { unit: 'month', interval: 6 }, anchorDay: 31 };
  assert.equal(rollForward(item, '2026-08-31'), '2027-02-28');
  const next = { ...item, expiry: '2027-02-28' };
  assert.equal(rollForward(next, '2027-02-28'), '2027-08-31');
});

test('rollForward of a leap-day anchor returns to 29 Feb in the next leap year', () => {
  let item = { expiry: '2028-02-29', recurrence: yearly, anchorDay: 29 };
  const out = [];
  for (const today of ['2028-02-29', '2029-02-28', '2030-02-28', '2031-02-28']) {
    item = { ...item, expiry: rollForward(item, today) };
    out.push(item.expiry);
  }
  assert.deepEqual(out, ['2029-02-28', '2030-02-28', '2031-02-28', '2032-02-29']);
});

test('rollForward returns null for one-off items', () => {
  assert.equal(rollForward({ expiry: '2027-03-14', recurrence: null }, '2026-10-16'), null);
});

test('rollForward survives absurd stored data', () => {
  const item = { expiry: '1900-01-01', recurrence: monthly, anchorDay: 1 };
  const next = rollForward(item, '2026-10-16');
  assert.ok(daysBetween('2026-10-16', next) > 0);
});

test('bands: overdue below zero, act now inside the window inclusive, later beyond', () => {
  assert.equal(bandOf(-1, 14), 'overdue');
  assert.equal(bandOf(0, 14), 'act');
  assert.equal(bandOf(0, 0), 'act');
  assert.equal(bandOf(14, 14), 'act');
  assert.equal(bandOf(15, 14), 'later');
});

test('an item whose lead window opens today appears under Act now with no action', () => {
  const item = { id: 'a', name: 'Passport', expiry: '2026-11-27', leadDays: 42 };
  // Yesterday it was 43 days out — later.
  assert.equal(classify([item], '2026-10-15').later.length, 1);
  // Today it is exactly 42 days out — act now, purely by re-deriving.
  const today = classify([item], '2026-10-16');
  assert.equal(today.act.length, 1);
  assert.equal(today.act[0].days, 42);
});

test('an item expiring today is Act now, not Overdue', () => {
  const bands = classify([{ id: 'a', name: 'Trial', expiry: '2026-10-16', leadDays: 3 }], '2026-10-16');
  assert.equal(bands.act.length, 1);
  assert.equal(bands.overdue.length, 0);
});

test('classify sorts by days, then name case-insensitively', () => {
  const items = [
    { id: '1', name: 'b', expiry: '2026-12-01', leadDays: 0 },
    { id: '2', name: 'A', expiry: '2026-12-01', leadDays: 0 },
    { id: '3', name: 'c', expiry: '2026-11-01', leadDays: 0 },
  ];
  assert.deepEqual(classify(items, '2026-10-16').later.map(r => r.item.id), ['3', '2', '1']);
});

test('formatDate renders D MMM YYYY and may drop the current year', () => {
  assert.equal(formatDate('2027-03-14'), '14 Mar 2027');
  assert.equal(formatDate('2026-09-03'), '3 Sep 2026');
  assert.equal(formatDate('2026-11-02', '2026-10-16'), '2 Nov');
  assert.equal(formatDate('2027-02-03', '2026-10-16'), '3 Feb 2027');
});

// --- Device timezone change ---------------------------------------------

function inZone(zone, fn) {
  const before = process.env.TZ;
  process.env.TZ = zone;
  try { return fn(); } finally {
    if (before === undefined) delete process.env.TZ; else process.env.TZ = before;
  }
}

test('todayISO reads the local calendar, not UTC', () => {
  // 02:30 UTC on 17 Oct is still the evening of 16 Oct in Toronto.
  const instant = new Date('2026-10-17T02:30:00Z');
  assert.equal(inZone('America/Toronto', () => todayISO(instant)), '2026-10-16');
  assert.equal(inZone('UTC', () => todayISO(instant)), '2026-10-17');
});

test('flying Toronto → Tokyo drops every countdown by exactly one day', () => {
  const instant = new Date('2026-10-16T20:00:00Z'); // 16:00 Toronto, 05:00 next day Tokyo
  const item = { id: 'p', name: 'Passport', expiry: '2026-11-27', leadDays: 42 };
  const toronto = inZone('America/Toronto', () => todayISO(instant));
  const tokyo = inZone('Asia/Tokyo', () => todayISO(instant));
  assert.equal(toronto, '2026-10-16');
  assert.equal(tokyo, '2026-10-17');
  assert.equal(daysBetween(toronto, item.expiry), 42);
  assert.equal(daysBetween(tokyo, item.expiry), 41);
  // The stored expiry never moved.
  assert.equal(item.expiry, '2026-11-27');
});

test('day counts are whole across a DST transition in the local zone', () => {
  // 1 Nov 2026 is the fall-back day in Toronto; the local day before has 25 hours.
  inZone('America/Toronto', () => {
    const before = todayISO(new Date(2026, 9, 31, 23, 30));
    const after = todayISO(new Date(2026, 10, 1, 23, 30));
    assert.equal(before, '2026-10-31');
    assert.equal(after, '2026-11-01');
    assert.equal(daysBetween(before, after), 1);
    assert.equal(daysBetween(after, '2026-11-08'), 7);
  });
});

test('a lead window that opens at local midnight is seen the moment the date changes', () => {
  const item = { id: 'i', name: 'Insurance', expiry: '2026-11-07', leadDays: 21 };
  inZone('America/Toronto', () => {
    const lateEvening = todayISO(new Date(2026, 9, 16, 23, 59));
    const justAfterMidnight = todayISO(new Date(2026, 9, 17, 0, 1));
    assert.equal(classify([item], lateEvening).later.length, 1);
    assert.equal(classify([item], justAfterMidnight).act.length, 1);
  });
});
