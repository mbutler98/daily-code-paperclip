# Renewal Radar

Things that expire don't announce themselves. Renewal Radar keeps the passport, the insurance, the registration and the free trial on one screen, sorted by what lapses next. Each item has its own warning window.

**Live:** https://mbutler98.github.io/daily-code-paperclip/renewal-radar/

- **Bands:** *Overdue*, *Act now* (inside the item's own lead window) and *Later*. The headline gives the count that needs attention.
- **Mark renewed:** recurring items roll forward by their period and keep their anniversary. One-off items ask for the new date.
- **Add to Calendar:** downloads a `.ics` with an alarm at the item's lead time, so the phone does the reminding.
- **Offline PWA:** install it from Safari's Share → Add to Home Screen. After the first load it works with no network. Data stays in `localStorage` on the device.
- **Backup:** use `⋯` to export or import a JSON file.

## Files

| File | Role |
|---|---|
| `core.js` | Pure logic: date maths, bands, wording, `.ics`, backup validation. No DOM. |
| `app.js` | The screen, the sheets, storage. |
| `sw.js` | Cache-first service worker. Bump `VERSION` when a shell file changes. |
| `tests/` | `node --test "tests/**/*.test.js"`. They cover month-end clamping, the anchor-day rule, leap days, a timezone change, DST, and lead windows opening at midnight. |

## Date rules

Expiries are stored as plain `YYYY-MM-DD` strings. "Today" is read from the device's local calendar on every render. Day counts are differenced at UTC midnight, so DST never shifts them. Monthly and yearly roll-forwards go from the item's anchor day: 31 Jan → 28 Feb → 31 Mar, and 29 Feb comes back in the next leap year.
