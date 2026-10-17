import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pillText, spokenCountdown, headline, classify, categoryDefaults, normalizeItem,
  parseBackup, mergeItems, exportPayload, exportFilename, buildICS, icsEscape, icsFold, icsFilename,
} from '../core.js';

test('pill wording follows the design table', () => {
  assert.equal(pillText(0), 'today');
  assert.equal(pillText(1), 'tomorrow');
  assert.equal(pillText(2), 'in 2d');
  assert.equal(pillText(17), 'in 17d');
  assert.equal(pillText(60), 'in 60d');
  assert.equal(pillText(61), 'in 2mo');
  assert.equal(pillText(122), 'in 4mo');
  assert.equal(pillText(-1), '1d ago');
  assert.equal(pillText(-14), '14d ago');
  assert.equal(pillText(-60), '60d ago');
  assert.equal(pillText(-95), '3mo ago');
});

test('screen reader wording is the full phrase', () => {
  assert.equal(spokenCountdown(42), 'in 42 days');
  assert.equal(spokenCountdown(1), 'expires tomorrow');
  assert.equal(spokenCountdown(0), 'expires today');
  assert.equal(spokenCountdown(-1), 'overdue by 1 day');
  assert.equal(spokenCountdown(-14), 'overdue by 14 days');
});

const item = (name, expiry, leadDays = 14) => ({ id: name, name, expiry, leadDays });
const today = '2026-10-16';

test('headline: overdue present', () => {
  const bands = classify([
    item('Car registration', '2026-10-02'),
    item('Netflix trial', '2026-10-15'),
    item('Home insurance', '2026-11-02', 21),
    item('Gym', '2026-10-20'),
    item('Passport', '2027-06-01'),
  ], today);
  assert.deepEqual(headline(bands, today), { tone: 'overdue', title: '2 overdue', sub: '2 more need attention' });
});

test('headline: singular and omitted subline', () => {
  const one = classify([item('A', '2026-10-10'), item('B', '2026-10-20')], today);
  assert.deepEqual(headline(one, today), { tone: 'overdue', title: '1 overdue', sub: '1 more needs attention' });
  const none = classify([item('A', '2026-10-10')], today);
  assert.equal(headline(none, today).sub, '');
});

test('headline: in-window only names the next item', () => {
  const bands = classify([item('Home insurance', '2026-10-22', 21), item('Gym', '2026-10-29')], today);
  assert.deepEqual(headline(bands, today), { tone: 'act', title: '2 need attention', sub: 'Next: Home insurance in 6 days' });
  const single = classify([item('Trial', '2026-10-16', 3)], today);
  assert.deepEqual(headline(single, today), { tone: 'act', title: '1 needs attention', sub: 'Next: Trial today' });
});

test('headline: all clear gives the date then the distance', () => {
  const bands = classify([item('Passport', '2027-02-03'), item('Car', '2027-05-01')], today);
  assert.deepEqual(headline(bands, today), {
    tone: 'clear', title: 'All clear', sub: "Nothing due until 3 Feb 2027 — that's 110 days",
  });
});

test('headline: null when there are no items', () => {
  assert.equal(headline(classify([], today), today), null);
});

test('category defaults match the experience spec', () => {
  assert.deepEqual(categoryDefaults('Document'), { leadDays: 42, recurrence: null });
  assert.deepEqual(categoryDefaults('Insurance'), { leadDays: 21, recurrence: { unit: 'month', interval: 12 } });
  assert.deepEqual(categoryDefaults('Subscription'), { leadDays: 3, recurrence: { unit: 'month', interval: 1 } });
  assert.deepEqual(categoryDefaults('Nonsense'), { leadDays: 14, recurrence: null });
});

test('normalizeItem fills defaults and derives anchors from the date', () => {
  const n = normalizeItem({ name: '  Passport ', expiry: '2027-03-14', category: 'Document' }, new Date('2026-10-16T14:30:00Z'));
  assert.equal(n.name, 'Passport');
  assert.equal(n.leadDays, 42);
  assert.equal(n.recurrence, null);
  assert.equal(n.anchorDay, 14);
  assert.equal(n.anchorMonth, 3);
  assert.equal(n.cost, null);
  assert.equal(n.createdAt, '2026-10-16T14:30:00.000Z');
  assert.ok(n.id);
});

test('normalizeItem rejects missing name or impossible date, and fixes unknown category', () => {
  assert.equal(normalizeItem({ name: '', expiry: '2027-03-14' }), null);
  assert.equal(normalizeItem({ name: 'X', expiry: '2027-02-30' }), null);
  assert.equal(normalizeItem({ name: 'X', expiry: '14/03/2027' }), null);
  const n = normalizeItem({ name: 'X', expiry: '2027-03-14', category: 'Pets', leadDays: 9999 });
  assert.equal(n.category, 'Other');
  assert.equal(n.leadDays, 365);
});

test('parseBackup rejects files that are not ours', () => {
  assert.deepEqual(parseBackup(null), { ok: false });
  assert.deepEqual(parseBackup({ items: [] }), { ok: false });
  assert.deepEqual(parseBackup({ app: 'clarity', items: [] }), { ok: false });
  assert.deepEqual(parseBackup({ app: 'renewal-radar', items: [{ name: '' }] }), { ok: false });
});

test('parseBackup keeps valid items and counts skipped ones', () => {
  const r = parseBackup({
    app: 'renewal-radar', version: 1,
    items: [
      { id: 'a', name: 'Passport', expiry: '2027-03-14' },
      { id: 'b', name: '', expiry: '2027-03-14' },
      { id: 'c', name: 'Car', expiry: 'soon' },
    ],
  });
  assert.equal(r.ok, true);
  assert.equal(r.items.length, 1);
  assert.equal(r.skipped, 2);
});

test('export round-trips through import', () => {
  const items = [normalizeItem({ id: 'a', name: 'Passport', expiry: '2027-03-14', category: 'Document', cost: 160, note: 'blue' })];
  const payload = JSON.parse(JSON.stringify(exportPayload(items, new Date('2026-10-16T12:00:00Z'))));
  assert.equal(payload.app, 'renewal-radar');
  assert.equal(payload.version, 1);
  assert.deepEqual(parseBackup(payload), { ok: true, items, skipped: 0 });
  assert.equal(exportFilename('2026-10-16'), 'renewal-radar-2026-10-16.json');
});

test('mergeItems matches on id and lets the incoming item win', () => {
  const existing = [{ id: 'a', name: 'Old A' }, { id: 'b', name: 'B' }];
  const incoming = [{ id: 'a', name: 'New A' }, { id: 'c', name: 'C' }];
  const r = mergeItems(existing, incoming);
  assert.equal(r.added, 1);
  assert.equal(r.matched, 1);
  assert.deepEqual(r.items.map(i => i.name), ['New A', 'B', 'C']);
});

test('ics escaping and folding', () => {
  assert.equal(icsEscape('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne');
  const long = 'DESCRIPTION:' + 'x'.repeat(200);
  const folded = icsFold(long);
  for (const line of folded.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75);
  assert.equal(folded.replace(/\r\n /g, ''), long);
  const multibyte = 'SUMMARY:' + 'é'.repeat(80);
  assert.equal(icsFold(multibyte).replace(/\r\n /g, ''), multibyte);
  for (const line of icsFold(multibyte).split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75);
});

test('buildICS produces an all-day event with an alarm at the lead time', () => {
  const ics = buildICS(
    { id: 'k3f9a2', name: 'Passport', expiry: '2027-03-14', leadDays: 42, recurrence: null, note: '' },
    new Date('2026-10-16T14:30:00.000Z'),
  );
  assert.equal(ics, [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Renewal Radar//EN', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT', 'UID:k3f9a2@renewal-radar', 'DTSTAMP:20261016T143000Z',
    'DTSTART;VALUE=DATE:20270314', 'DTEND;VALUE=DATE:20270315',
    'SUMMARY:Passport expires', 'DESCRIPTION:From Renewal Radar.',
    'BEGIN:VALARM', 'TRIGGER:-P42D', 'ACTION:DISPLAY', 'DESCRIPTION:Passport expires in 42 days', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR', '',
  ].join('\r\n'));
});

test('buildICS adds RRULE for recurring items and ends on a year boundary correctly', () => {
  const base = { id: 'x', name: 'Car, insurance', expiry: '2026-12-31', leadDays: 21, note: '' };
  assert.match(buildICS({ ...base, recurrence: { unit: 'month', interval: 12 } }), /\r\nRRULE:FREQ=YEARLY\r\n/);
  assert.match(buildICS({ ...base, recurrence: { unit: 'month', interval: 1 } }), /\r\nRRULE:FREQ=MONTHLY\r\n/);
  const six = buildICS({ ...base, recurrence: { unit: 'month', interval: 6 } });
  assert.match(six, /\r\nRRULE:FREQ=MONTHLY;INTERVAL=6\r\n/);
  assert.match(six, /DTEND;VALUE=DATE:20270101/);
  assert.match(six, /SUMMARY:Car\\, insurance expires/);
});

test('icsFilename is a safe slug', () => {
  assert.equal(icsFilename({ name: 'Passport' }), 'passport.ics');
  assert.equal(icsFilename({ name: 'Car / Home insurance!' }), 'car-home-insurance.ics');
  assert.equal(icsFilename({ name: '***' }), 'renewal.ics');
});
