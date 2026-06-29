# Gather aggregator menus by programmatically injecting adapters into background tabs

To compute Upcharge (ADR-0009) CheapBite must read each Channel's menu. Discovery (ADR-0002/0008) already yields a deep-link per Channel; this ADR fixes *how* the menu behind that link is read. It is the model every menu Adapter follows.

**Injection — programmatic, not static.** The manifest requests `host_permissions` for each aggregator domain (ubereats.com, doordash.com, …) plus the `scripting` permission, and the **service worker injects the Adapter on demand** via `chrome.scripting.executeScript` only during an active comparison. We rejected static `content_scripts` matching those domains because they would run our code on *every* normal visit the user makes to those sites — worse for privacy, performance, and Web Store review. (Install-time host-permission prompts are unavoidable either way; programmatic injection just means we never *act* on that access outside a comparison.)

**Loading — background tab, not fetch or iframe.** The worker opens the deep-link with `chrome.tabs.create({ active: false })`, lets the page's JS render the menu, injects the Adapter, reads, then closes the tab.
- `fetch()` + HTML parse is **rejected**: aggregator menus are client-rendered SPAs, so a raw fetch returns an empty shell and would force us to reverse-engineer each platform's private JSON API (more fragile than the DOM, and it abandons the real-browser session that is our anti-bot advantage per ADR-0005).
- iframe/offscreen is **rejected**: UE/DD refuse framing (`X-Frame-Options`/`frame-ancestors`).
- A background tab runs in the user's real session (cookies, IP, JS) — indistinguishable from the user opening the page.

**Transport — executeScript return value, not messaging.** The injected Adapter's parsed result returns directly as the `executeScript` promise result; no `chrome.runtime` message plumbing.

**Adapter contract.** Each Adapter exposes `{ backend, matches(url), readMenu(root) → items | Promise<items> }` where an item is `{ name, price }`. `readMenu` may be async and may manipulate the page (scroll/expand) to handle lazy-loaded menus — platform quirks live in the Adapter. A **generic runner**, injected alongside, calls `readMenu`, **polls until the item count is stable** (or an overall timeout), and returns a status envelope `{ backend, url, status: "ok" | "empty" | "timeout" | "blocked", items }`. The status (not bare items) is what ADR-0009's drop-and-flag and consistency guard consume. `readMenu` returns the **full** menu (general, cacheable, reusable by the later exact-Basket mode) — sampling/matching is a downstream step, not the Adapter's job.

The existing `clover.js` already fits this contract (its `readMenu` is synchronous and stabilizes immediately). The accepted UX cost — background tabs visibly blip open/closed in the tab strip — and how many run at once are addressed separately (concurrency/latency).
