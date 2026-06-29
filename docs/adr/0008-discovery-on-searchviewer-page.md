# Discovery runs on Google's /searchviewer/ provider page, not the Maps place DOM

Clicking "Order online" on a Google Maps restaurant listing does **not** reveal providers in the place panel — it navigates to a separate page, `https://www.google.com/searchviewer/…` ("Food Provider Selection Viewer"), typically in a **new tab**. That page is where the ordering links actually live: one `<a>` per channel with the provider's real domain in its `href`, a Pickup/Delivery toggle (defaulting to Pickup), and the restaurant's own ("Direct") row badged "Preferred by business".

This was found by driving live Maps with Playwright (Pho Element, San Mateo): a same-page scan of the place listing returned zero providers, while the `/searchviewer/` tab returned all of them. It corrects the earlier Phase 0 assumption that providers could be read from the Maps place DOM.

**Consequences:**
- The content script matches `https://www.google.com/searchviewer/*` (in addition to `/maps/*`). It runs discovery and renders the overlay **on the searchviewer page**.
- The Maps place listing only hosts the trigger **button**, which opens "Order online" to navigate to the searchviewer page. (The background-tab auto-pilot of ADR-0006 remains the eventual design; Phase 0 uses this simpler single-tab flow.)
- Discovery matches anchor **href domains** for aggregators and known own-site backends (Clover, `order.online`/DoorDash Storefront, Toast, Square, ChowNow, Olo), and additionally captures the **"Preferred by business"** own-site row (which points at the restaurant's real ordering URL, e.g. `order.phoelement.com`, not its `www` homepage).

The captured searchviewer HTML is checked in at `test/fixtures/phoelement-searchviewer.html` and drives a deterministic Playwright test of `discovery.js`.
