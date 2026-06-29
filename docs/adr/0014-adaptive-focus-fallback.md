# Adaptive focus fallback: gather in the background, refocus only on a thin read

Some menus (Grubhub) are **virtualized** — rows render on scroll, and Chrome **pauses rendering in hidden/background tabs**, so a background gather sees only the first viewport. JSON-LD adapters (DoorDash, Uber Eats) and render-on-load adapters (Clover, Toast) don't have this problem and read fine in a hidden tab.

We originally hardcoded a per-adapter `needsFocus` flag (only Grubhub). That works but (a) requires knowing in advance which platforms virtualize, and (b) a new virtualized platform would silently under-read until we noticed.

Instead, focus is now an **adaptive fallback**:

1. Gather every Channel in a **hidden background tab** (no focus stolen).
2. If the read succeeds with a healthy item count (≥ a "thin" threshold) → done.
3. If it comes back **thin** (few items / empty / timeout — the signature of a virtualized list that didn't render while hidden) → **retry that one Channel in a briefly-focused tab** (which lets it render while we scroll), then restore the user's tab. Keep whichever read more items.

This keeps the common case **flash-free** (good background read → no foregrounding), **self-heals any virtualized platform** — current or future — with no per-adapter configuration, and confines focus-stealing to the rare Channel that actually needs it. The cost is a short wasted background pass for a known-virtualized site (its scroll early-exits fast when nothing renders) and, rarely, an unhelpful focused retry for a genuinely tiny menu. Supersedes the per-adapter `needsFocus` flag; `scroll` behavior still lives inside each adapter's `readMenu`.
