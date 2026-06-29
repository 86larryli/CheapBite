# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-06-28

Initial public release.

### Added
- Compare pickup prices from a Google Maps restaurant listing: discover the
  ordering channels, read each menu in a background tab, and rank them by the
  estimated **Upcharge** versus the cheapest channel (the restaurant's own
  "Direct" site is preferred but not required).
- **Direct (own-site) backends:** Clover, Toast, DoorDash Storefront
  (`order.online`), Chowbus POS, MealKeyway / MenuSifu, BeyondMenu, ChowNow
  (incl. "ChowNow Local"), and Grubhub Direct (`*.dine.online`).
- **Delivery aggregators:** DoorDash (+ Caviar), Uber Eats (+ Postmates),
  Grubhub (+ Seamless), Fantuan, and HungryPanda.
- Name-normalized fuzzy matching with per-script (CJK/Latin) handling for
  bilingual menus, a consistency guard, and tie detection.
- Graceful degradation when a channel can't be read (e.g. store closed or bot
  challenge), service-fee disclosure (e.g. BeyondMenu's flat fee), and an
  adaptive focused-read fallback for virtualized menus.
- Deterministic Playwright test suite over captured fixtures, plus live
  end-to-end smoke tests.

[Unreleased]: https://github.com/86larryli/CheapBite/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/86larryli/CheapBite/releases/tag/v0.1.0
