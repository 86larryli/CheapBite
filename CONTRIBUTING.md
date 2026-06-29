# Contributing to CheapBite

Thanks for your interest! CheapBite is a plain-JavaScript Manifest V3 Chrome
extension with **no build step** — you load it unpacked and iterate. This guide
covers the dev setup, the test suite, and the most common contribution: adding
support for a new ordering channel (an **adapter**).

By participating you agree to abide by our [Code of Conduct](./CODE_OF_CONDUCT.md).

## Development setup

```bash
git clone https://github.com/86larryli/CheapBite.git
cd CheapBite
npm ci
npx playwright install --with-deps chromium   # for the test suite
```

Load it in Chrome: open `chrome://extensions`, enable **Developer mode**, click
**Load unpacked**, and select the `extension/` folder.

## Tests & linting

| Command | What it runs |
| --- | --- |
| `npm run lint` | ESLint over the whole repo (must pass) |
| `npm run test:ci` | The deterministic, hermetic Playwright suite (the CI gate) |
| `npm test` | Everything, including the live tests |
| `npm run test:e2e` | Only the live end-to-end tests |

The suite has two kinds of tests:

- **Deterministic** specs run each adapter / the discovery + matching logic
  against captured HTML **fixtures** (`test/fixtures/`) with the network blocked.
  These are fast, reliable, and **required** to pass.
- **Live** specs (titled `live:`, filenamed `e2e-*.spec.js`) drive real Google
  Maps and real ordering sites in a headed browser. They're flaky by nature and
  are **excluded from CI** — treat them as manual smoke tests.

Please keep `npm run lint` and `npm run test:ci` green in every PR.

## Project layout

```
extension/            the unpacked extension (what ships)
  manifest.json
  content.js          place detection, the Maps button, the results overlay
  discovery.js        find ordering channels on Google's provider page
  families.js         dedupe channels by ownership family + route to adapters
  compare.js          name matching + Upcharge ranking
  background.js       service worker: gather each menu in a background tab
  adapters/*.js       one menu reader per ordering backend
docs/adr/             architecture decision records (the "why")
test/specs/           Playwright tests
test/fixtures/        captured menu/discovery HTML
```

Start with [`CONTEXT.md`](./CONTEXT.md) (glossary) and the ADRs in
[`docs/adr/`](./docs/adr) before changing core logic.

## Adding an adapter (the common case)

Each ordering backend has one adapter that turns its menu page into a list of
`{ name, price }`. The contract (see any file in `extension/adapters/`):

```js
window.CheapBiteAdapters.<id> = {
  backend: "Display Name",
  matches(url) { /* true if this adapter handles url's host */ },
  readMenu(root) { /* return [{name, price}] (may be async) */ }
};
```

Steps:

1. **Recon the menu page first.** Open it and check: is the menu in JSON-LD,
   in the DOM, or in an embedded JSON/Flight blob? Is the list virtualized? Are
   there traps — a points/rewards section, a struck-through/coupon price, a
   trailing `+` size price, bilingual names, a login/closed gate? (See the
   existing adapters — they document the quirks they hit.)
2. **Write `extension/adapters/<id>.js`.** Read the **regular, pre-discount**
   price; keep the full item name (including any non-Latin script — matching is
   script-aware). Prefer stable selectors; for hashed CSS-module classes, match
   by prefix (`[class*="Foo_bar"]`).
3. **Wire it up:**
   - Aggregator → add to `AGGREGATORS` in `discovery.js` and to
     `PROVIDER_FAMILY` / `CANONICAL` / `FAMILY_ADAPTER` in `families.js`.
   - Direct (own-site) backend → add to `DIRECT_BACKENDS` in `discovery.js` and
     `BACKEND_ADAPTER` in `families.js`.
   - Add the host to `host_permissions` in `manifest.json`.
   - If it's a slow SPA or a virtualized list, set its budget in
     `ADAPTER_READ_MS` (and add it to `VIRTUALIZED` if it needs a focused tab).
4. **Capture a fixture + add a spec.** Save the rendered menu HTML to
   `test/fixtures/` and add a deterministic test in `test/specs/` asserting the
   item count and a couple of known name/price pairs (mirror an existing
   `*.spec.js`). Add a discovery test if you touched `discovery.js`/`families.js`.
5. `npm run lint && npm run test:ci` → green.

## Pull requests

- Keep changes focused; one adapter or one fix per PR where practical.
- Match the surrounding code style (2-space indent, `"use strict"`, the existing
  comment density). `.editorconfig` + ESLint enforce the basics.
- Write clear commit messages (imperative mood; a short subject + a body if the
  change is non-obvious).
- Describe how you tested the change in the PR (and which live store, if any).

Thank you for contributing!
