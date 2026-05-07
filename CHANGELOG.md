# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-05-08

### Added
- Initial release.
- 12 pixel-perfect variants (4 thermostat / 4 blinds / 4 lights) from Figma `o61NCf1Pdc2ErT26eH2PHX`.
- Container-query scaling for any square viewport (Shelly Wall Display SAWD1, X2i, XL).
- Pointer-events horizontal swiper between Thermostat / Blinds / Lights.
- Embedded Inter font (Light / Regular / Medium / SemiBold / Bold).
- Validated YAML config schema (`climate`, `light`, `cover`, optional sensors).
- Preview harness in `examples/preview.html` with mocked `hass`.
- Setup docs for HA `mcp_server`, kiosk-mode, Wall Display, and visual verification.
- HACS-compatible repo layout + GitHub Actions release workflow.
