# Build CheapBite as a browser extension (client-side, in-session), not a server-side web app

CheapBite will be a **browser extension** that reads each Channel's pages inside the user's own logged-in browser session, rather than a server-side web app that scrapes Channels from our own infrastructure.

Why, despite server-side being the faster MVP validator:

- **No anti-bot arms race** — requests come from the user's real browser, IP, and session, so Uber Eats / DoorDash bot defenses don't apply.
- **Real, personalized prices** become available as the product grows (fees, promos) — the intended end-state.
- **Lower ToS / legal exposure** — the user reads pages they are authorized to see (the model Honey / Capital One Shopping use).
- **Stickier product and better monetization** (always-on, not a one-off page visit).

**Explicitly not the reason:** MVP price fidelity. At MVP scope (pickup subtotal, pre-discount) the numbers are identical to a logged-out baseline. The extension was chosen because it is the intended *end-state*, and we would rather build it directly than build and discard a server-side version.

**Accepted costs:** install friction; no shareable result URL; per-browser builds (Chrome / Manifest V3 first); and background-tab orchestration to gather each Channel's page (iframes are not viable — UE/DD block framing). Google Maps remains discovery-only (see ADR-0004); the extension now reads it in-session instead of server-side.
