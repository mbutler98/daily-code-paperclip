// Renewal Radar — the one screen, three sheets and a snackbar.
import {
  CATEGORIES, LEAD_MIN, LEAD_MAX, categoryDefaults, todayISO, classify, headline,
  pillText, spokenCountdown, formatDate, rollForward, parseDate, normalizeItem, newId,
  exportPayload, exportFilename, parseBackup, mergeItems, buildICS, icsFilename,
} from './core.js';

const STORE_KEY = 'renewal-radar.v1';
const UI_KEY = 'renewal-radar.ui.v1';
const SNACK_MS = 8000;

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const GLYPHS = {
  overdue: '<svg viewBox="0 0 20 20" width="20" height="20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="2"/><path d="M10 6v4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="10" cy="14" r="1.1" fill="currentColor"/></svg>',
  act: '<svg viewBox="0 0 20 20" width="20" height="20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="2"/><circle cx="10" cy="10" r="3.2" fill="currentColor"/></svg>',
  later: '<svg viewBox="0 0 20 20" width="20" height="20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.5" opacity=".8"/></svg>',
  chevron: '<svg viewBox="0 0 20 20" width="20" height="20" fill="none" aria-hidden="true"><path d="M8 5l5 5-5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  check: '<svg class="chip__check" viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden="true"><path d="M4.5 10.5l3.5 3.5 7.5-8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  renewed: '<svg viewBox="0 0 20 20" width="20" height="20" fill="none" aria-hidden="true"><path d="M16 10a6 6 0 1 1-1.8-4.3M16 3.5v3.2h-3.2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  calendar: '<svg viewBox="0 0 20 20" width="20" height="20" fill="none" aria-hidden="true"><rect x="3" y="4.5" width="14" height="12.5" rx="2" stroke="currentColor" stroke-width="2"/><path d="M3 8.5h14M7 2.5v4M13 2.5v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  edit: '<svg viewBox="0 0 20 20" width="20" height="20" fill="none" aria-hidden="true"><path d="M12.5 4.5l3 3L7 16H4v-3l8.5-8.5z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  delete: '<svg viewBox="0 0 20 20" width="20" height="20" fill="none" aria-hidden="true"><path d="M4 6h12M8 6V4h4v2M6 6l.8 10h6.4L14 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  radar: '<svg viewBox="0 0 96 96" width="96" height="96" fill="none" aria-hidden="true"><circle cx="48" cy="48" r="44" stroke="currentColor" stroke-width="2" opacity=".55"/><circle cx="48" cy="48" r="30" stroke="currentColor" stroke-width="2" opacity=".40"/><circle cx="48" cy="48" r="16" stroke="currentColor" stroke-width="2" opacity=".28"/><path d="M48 48L78 30" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity=".55"/><circle cx="66" cy="34" r="5" fill="#E08A1E"/></svg>',
};

const BAND_NAMES = { overdue: 'Overdue', act: 'Act now', later: 'Later' };

// ---------- state ----------

let items = [];
let corruptRaw = null;
let ui = { laterOpen: null, urgentWasPresent: null, calHintShown: false };
let expandedId = null;
let highlightId = null;
let lastToday = todayISO();

function loadUI() {
  try { ui = { ...ui, ...JSON.parse(localStorage.getItem(UI_KEY) || '{}') }; } catch { /* keep defaults */ }
}

function saveUI() {
  try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch { /* a lost preference is harmless */ }
}

function loadItems() {
  const raw = localStorage.getItem(STORE_KEY);
  if (raw === null) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('not an array');
    return parsed.map(i => normalizeItem(i)).filter(Boolean);
  } catch {
    corruptRaw = raw;
    return [];
  }
}

/** Write `next` to storage; only on success does the screen change. */
function commit(next) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(next));
  } catch (err) {
    snack("Couldn't save — your phone's storage for this app is full.", 'Export', () => openDataSheet(null));
    return false;
  }
  items = next;
  return true;
}

// ---------- rendering ----------

function render() {
  const radar = $('radar');
  const today = todayISO();
  lastToday = today;

  if (corruptRaw !== null) {
    $('fab').hidden = true;
    radar.innerHTML = `
      <section class="recovery" aria-labelledby="recovery-title">
        <h2 id="recovery-title">Your saved items couldn't be read.</h2>
        <p>This can happen if the file was edited outside the app.</p>
        <div class="stack">
          <button class="btn btn--primary" type="button" data-recovery="download">Download raw data</button>
          <button class="btn btn--danger" type="button" data-recovery="fresh">Start fresh</button>
        </div>
      </section>`;
    return;
  }

  if (items.length === 0) {
    $('fab').hidden = true;
    radar.innerHTML = `
      <section class="empty" aria-labelledby="empty-title">
        <div class="empty__mark">${GLYPHS.radar}</div>
        <h2 class="empty__title" id="empty-title">Nothing on the radar</h2>
        <p class="empty__body">Add the first thing with a date on it — a passport, an insurance policy, a free trial.</p>
        <div class="chips">
          <button class="chip" type="button" data-starter="Passport|Document">Passport</button>
          <button class="chip" type="button" data-starter="Insurance|Insurance">Insurance</button>
          <button class="chip" type="button" data-starter="Free trial|Subscription">Free trial</button>
        </div>
        <button class="btn btn--primary" type="button" data-starter="">Add an item</button>
      </section>`;
    return;
  }

  $('fab').hidden = false;
  const bands = classify(items, today);
  const head = headline(bands, today);

  // Later collapses when anything is urgent, opens when nothing is; a manual
  // toggle sticks until the urgent bands change between empty and non-empty.
  const urgent = bands.overdue.length + bands.act.length > 0;
  if (ui.urgentWasPresent !== urgent || ui.laterOpen === null) {
    ui.urgentWasPresent = urgent;
    ui.laterOpen = !urgent;
    saveUI();
  }

  let html = `
    <div class="status">
      <p class="status__title status__title--${head.tone}">${esc(head.title)}</p>
      ${head.sub ? `<p class="status__sub">${esc(head.sub)}</p>` : ''}
    </div>`;

  for (const band of ['overdue', 'act', 'later']) {
    const rows = bands[band];
    if (!rows.length) continue;
    const headerId = `band-${band}`;
    const listId = `list-${band}`;
    const label = `${BAND_NAMES[band]} <span class="band__count">· ${rows.length}</span>`;
    const header = band === 'later'
      ? `<h2 class="band__header" id="${headerId}"><button class="band__toggle" type="button" aria-expanded="${ui.laterOpen}" aria-controls="${listId}" data-toggle-later><span>${label}</span><span class="band__chevron">${GLYPHS.chevron}</span></button></h2>`
      : `<h2 class="band__header" id="${headerId}">${label}</h2>`;
    const hidden = band === 'later' && !ui.laterOpen ? ' hidden' : '';
    html += `
      <section class="band band--${band}" aria-labelledby="${headerId}">
        ${header}
        <ul class="band__list" id="${listId}"${hidden}>
          ${rows.map(r => rowHTML(r, band, today)).join('')}
        </ul>
      </section>`;
  }

  radar.innerHTML = html;
  highlightId = null;
}

function rowHTML({ item, days }, band, today) {
  const open = item.id === expandedId;
  const actionsId = `actions-${item.id}`;
  const showHint = open && !ui.calHintShown && pendingHintId === item.id;
  return `
    <li class="card${open ? ' is-open' : ''}${item.id === highlightId ? ' is-new' : ''}" data-id="${esc(item.id)}">
      <button class="row" type="button" aria-expanded="${open}" aria-controls="${actionsId}" data-row>
        <span class="row__main">
          <span class="row__glyph">${GLYPHS[band]}</span>
          <span class="row__text">
            <span class="row__name">${esc(item.name)}</span>
            <span class="row__meta">${esc(item.category)} · ${esc(formatDate(item.expiry, today))}</span>
          </span>
        </span>
        <span class="pill" aria-hidden="true">${pillText(days)}</span>
        <span class="sr-only">, ${spokenCountdown(days)}</span>
      </button>
      <div class="row-actions-wrap" id="${actionsId}">
        <div class="row-actions-inner">
          ${showHint ? '<p class="row-hint">Your iPhone will ask which calendar to add it to.</p>' : ''}
          <div class="row-actions">
            <button class="row-action row-action--accent" type="button" data-action="renewed"${open ? '' : ' tabindex="-1"'}>${GLYPHS.renewed}<span>Renewed</span></button>
            <button class="row-action" type="button" data-action="calendar"${open ? '' : ' tabindex="-1"'}>${GLYPHS.calendar}<span>Calendar</span></button>
            <button class="row-action" type="button" data-action="edit"${open ? '' : ' tabindex="-1"'}>${GLYPHS.edit}<span>Edit</span></button>
            <button class="row-action row-action--danger" type="button" data-action="delete"${open ? '' : ' tabindex="-1"'}>${GLYPHS.delete}<span>Delete</span></button>
          </div>
        </div>
      </div>
    </li>`;
}

let pendingHintId = null;

function setExpanded(id) {
  const prev = expandedId;
  expandedId = id;
  for (const card of document.querySelectorAll('.card')) {
    const open = card.dataset.id === id;
    if (!open && card.dataset.id !== prev) continue;
    card.classList.toggle('is-open', open);
    card.querySelector('[data-row]').setAttribute('aria-expanded', String(open));
    for (const b of card.querySelectorAll('.row-action')) {
      if (open) b.removeAttribute('tabindex'); else b.setAttribute('tabindex', '-1');
    }
  }
}

function collapse() {
  if (expandedId === null) return;
  expandedId = null;
  pendingHintId = null;
  render();
}

// ---------- snackbar ----------

let snackTimer = 0;
let snackHandler = null;

function snack(message, actionLabel, onAction, { focusAction = false } = {}) {
  const bar = $('snackbar');
  const action = $('snackbar-action');
  clearTimeout(snackTimer);
  $('snackbar-msg').textContent = message;
  snackHandler = onAction || null;
  action.hidden = !actionLabel;
  action.textContent = actionLabel || '';
  bar.classList.add('is-visible');
  document.body.classList.add('has-snack');
  snackTimer = setTimeout(hideSnack, SNACK_MS);
  if (focusAction && actionLabel) action.focus();
}

function hideSnack() {
  clearTimeout(snackTimer);
  const bar = $('snackbar');
  const hadFocus = bar.contains(document.activeElement);
  bar.classList.remove('is-visible');
  document.body.classList.remove('has-snack');
  snackHandler = null;
  if (hadFocus) {
    const first = document.querySelector('[data-row]') || $('fab');
    if (first && !first.hidden) first.focus(); else $('more').focus();
  }
}

// ---------- sheets ----------

let openSheet = null;
let opener = null;
let savedScroll = 0;
let sheetDirty = false;

function showSheet(sheet, returnFocusTo, focusTarget) {
  if (expandedId !== null) collapse();
  hideSnack();
  opener = returnFocusTo || document.activeElement;
  openSheet = sheet;
  sheetDirty = false;
  savedScroll = window.scrollY;
  document.body.style.top = `-${savedScroll}px`;
  document.body.classList.add('is-locked');
  const scrim = $('scrim');
  scrim.hidden = false;
  sheet.hidden = false;
  sheet.style.transform = '';
  // Force layout so the transition runs from the closed position.
  void sheet.offsetHeight;
  scrim.classList.add('is-visible');
  sheet.classList.add('is-open');
  // Focus synchronously so iOS keeps the tap as the gesture that raises the keyboard.
  if (focusTarget) focusTarget.focus({ preventScroll: true });
}

function closeSheet({ force = false } = {}) {
  if (!openSheet) return;
  if (!force && sheetDirty && !confirm('Discard changes?')) {
    openSheet.style.transform = '';
    return;
  }
  const sheet = openSheet;
  openSheet = null;
  sheet.classList.remove('is-open');
  sheet.style.transform = '';
  $('scrim').classList.remove('is-visible');
  const done = () => {
    if (openSheet === sheet) return;
    sheet.hidden = true;
    if (!openSheet) $('scrim').hidden = true;
  };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  setTimeout(done, reduce ? 0 : 200);
  document.body.classList.remove('is-locked');
  document.body.style.top = '';
  window.scrollTo(0, savedScroll);
  const back = opener && document.contains(opener) ? opener : (opener && opener.dataset && opener.dataset.returnId
    ? document.querySelector(`.card[data-id="${CSS.escape(opener.dataset.returnId)}"] [data-row]`) : null);
  if (back) back.focus({ preventScroll: true });
  else if (!$('fab').hidden) $('fab').focus({ preventScroll: true });
  opener = null;
}

function trapFocus(e) {
  if (!openSheet || e.key !== 'Tab') return;
  const focusable = [...openSheet.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter(el => !el.disabled && !el.closest('[hidden]') && el.type !== 'file');
  if (!focusable.length) return;
  const first = focusable[0], last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

function wireGrabber(sheet) {
  const grabber = sheet.querySelector('[data-grabber]');
  let startY = null, dy = 0;
  grabber.addEventListener('pointerdown', e => {
    startY = e.clientY; dy = 0;
    grabber.setPointerCapture(e.pointerId);
    sheet.classList.add('is-dragging');
  });
  grabber.addEventListener('pointermove', e => {
    if (startY === null) return;
    dy = Math.max(0, e.clientY - startY);
    sheet.style.transform = `translateY(${dy}px)`;
  });
  const end = () => {
    if (startY === null) return;
    startY = null;
    sheet.classList.remove('is-dragging');
    if (dy > 80) closeSheet();
    else sheet.style.transform = '';
  };
  grabber.addEventListener('pointerup', end);
  grabber.addEventListener('pointercancel', end);
}

// ---------- item sheet (add / edit / new date) ----------

const form = {
  sheet: () => $('item-sheet'),
  mode: 'add',          // 'add' | 'edit' | 'renew'
  editingId: null,
  category: 'Other',
  leadTouched: false,
  recurTouched: false,
};

function renderChips(selected) {
  $('f-category').innerHTML = CATEGORIES.map(c => `
    <button class="chip" type="button" role="radio" aria-checked="${c.name === selected}" tabindex="${c.name === selected ? 0 : -1}" data-category="${c.name}">${GLYPHS.check}<span>${c.name}</span></button>`).join('');
}

function setCategory(name, { applyDefaults = true } = {}) {
  form.category = name;
  for (const chip of $('f-category').querySelectorAll('.chip')) {
    const on = chip.dataset.category === name;
    chip.setAttribute('aria-checked', String(on));
    chip.tabIndex = on ? 0 : -1;
  }
  if (!applyDefaults) return;
  const d = categoryDefaults(name);
  if (!form.leadTouched) setLead(d.leadDays);
  if (!form.recurTouched) setRecurrence(d.recurrence);
}

function setLead(n) {
  const v = Math.min(LEAD_MAX, Math.max(LEAD_MIN, Math.round(Number(n)) || 0));
  $('f-lead').value = String(v);
  const [minus, plus] = form.sheet().querySelectorAll('[data-step]');
  minus.disabled = v <= LEAD_MIN;
  plus.disabled = v >= LEAD_MAX;
}

function setRecurrence(r) {
  const select = $('f-recur');
  if (!r) select.value = 'none';
  else if (r.interval === 1) select.value = '1';
  else if (r.interval === 12) select.value = '12';
  else { select.value = 'n'; $('f-recur-n').value = String(r.interval); }
  $('f-recur-n-wrap').hidden = select.value !== 'n';
}

function readRecurrence() {
  const v = $('f-recur').value;
  if (v === 'none') return null;
  if (v === 'n') {
    const n = Math.min(120, Math.max(1, Math.round(Number($('f-recur-n').value)) || 1));
    return { unit: 'month', interval: n };
  }
  return { unit: 'month', interval: Number(v) };
}

function clearErrors() {
  for (const id of ['f-name', 'f-expiry']) {
    $(id).removeAttribute('aria-invalid');
    $(`${id}-err`).hidden = true;
  }
}

function openItemSheet({ mode, item = null, preset = null, returnFocusTo = null }) {
  form.mode = mode;
  form.editingId = item ? item.id : null;
  form.leadTouched = !!item;
  form.recurTouched = !!item;
  clearErrors();
  $('item-sheet-title').textContent = mode === 'add' ? 'Add an item' : mode === 'renew' ? `New date for ${item.name}` : 'Edit item';

  const category = item ? item.category : (preset && preset.category) || 'Other';
  renderChips(category);
  $('f-name').value = item ? item.name : (preset && preset.name) || '';
  $('f-expiry').value = item ? item.expiry : '';
  $('f-note').value = item ? item.note : '';
  $('f-cost').value = item && item.cost !== null ? String(item.cost) : '';
  if (item) {
    setLead(item.leadDays);
    setRecurrence(item.recurrence);
  } else {
    setCategory(category);
  }
  form.category = category;

  const focusTarget = mode === 'renew' ? $('f-expiry') : $('f-name');
  showSheet(form.sheet(), returnFocusTo, focusTarget);
  if (mode === 'add' && preset && preset.name) $('f-name').select();
  if (mode === 'renew') {
    $('f-expiry').scrollIntoView({ block: 'center' });
    try { $('f-expiry').showPicker(); } catch { /* not every browser allows it; focus is enough */ }
  }
}

function saveItemSheet() {
  clearErrors();
  const name = $('f-name').value.trim();
  const expiry = $('f-expiry').value;
  if (!name) return invalid('f-name');
  if (!parseDate(expiry)) return invalid('f-expiry');

  const costRaw = $('f-cost').value.trim().replace(/[^0-9.,-]/g, '').replace(',', '.');
  const cost = costRaw === '' ? null : Number(costRaw);
  const date = parseDate(expiry);
  const fields = {
    name,
    category: form.category,
    expiry,
    leadDays: Math.min(LEAD_MAX, Math.max(LEAD_MIN, Math.round(Number($('f-lead').value)) || 0)),
    recurrence: readRecurrence(),
    note: $('f-note').value.trim(),
    cost: Number.isFinite(cost) ? cost : null,
  };

  if (form.mode === 'add') {
    const item = { id: newId(), ...fields, anchorDay: date.d, anchorMonth: date.m, createdAt: new Date().toISOString() };
    if (!commit([...items, item])) return;
    highlightId = item.id;
    closeSheet({ force: true });
    render();
    return;
  }

  const prev = items.find(i => i.id === form.editingId);
  if (!prev) { closeSheet({ force: true }); return; }
  const dateChanged = prev.expiry !== expiry;
  const updated = {
    ...prev,
    ...fields,
    anchorDay: dateChanged ? date.d : prev.anchorDay,
    anchorMonth: dateChanged ? date.m : prev.anchorMonth,
  };
  if (!commit(items.map(i => (i.id === prev.id ? updated : i)))) return;
  const wasRenew = form.mode === 'renew';
  closeSheet({ force: true });
  render();
  if (wasRenew) {
    snack(`${updated.name} renewed — now ${formatDate(updated.expiry)}`, 'Undo', () => restoreItem(prev));
  }
}

function invalid(id) {
  const input = $(id);
  input.setAttribute('aria-invalid', 'true');
  $(`${id}-err`).hidden = false;
  input.focus();
}

// ---------- row actions ----------

function restoreItem(prev) {
  const exists = items.some(i => i.id === prev.id);
  const next = exists ? items.map(i => (i.id === prev.id ? prev : i)) : [...items, prev];
  if (commit(next)) render();
}

function markRenewed(item, button) {
  const next = rollForward(item, todayISO());
  if (next === null) {
    openItemSheet({ mode: 'renew', item, returnFocusTo: button });
    return;
  }
  const updated = { ...item, expiry: next };
  expandedId = null;
  if (!commit(items.map(i => (i.id === item.id ? updated : i)))) return;
  render();
  snack(`${item.name} renewed — now ${formatDate(next)}`, 'Undo', () => restoreItem(item));
}

function deleteItem(item) {
  expandedId = null;
  if (!commit(items.filter(i => i.id !== item.id))) return;
  render();
  snack(`${item.name} deleted`, 'Undo', () => restoreItem(item), { focusAction: true });
}

function addToCalendar(item) {
  if (!ui.calHintShown) {
    pendingHintId = item.id;
    render();
    ui.calHintShown = true;
    saveUI();
  }
  try {
    download(icsFilename(item), buildICS(item), 'text/calendar');
  } catch {
    snack("Couldn't create the calendar file.");
  }
}

function download(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// ---------- data sheet ----------

let pendingImport = null;

function openDataSheet(returnFocusTo) {
  pendingImport = null;
  $('data-main').hidden = false;
  $('data-confirm').hidden = true;
  showSheet($('data-sheet'), returnFocusTo || $('more'), $('export'));
}

function exportBackup() {
  const today = todayISO();
  try {
    download(exportFilename(today), JSON.stringify(exportPayload(items), null, 2), 'application/json');
  } catch {
    snack("Couldn't create the backup file.");
    return;
  }
  closeSheet({ force: true });
  snack(`Backup downloaded — ${items.length} ${items.length === 1 ? 'item' : 'items'}`);
}

async function readImportFile(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch { data = null; }
  const result = parseBackup(data);
  if (!result.ok) {
    closeSheet({ force: true });
    snack("That doesn't look like a Renewal Radar backup. Nothing changed.");
    return;
  }
  pendingImport = result;
  const n = result.items.length;
  const holds = `This backup holds ${n} ${n === 1 ? 'item' : 'items'}.`;
  $('data-confirm-msg').textContent = items.length
    ? `${holds} Replace the ${items.length} you have, or add them alongside?`
    : `${holds} Add them?`;
  $('import-replace').hidden = items.length === 0;
  $('import-merge').textContent = items.length ? 'Merge' : 'Add';
  $('data-main').hidden = true;
  $('data-confirm').hidden = false;
  (items.length ? $('import-replace') : $('import-merge')).focus();
}

function applyImport(mode) {
  if (!pendingImport) return;
  const before = items;
  const { items: incoming, skipped } = pendingImport;
  pendingImport = null;
  let message;
  let next;
  if (mode === 'replace') {
    next = incoming;
    message = `Replaced with ${incoming.length} ${incoming.length === 1 ? 'item' : 'items'}`;
  } else {
    const merged = mergeItems(items, incoming);
    next = merged.items;
    message = `Added ${merged.added} ${merged.added === 1 ? 'item' : 'items'}.`;
    if (merged.matched) message += ` ${merged.matched} ${merged.matched === 1 ? 'was' : 'were'} already here.`;
  }
  if (skipped) message += ` ${skipped} ${skipped === 1 ? 'was' : 'were'} skipped — ${skipped === 1 ? 'it' : 'they'} had no name or no date.`;
  if (!commit(next)) return;
  closeSheet({ force: true });
  expandedId = null;
  render();
  snack(message, 'Undo', () => { if (commit(before)) render(); });
}

// ---------- events ----------

function onRadarClick(e) {
  const starter = e.target.closest('[data-starter]');
  if (starter) {
    const [name, category] = starter.dataset.starter.split('|');
    openItemSheet({ mode: 'add', preset: name ? { name, category } : null, returnFocusTo: $('fab') });
    return;
  }

  const recovery = e.target.closest('[data-recovery]');
  if (recovery) {
    if (recovery.dataset.recovery === 'download') download(`renewal-radar-raw-${todayISO()}.txt`, corruptRaw, 'text/plain');
    else if (confirm('Delete everything and start over?')) {
      corruptRaw = null;
      if (commit([])) render();
    }
    return;
  }

  if (e.target.closest('[data-toggle-later]')) {
    ui.laterOpen = !ui.laterOpen;
    saveUI();
    render();
    return;
  }

  const card = e.target.closest('.card');
  if (!card) return;
  const item = items.find(i => i.id === card.dataset.id);
  if (!item) return;

  if (e.target.closest('[data-row]')) {
    if (expandedId === item.id) { collapse(); return; }
    if (expandedId !== null && lastToday !== todayISO()) { expandedId = item.id; render(); return; }
    pendingHintId = null;
    for (const hint of document.querySelectorAll('.row-hint')) hint.remove();
    setExpanded(item.id);
    return;
  }

  const action = e.target.closest('[data-action]');
  if (!action) return;
  const button = card.querySelector('[data-row]');
  button.dataset.returnId = item.id;
  switch (action.dataset.action) {
    case 'renewed': markRenewed(item, button); break;
    case 'calendar': addToCalendar(item); break;
    case 'edit': openItemSheet({ mode: 'edit', item, returnFocusTo: button }); break;
    case 'delete': deleteItem(item); break;
  }
}

function wire() {
  $('radar').addEventListener('click', onRadarClick);

  // Tapping anywhere outside the list collapses the open row.
  // Only real taps count: the synthetic click that triggers a download must not.
  document.addEventListener('click', e => {
    if (!e.isTrusted) return;
    if (expandedId !== null && !e.target.closest('.card') && !e.target.closest('.snackbar')) collapse();
  });

  $('fab').addEventListener('click', () => openItemSheet({ mode: 'add', returnFocusTo: $('fab') }));
  $('more').addEventListener('click', () => openDataSheet($('more')));

  $('scrim').addEventListener('click', () => closeSheet());
  for (const sheet of document.querySelectorAll('.sheet')) {
    wireGrabber(sheet);
    for (const c of sheet.querySelectorAll('[data-cancel]')) c.addEventListener('click', () => closeSheet({ force: true }));
  }

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && openSheet) { e.preventDefault(); closeSheet(); }
    trapFocus(e);
  });

  // Item form
  const itemForm = $('item-form');
  itemForm.addEventListener('submit', e => { e.preventDefault(); saveItemSheet(); });
  itemForm.addEventListener('input', () => { sheetDirty = true; });
  $('f-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); if ($('f-name').value.trim() && $('f-expiry').value) saveItemSheet(); else $('f-expiry').focus(); }
  });
  $('f-category').addEventListener('click', e => {
    const chip = e.target.closest('[data-category]');
    if (!chip) return;
    sheetDirty = true;
    setCategory(chip.dataset.category);
  });
  $('f-category').addEventListener('keydown', e => {
    const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    if (!(e.key in keys)) return;
    e.preventDefault();
    const names = CATEGORIES.map(c => c.name);
    const next = names[(names.indexOf(form.category) + keys[e.key] + names.length) % names.length];
    sheetDirty = true;
    setCategory(next);
    $('f-category').querySelector(`[data-category="${next}"]`).focus();
  });
  for (const b of itemForm.querySelectorAll('[data-step]')) {
    b.addEventListener('click', () => {
      form.leadTouched = true;
      sheetDirty = true;
      setLead(Number($('f-lead').value) + Number(b.dataset.step));
    });
  }
  $('f-lead').addEventListener('input', () => { form.leadTouched = true; });
  $('f-lead').addEventListener('change', () => setLead($('f-lead').value));
  $('f-recur').addEventListener('change', () => {
    form.recurTouched = true;
    $('f-recur-n-wrap').hidden = $('f-recur').value !== 'n';
  });
  $('f-recur-n').addEventListener('input', () => { form.recurTouched = true; });

  // Data sheet
  $('export').addEventListener('click', exportBackup);
  $('import').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', e => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (file) readImportFile(file);
  });
  $('import-replace').addEventListener('click', () => applyImport('replace'));
  $('import-merge').addEventListener('click', () => applyImport('merge'));

  // Snackbar
  $('snackbar-action').addEventListener('click', e => {
    e.stopPropagation();
    const handler = snackHandler;
    hideSnack();
    if (handler) handler();
  });
  $('snackbar').addEventListener('click', e => { if (e.target === $('snackbar') || e.target === $('snackbar-msg')) hideSnack(); });

  // Re-derive today whenever the app comes back into view. No timers.
  const refresh = () => { if (!openSheet && todayISO() !== lastToday) render(); };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
  window.addEventListener('focus', refresh);
  window.addEventListener('pageshow', refresh);

  // Keep other tabs' edits in step.
  window.addEventListener('storage', e => {
    if (e.key !== STORE_KEY || openSheet) return;
    corruptRaw = null;
    items = loadItems();
    render();
  });
}

// ---------- boot ----------

loadUI();
items = loadItems();
wire();
render();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => { /* the app still works online */ });
}
