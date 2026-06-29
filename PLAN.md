# CheapBite — Design & Build Plan

A Chrome extension that, when you're on a restaurant's Google Maps listing, tells you the **cheapest place to order the exact items you want for pickup** — including the restaurant's own ("Direct") site, which is usually cheaper than the aggregators.

This file is the connective tissue. The **vocabulary** lives in [`CONTEXT.md`](./CONTEXT.md); the **decisions and their rationale** live in [`docs/adr/`](./docs/adr/). Read those for the "why"; this for the "what" and "in what order."

> Supersedes the earlier server-side draft plan written during initial evaluation — the design moved to a browser extension (see ADR-0005).

## Why this exists

Restaurants mark up menus 15–25% on Uber Eats / DoorDash to offset 15–30% platform commissions, so the same Basket costs very different amounts per Channel — and the cheapest Channel (often Direct) varies by restaurant. The market validates the pain (a funded startup, MealMe, built the consumer version before pivoting to B2B) and also the warnings: the data is adversarial to scrape and the value is hard to monetize. So this is scoped as a **side project that first proves the thesis for its builder**, with monetization deferred.

## The flow (pickup MVP)

> **Phase 1 reality (ADR-0009):** Phase 1 ranks Channels by a sampled **Upcharge** estimate and does *not* ask the user to build a Basket. The exact-Basket flow below (steps 3–7) is the later *precision* mode.

1. **Detect** — user is on a restaurant's Google Maps listing; the extension injects a **"Compare pickup prices"** button.
2. **Discover** — on click, read the listing's "Order online" provider links **and** the "Website" link → the Channel set, including **Direct** (detect its Ordering Backend behind the Website link when Google doesn't list it). *(ADR-0002, ADR-0004)*
3. **Build the Basket** — user assembles their cart on the real **anchor site** (Direct by default); the platform's native UI handles all modifiers; the extension reads the finished cart = the Basket. *(ADR-0007)*
4. **Gather (auto-pilot)** — the service worker dedupes Channels by ownership family *(ADR-0012)*, then for each cache-missed Channel opens a **background tab**, **programmatically injects** that Channel's Adapter *(ADR-0010)*, reads the menu, and closes the tab. Sequential, cache-miss-only, with progress shown; failures are flagged and recoverable walls trigger a co-pilot handoff *(ADR-0011)*. *(ADR-0006)*
5. **Quote & rank** — each Channel's **Quote** = matched-items subtotal, pre-discount. Rank ascending. *(`Quote` in CONTEXT.md)*
6. **Show** — overlay: Channels ranked, cheapest highlighted with **"$X / Y% cheaper than [anchor]"**; provenance ("prices as of …") + **Refresh**; **too-close-to-call** warning when the top two are within ~$2/~5%; low-confidence Matches flagged **inline to confirm** (correcting one re-ranks live).
7. **Handoff** — **"Go order"** deep-links to the winning Channel. If **Direct wins** (the common case), the cart is already there → one click. If a **non-anchor wins**, show the **rebuild list** (we do not auto-fill another platform's cart). 
8. **Cache** — per-Channel menus cached **~7 days** with provenance; lazy scrape on miss/stale; gather other Channels **in the background while the user builds the Basket** to hide latency.

## Scope

**In (MVP):**
- Chrome / Manifest V3 only.
- **Pickup** Fulfillment only. *(ADR-0001)*
- Adapters: **Uber Eats, DoorDash, Toast, Square** — driven by the builder's real favorites; add ChowNow / Olo / Grubhub reactively.
- Quote = **subtotal, pre-discount**; fees & tax excluded with disclosure + the too-close guard.
- Validate against **~10–20 favorite restaurants** (this is the test set, not a config list — the extension works on any restaurant whose Channels all have adapters).

**Out (deliberate non-goals for MVP):**
- **Delivery** and its fee modeling — deferred (different goods; harder totals). *(ADR-0001)*
- **Promos / discounts** — deferred (per-account, volatile). Natural fast-follow, since the in-session extension can read real prices.
- **Cross-platform cart auto-fill** — deliberate non-goal; fragile rabbit hole. Deep-link + rebuild list instead.
- **Universal menu renderer** — explicitly avoided by building the Basket on the real site. *(ADR-0007)*
- **Firefox / Safari**, and **server-side scraping** — later / rejected. *(ADR-0005)*

## Architecture (Manifest V3)

- **Background service worker** — the orchestrator: takes the discovered Channels, dedupes by **Provider Family** *(ADR-0012)*, and for each cache-miss runs a **Gather** — `chrome.tabs.create({active:false})` → `chrome.scripting.executeScript` the Adapter + generic runner → collect the status envelope → close the tab. Sequential; manages the co-pilot handoff *(ADR-0011)*; owns the cache (`chrome.storage.local`, ~7-day TTL). *(ADR-0010)*
- **Adapters** (`extension/adapters/*.js`) — one per Backend/Provider, **programmatically injected** (not declared content scripts). Contract: `{ backend, matches(url), readMenu(root) → items | Promise<items> }`; `readMenu` may be async and scroll/expand for lazy-loaded menus. A shared **runner** polls `readMenu` to a stable count with a timeout and returns `{ backend, url, status, items }`. The unit of work *and* of fragility. First: `clover.js`.
- **Provider→Family map** — small maintained data table (Uber/DoorDash/Grubhub/independents) driving the dedupe. *(ADR-0012)*
- **Injected UI** — the "Compare" button (Maps) + the result overlay (searchviewer), with per-Channel progress + provenance during a Gather. Vanilla or a lightweight framework — decide at build time.
- **Matching** — normalize item names (strip Clover-style numeric codes), fuzzy match on **full** names *(name fragments collide)* → auto-accept high confidence, prompt on low, **flag unmatchable rather than guess**. *(ADR-0003)* For multilingual menus, names that mix scripts are additionally scored **per shared script** (CJK / Latin) so a platform carrying only one script still matches — recovered Toast↔Grubhub matches 95→142 on a bilingual store.

## Phased build

- **Phase 0 — Skeleton + Discovery.** MV3 scaffold; detect a Google Maps restaurant listing; inject the button; read provider links + Website link. *Verify:* discovered Channels match what Google shows; Direct is found.
- **Phase 1 — Sampled-Upcharge ranking (ADR-0009). ✅ DONE (live).** Discover → dedupe by family → Gather Direct (Clover) + canonical aggregator (DoorDash) menus in background tabs → match full menus → show the **Upcharge** vs the Direct **Baseline** in the overlay. Verified live on Pho Element: **DoorDash ≈ +15.3%**, 72 items matched. Proves the thesis end-to-end. (Deferred to Phase 2: cache, the interactive co-pilot handoff, adapters beyond Clover/DoorDash.)
- **Phase 2 — Breadth + robustness. (in progress)** Auto-pilot background-tab gather ✅ *(ADR-0006/0010)*; consistency guard ✅. Adapters: Clover (Direct), DoorDash (+Caviar/order.online), Uber Eats (+Postmates), Grubhub (+Seamless), Fantuan, HungryPanda ✅ — all big aggregator families + both major pan-NA Asian aggregators covered. Grubhub gathers a full sample (~88 items) via scroll-accumulate; since virtualized lists don't render in hidden tabs, the gather uses an **adaptive focus fallback** — background-first, retry a Channel in a briefly-focused tab only when its read is thin (ADR-0014). No per-adapter focus hardcode; common case stays flash-free. Graceful degradation done: a restaurant whose Direct backend we don't handle (or that fails to read) no longer errors — we rank whatever we *can* read vs the cheapest of them, and flag the rest (ADR-0013). Remaining: more **Direct** backends (Clover + Toast + DoorDash Storefront/order.online + **Chowbus POS** (`pos.chowbus.com` — commission-free, the "Preferred by business" Direct for Asian spots; parses the page's embedded Next.js data so it captures *all* of a store's menus, not just the one the DOM renders; ignores the unpayable crown/"points" discount) + **MealKeyway/MenuSifu** (`order.mealkeyway.com` — commission-free Direct, hash-routed SPA DOM scrape) + **BeyondMenu** (`beyondmenu.com` — Direct with a flat $0.99 service fee that's read from the searchviewer and disclosed as a UI note) + **ChowNow** (`chownow.com`/`direct.chownow.com` — one adapter covers both ChowNow + ChowNow Local) + **Grubhub Direct** (`*.dine.online` — Grubhub's white-label own-ordering, distinct from the grubhub.com marketplace) built; Square/Olo flagged "adapter coming"), overlay polish, and the interactive co-pilot handoff. (7-day cache deprioritized — the in-session extension gathers at low volume.)
- **Phase 3 — Exact-Basket precision (ADR-0003), optional.** Let the user build their real cart on the Anchor and price *that* Basket per Channel for a literal total — the precision upgrade over the Phase 1 estimate.
- **Phase 4 — Handoff + robustness.** Deep-link + rebuild list; harden against DOM variance across the favorites set.
- **v2+** — delivery & fees; promos via in-session real prices; more adapters; cross-browser; then the publish/monetize decision.

## Verification (end-to-end)

**Automated (Phase 0, in place today):** from `cheapbite/`, `npm install && npm test`.
- `npm run test:unit` — hermetic Playwright test of `discovery.js` against the captured `searchviewer` fixture (network blocked; the regression gate).
- `npm run test:e2e` — headed Chromium with the extension loaded, driving live Google Maps (smoke test; flakier).
- Note: discovery runs on Google's `/searchviewer/` provider page, not the Maps place DOM — see ADR-0008.

**Manual / later phases:**

- Load unpacked in Chrome (`chrome://extensions` → Developer mode).
- For each favorite: Maps listing → **Compare** → discovered Channels match Google + Direct found.
- Build a known Basket on Direct → read-back cart matches.
- Each adapter returns plausible menu prices (spot-check vs the live site).
- Matching: high-confidence auto-matches, ambiguous prompts, unmatchable flagged (never guessed).
- Ranking + savings correct vs a manual check; too-close-to-call warning fires within threshold.
- Handoff deep-links correctly; non-anchor winner shows the rebuild list.
- Keep **per-adapter DOM fixtures** (saved HTML) for offline regression tests so site changes are caught early.

## Risks & posture

- **Adapter fragility** (the main ongoing tax) — mitigate with fixtures + tests; co-pilot fallback per hostile Channel. *(ADR-0006)*
- **Matching errors** are the trust killer — mitigated by confidence + human-in-the-loop + never-fake-a-price. *(ADR-0003)*
- **Legal/ToS** — in-session reading is lower-risk than server scraping, but platforms can still prohibit automated reading. **Keep the MVP private/personal; revisit ToS + Chrome Web Store policies before publishing or monetizing.**
- **Background-tab detectability** — low at personal volume + 7-day cache.
