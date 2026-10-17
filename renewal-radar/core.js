// Renewal Radar — pure logic. No DOM, no storage: everything here is
// deterministic given its inputs, so it runs unchanged in the browser and
// under `node --test`.
//
// Dates are plain calendar strings, YYYY-MM-DD. "Today" is always derived
// from the device's local calendar; day counts are differenced at UTC
// midnight so DST never enters the arithmetic.

export const CATEGORIES = [
  { name: 'Document', leadDays: 42, recurrence: null },
  { name: 'Insurance', leadDays: 21, recurrence: { unit: 'month', interval: 12 } },
  { name: 'Vehicle', leadDays: 30, recurrence: { unit: 'month', interval: 12 } },
  { name: 'Subscription', leadDays: 3, recurrence: { unit: 'month', interval: 1 } },
  { name: 'Membership', leadDays: 30, recurrence: { unit: 'month', interval: 12 } },
  { name: 'Other', leadDays: 14, recurrence: null },
];

export const LEAD_MIN = 0;
export const LEAD_MAX = 365;
const ROLL_GUARD = 1200;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_MS = 86400000;

export function categoryDefaults(name) {
  const c = CATEGORIES.find(c => c.name === name) || CATEGORIES[CATEGORIES.length - 1];
  return { leadDays: c.leadDays, recurrence: c.recurrence ? { ...c.recurrence } : null };
}

// ---------- calendar dates ----------

export function isLeapYear(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(y, m) {
  return [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}

/** "2027-03-14" → { y: 2027, m: 3, d: 14 }, or null if it isn't a real date. */
export function parseDate(s) {
  if (typeof s !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!match) return null;
  const y = +match[1], m = +match[2], d = +match[3];
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return { y, m, d };
}

export function formatISO({ y, m, d }) {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Today's date on the device's local calendar. Never toISOString(). */
export function todayISO(now = new Date()) {
  return formatISO({ y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() });
}

const toUTC = ({ y, m, d }) => Date.UTC(y, m - 1, d);

/** Whole days from `from` to `to` (both YYYY-MM-DD). Negative when `to` is earlier. */
export function daysBetween(from, to) {
  return Math.round((toUTC(parseDate(to)) - toUTC(parseDate(from))) / DAY_MS);
}

export function addDays(iso, n) {
  const t = new Date(toUTC(parseDate(iso)) + n * DAY_MS);
  return formatISO({ y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() });
}

/**
 * Move `iso` forward by `n` months, landing on `anchorDay` clamped to the
 * target month's length. Rolling from the anchor rather than from the previous
 * (clamped) result is what stops 31 Jan → 28 Feb → 28 Mar drift.
 */
export function addMonths(iso, n, anchorDay = parseDate(iso).d) {
  const { y, m } = parseDate(iso);
  const zeroBased = m - 1 + n;
  const ty = y + Math.floor(zeroBased / 12);
  const tm = (((zeroBased % 12) + 12) % 12) + 1;
  return formatISO({ y: ty, m: tm, d: Math.min(anchorDay, daysInMonth(ty, tm)) });
}

/**
 * The next expiry after a renewal: step the current expiry forward by the
 * item's period until it is strictly after today. Keeps the anniversary even
 * when the renewal is marked late. Returns null for one-off items.
 */
export function rollForward(item, today) {
  if (!item.recurrence) return null;
  const interval = Math.max(1, Math.floor(item.recurrence.interval) || 1);
  const anchorDay = item.anchorDay || parseDate(item.expiry).d;
  let next = item.expiry;
  for (let i = 0; i < ROLL_GUARD; i++) {
    next = addMonths(next, interval, anchorDay);
    if (daysBetween(today, next) > 0) return next;
  }
  // Bad stored data (e.g. an expiry centuries ago). Fall back to one period from today.
  return addMonths(today, interval, anchorDay);
}

// ---------- bands ----------

export const BANDS = ['overdue', 'act', 'later'];

export function bandOf(days, leadDays) {
  if (days < 0) return 'overdue';
  if (days <= leadDays) return 'act';
  return 'later';
}

/** Group items into bands, each sorted by days remaining then name. */
export function classify(items, today) {
  const out = { overdue: [], act: [], later: [] };
  const rows = items.map(item => {
    const days = daysBetween(today, item.expiry);
    return { item, days, band: bandOf(days, item.leadDays) };
  });
  rows.sort((a, b) => a.days - b.days || a.item.name.toLowerCase().localeCompare(b.item.name.toLowerCase()));
  for (const row of rows) out[row.band].push(row);
  return out;
}

// ---------- words ----------

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const monthsFor = days => Math.max(2, Math.round(days / 30.4375));

/** The short countdown on the pill. */
export function pillText(days) {
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return '1d ago';
  if (days > 60) return `in ${monthsFor(days)}mo`;
  if (days > 0) return `in ${days}d`;
  if (days < -60) return `${monthsFor(-days)}mo ago`;
  return `${-days}d ago`;
}

/** The full phrase a screen reader hears in place of the pill. */
export function spokenCountdown(days) {
  if (days === 0) return 'expires today';
  if (days === 1) return 'expires tomorrow';
  if (days > 0) return `in ${plural(days, 'day', 'days')}`;
  return `overdue by ${plural(-days, 'day', 'days')}`;
}

/** "in 6 days" / "today" / "tomorrow", for running copy. */
export function relativePhrase(days) {
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${plural(days, 'day', 'days')}`;
}

/** 14 Mar 2027. With `todayIso`, drops the year when it is the current one. */
export function formatDate(iso, todayIso) {
  const { y, m, d } = parseDate(iso);
  const short = `${d} ${MONTHS[m - 1]}`;
  if (todayIso && parseDate(todayIso).y === y) return short;
  return `${short} ${y}`;
}

/** The two-line answer at the top of the screen. */
export function headline(bands, today) {
  const o = bands.overdue.length, a = bands.act.length, l = bands.later.length;
  if (o + a + l === 0) return null;
  if (o > 0) {
    return {
      tone: 'overdue',
      title: `${o} overdue`,
      sub: a > 0 ? `${a} more ${a === 1 ? 'needs' : 'need'} attention` : '',
    };
  }
  if (a > 0) {
    const next = bands.act[0];
    return {
      tone: 'act',
      title: `${a} ${a === 1 ? 'needs' : 'need'} attention`,
      sub: `Next: ${next.item.name} ${relativePhrase(next.days)}`,
    };
  }
  const next = bands.later[0];
  return {
    tone: 'clear',
    title: 'All clear',
    sub: `Nothing due until ${formatDate(next.item.expiry, today)} — that's ${plural(next.days, 'day', 'days')}`,
  };
}

// ---------- items ----------

export function newId() {
  return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
}

function cleanRecurrence(r) {
  if (!r || typeof r !== 'object') return null;
  const interval = Math.floor(Number(r.interval));
  if (!Number.isFinite(interval) || interval < 1 || interval > 120) return null;
  return { unit: 'month', interval };
}

function clampLead(n, fallback) {
  const v = Math.round(Number(n));
  if (n === null || n === undefined || n === '' || !Number.isFinite(v)) return fallback;
  return Math.min(LEAD_MAX, Math.max(LEAD_MIN, v));
}

/**
 * Coerce a raw object into a valid item, or return null if it lacks the two
 * things an item can't do without: a name and a real date.
 */
export function normalizeItem(raw, now = new Date()) {
  if (!raw || typeof raw !== 'object') return null;
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  const date = parseDate(raw.expiry);
  if (!name || !date) return null;
  const category = CATEGORIES.some(c => c.name === raw.category) ? raw.category : 'Other';
  const defaults = categoryDefaults(category);
  const cost = raw.cost === null || raw.cost === undefined || raw.cost === '' ? null : Number(raw.cost);
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newId(),
    name,
    category,
    expiry: raw.expiry,
    leadDays: clampLead(raw.leadDays, defaults.leadDays),
    recurrence: 'recurrence' in raw ? cleanRecurrence(raw.recurrence) : defaults.recurrence,
    anchorDay: Number.isInteger(raw.anchorDay) && raw.anchorDay >= 1 && raw.anchorDay <= 31 ? raw.anchorDay : date.d,
    anchorMonth: Number.isInteger(raw.anchorMonth) && raw.anchorMonth >= 1 && raw.anchorMonth <= 12 ? raw.anchorMonth : date.m,
    note: typeof raw.note === 'string' ? raw.note : '',
    cost: Number.isFinite(cost) ? cost : null,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now.toISOString(),
  };
}

// ---------- backup ----------

export function exportPayload(items, now = new Date()) {
  return { app: 'renewal-radar', version: 1, exportedAt: now.toISOString(), items };
}

export function exportFilename(today) {
  return `renewal-radar-${today}.json`;
}

/**
 * Validate a parsed backup. Returns { ok: true, items, skipped } or
 * { ok: false } when the file isn't a Renewal Radar backup or holds no usable item.
 */
export function parseBackup(data) {
  if (!data || typeof data !== 'object' || data.app !== 'renewal-radar' || !Array.isArray(data.items)) {
    return { ok: false };
  }
  const items = [];
  let skipped = 0;
  for (const raw of data.items) {
    const item = normalizeItem(raw);
    if (item) items.push(item); else skipped++;
  }
  if (items.length === 0) return { ok: false };
  return { ok: true, items, skipped };
}

/** Merge on id; an incoming item with a matching id wins. */
export function mergeItems(existing, incoming) {
  const byId = new Map(existing.map(i => [i.id, i]));
  let added = 0, matched = 0;
  for (const item of incoming) {
    if (byId.has(item.id)) matched++; else added++;
    byId.set(item.id, item);
  }
  return { items: [...byId.values()], added, matched };
}

// ---------- calendar (.ics) ----------

export function icsEscape(text) {
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/** Fold a content line at 75 octets (RFC 5545 §3.1), never splitting a UTF-8 sequence. */
export function icsFold(line) {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const parts = [];
  let current = '', size = 0, limit = 75;
  for (const ch of line) {
    const n = encoder.encode(ch).length;
    if (size + n > limit) {
      parts.push(current);
      current = '';
      size = 0;
      limit = 74; // continuation lines start with a space
    }
    current += ch;
    size += n;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

const compact = iso => iso.replace(/-/g, '');

export function buildICS(item, now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Renewal Radar//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${item.id}@renewal-radar`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${compact(item.expiry)}`,
    `DTEND;VALUE=DATE:${compact(addDays(item.expiry, 1))}`,
  ];
  if (item.recurrence) {
    const n = item.recurrence.interval;
    lines.push(n === 12 ? 'RRULE:FREQ=YEARLY' : n === 1 ? 'RRULE:FREQ=MONTHLY' : `RRULE:FREQ=MONTHLY;INTERVAL=${n}`);
  }
  lines.push(
    `SUMMARY:${icsEscape(`${item.name} expires`)}`,
    `DESCRIPTION:${icsEscape(item.note ? `${item.note}\nFrom Renewal Radar.` : 'From Renewal Radar.')}`,
    'BEGIN:VALARM',
    `TRIGGER:-P${item.leadDays}D`,
    'ACTION:DISPLAY',
    `DESCRIPTION:${icsEscape(`${item.name} expires ${item.leadDays === 0 ? 'today' : `in ${plural(item.leadDays, 'day', 'days')}`}`)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  );
  return lines.map(icsFold).join('\r\n') + '\r\n';
}

export function icsFilename(item) {
  const slug = item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${slug || 'renewal'}.ics`;
}
