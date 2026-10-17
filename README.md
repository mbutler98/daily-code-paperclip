# Daily Code

Small daily-life projects, one per folder, each built in a day. Static sites with no build step, published together on GitHub Pages.

**Live:** https://mbutler98.github.io/daily-code-paperclip/

## Projects

| Project | What it does | Live |
|---|---|---|
| [Renewal Radar](renewal-radar/) | Tracks things that expire (passport, insurance, registration, free trials) and shows what needs attention now, with a lead time per item. Offline PWA. | [Open](https://mbutler98.github.io/daily-code-paperclip/renewal-radar/) |

## How the repo is laid out

```
/<slug>/                 one project: index.html, its JS/CSS, assets
/<slug>/tests/*.test.js  its tests (Node's built-in test runner, no dependencies)
/index.html              the list of projects (this table, as a page)
/.github/workflows/      ci.yml runs every project's tests; pages.yml deploys after CI passes on main
```

### Adding a project

1. Create `/<slug>/` with an `index.html`. Use relative paths everywhere so it works under `/daily-code-paperclip/<slug>/`.
2. Put tests in `/<slug>/tests/*.test.js`. If the project's JS uses `import`, add a `package.json` with `"type": "module"` in the folder.
3. Add a row to the table above and a card to the root `index.html`.
4. Open a PR. CI must be green before merging; the Pages deploy runs on its own after the merge.

### Running tests locally

```sh
cd renewal-radar
node --test "tests/**/*.test.js"
```

Node 22 or newer.
