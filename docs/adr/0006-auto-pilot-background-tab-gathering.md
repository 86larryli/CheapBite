# Auto-pilot: gather each Channel via a background tab, triggered from Google Maps

The extension's primary mode is **auto-pilot**. Triggered by a "Compare pickup prices" button injected onto the restaurant's Google Maps listing, it **opens each discovered Channel in a background tab, injects a per-Channel content script to read the menu, then closes the tab** — collecting every Quote from a single click. This requires host permissions for each supported Channel domain.

Chosen over a "co-pilot" model (reading only the tab the user is actively viewing) because **one-click comparison is the entire reason to install the tool**; co-pilot's manual per-Channel clicking isn't worth an install.

Accepted risk: automated background-tab navigation is marginally more bot-like than passive reading — but it runs in the user's real session at tiny volume (a few restaurants, 7-day cache), so detection risk is low. **Co-pilot remains the defined fallback** for any Channel that turns out to be hostile to background-tab reads.
