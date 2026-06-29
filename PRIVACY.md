# Privacy Policy

_Last updated: 2026-06-28_

CheapBite is a browser extension that compares pickup prices across a
restaurant's ordering channels. **It does not collect, transmit, sell, or share
any personal data.** Everything runs locally in your browser.

## What the extension accesses

- **The Google Maps / "Order online" page you're viewing** — to discover which
  ordering channels (the restaurant's own "Direct" site and the delivery
  aggregators) are available for that restaurant.
- **The ordering pages for those channels** — when you click **Compare**,
  CheapBite briefly opens each channel's menu page in a background tab, reads the
  item names and prices, and closes the tab. This is the same public menu data
  you would see by visiting those pages yourself.

## What it does with that data

- Item names and prices are used **only** to compute and display the price
  comparison overlay, in your browser, during that session.
- Nothing is sent to any server. CheapBite has **no backend**, no analytics, and
  makes no network requests of its own beyond loading the menu pages described
  above.
- The extension does not read, store, or transmit your Google account, location,
  payment information, order history, or any other personal data.

## Storage

The extension requests the `storage` permission for local, on-device caching of
menu data to avoid re-reading the same pages. This data never leaves your
device and can be cleared by removing the extension.

## Permissions

Host permissions are limited to Google Maps and the specific ordering platforms
the extension can read (listed in `manifest.json`). They exist solely to read
public menu pages for the comparison.

## Contact

Questions about privacy: **86larryli@gmail.com** or open an issue at
<https://github.com/86larryli/CheapBite/issues>.
