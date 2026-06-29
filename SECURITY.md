# Security Policy

## Supported versions

CheapBite is distributed as a single, always-latest browser extension. Only the
most recent released version receives security fixes.

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

- Preferred: open a private report via GitHub
  ([Security → Report a vulnerability](https://github.com/86larryli/CheapBite/security/advisories/new)).
- Or email **86larryli@gmail.com**.

Include steps to reproduce and the affected version. You'll get an
acknowledgement as soon as possible, and a fix or mitigation will be coordinated
before any public disclosure.

## Scope

CheapBite runs entirely in the browser with no backend. The most relevant
surfaces are: the content scripts injected on Google Maps / the provider page,
the per-channel menu **adapters** that read third-party ordering pages, and the
background service worker that orchestrates reads in temporary tabs. Reports
about data exfiltration, injection, or excessive permissions are especially
welcome.
