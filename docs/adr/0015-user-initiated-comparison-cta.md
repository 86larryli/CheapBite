# The comparison is user-initiated via a CTA, not auto-triggered

Landing on the `/searchviewer/` provider page no longer auto-runs the gather. The gather is intrusive — it opens a background tab per Channel and briefly foregrounds one for a virtualized read (ADR-0014) — so doing it automatically the instant the page loads feels like the extension is acting without consent.

Instead, on the searchviewer page CheapBite shows a small **CTA overlay** ("Compare prices across N options"). Discovery still runs on load (it's cheap — it only reads the current page, opens no tabs), so the CTA can show the channel count; but the **gather only starts when the user clicks the CTA**.

This keeps the extension quiet until asked, makes the tab-opening/focus behavior a direct consequence of a user action (better for trust and for Web Store review), and costs one extra click. The Maps-listing button still just opens Google's "Order online" to reach this page.
