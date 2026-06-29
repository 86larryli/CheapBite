<div align="center">

<img src="extension/icons/icon-128.png" width="96" height="96" alt="CheapBite icon">

# CheapBite

**Find the cheapest place to order pickup — right from a Google Maps listing.**

[![CI](https://github.com/86larryli/CheapBite/actions/workflows/ci.yml/badge.svg)](https://github.com/86larryli/CheapBite/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue.svg)

</div>

Restaurants mark menus up 15–25% on Uber Eats / DoorDash / Grubhub to offset
platform commissions, so the **same food costs very different amounts** depending
on where you order — and the cheapest channel (often the restaurant's own
"Direct" site) varies by restaurant. CheapBite finds it for you.

<!-- TODO: add a screenshot / GIF of the comparison overlay here -->

## How it works

1. **Detect** — on a restaurant's Google Maps listing, CheapBite adds a
   **"Compare pickup prices"** button.
2. **Discover** — it reads Google's "Order online" page to find every ordering
   channel: the delivery aggregators **and** the restaurant's own Direct site.
3. **Gather** — on your click, the service worker opens each channel's menu in a
   short-lived background tab, reads the items and prices, and closes it.
4. **Rank** — it matches items across channels and shows each one's estimated
   **markup vs. the cheapest** (the Direct site is preferred as the baseline),
   flagging anything it couldn't read and disclosing any service fees.

Everything runs locally in your browser — there's no server. See
[`PRIVACY.md`](PRIVACY.md).

## Supported channels

**Direct (the restaurant's own commission-free ordering — usually cheapest):**
Clover · Toast · DoorDash Storefront (`order.online`) · Chowbus POS ·
MealKeyway / MenuSifu · BeyondMenu · ChowNow (incl. "ChowNow Local") ·
Grubhub Direct (`*.dine.online`).

**Delivery aggregators:** DoorDash (+ Caviar) · Uber Eats (+ Postmates) ·
Grubhub (+ Seamless) · Fantuan · HungryPanda.

New channels are added as **adapters** — see [Contributing](#contributing).

## Install

**From the Chrome Web Store:** _coming soon._

**From source (for development):**

```bash
git clone https://github.com/86larryli/CheapBite.git
cd CheapBite
```

Then open `chrome://extensions`, enable **Developer mode**, click **Load
unpacked**, and select the `extension/` folder. Open a restaurant on Google Maps
and click **Compare pickup prices**.

## Development

```bash
npm ci
npx playwright install --with-deps chromium

npm run lint        # ESLint
npm run test:ci     # deterministic test suite (the CI gate)
npm test            # everything, incl. live tests
npm run package     # build dist/cheapbite.zip for the store
npm run icons       # regenerate icon PNGs from extension/icons/icon.svg
```

The deterministic tests run each adapter and the matching logic against captured
HTML fixtures with the network blocked. The `live:` end-to-end tests drive real
Google Maps + ordering sites and are excluded from CI (manual smoke tests).

## Architecture

CheapBite is plain JavaScript with **no build step** — a deliberate choice for
fast load-unpacked iteration ([ADR-0005](docs/adr/0005-build-as-browser-extension-not-server-side.md)).
The design and its rationale are written down:

- [`CONTEXT.md`](CONTEXT.md) — vocabulary (Channel, Direct, Adapter, Upcharge, …)
- [`PLAN.md`](PLAN.md) — flow, scope, and phased build
- [`docs/adr/`](docs/adr) — architecture decision records

## Contributing

Contributions — especially **new channel adapters** — are welcome. See
[`CONTRIBUTING.md`](CONTRIBUTING.md) for the dev setup and a step-by-step adapter
guide. Releases are documented in [`docs/RELEASING.md`](docs/RELEASING.md).

## Privacy

CheapBite collects nothing and has no backend; it only reads public menu pages
locally to build the comparison. Full policy: [`PRIVACY.md`](PRIVACY.md).

## License

[MIT](LICENSE) © Larry Li
