# CheapBite — unpacked extension

This folder **is** the extension that ships: load it via `chrome://extensions`
→ Developer mode → **Load unpacked** → select this `extension/` directory.

It's plain JavaScript with no build step. For the project overview, install
instructions, supported channels, development setup, and how to add an adapter,
see the repository root:

- [README](../README.md) — overview, install, development
- [CONTRIBUTING](../CONTRIBUTING.md) — dev setup + adapter guide
- [CONTEXT](../CONTEXT.md) / [docs/adr](../docs/adr) — design & decisions

### Files
| File | Role |
|------|------|
| `manifest.json` | MV3 manifest (content scripts + service worker + icons) |
| `content.js` | place detection, the Maps button, the results overlay |
| `discovery.js` | find ordering channels on Google's provider page |
| `families.js` | dedupe channels by ownership family + route to adapters |
| `compare.js` | name matching + Upcharge ranking |
| `background.js` | service worker — gathers each menu in a background tab |
| `adapters/*.js` | one menu reader per ordering backend |
| `icons/` | extension icons (regenerate with `npm run icons`) |
