# CHANGELOG

## Unreleased

## [1.1.0]

### Add

- Per-window-title focus tracking (e.g. browser tab / page titles): focus time is attributed to the active window title, with a per-app drill-down and a top-titles view.

## [1.0.0]

Initial release. Windows only support.

- Rust edition 2024; telemetry backend via `sysinfo` (per-app CPU/memory/disk, run time) and the `windows` crate (foreground-window focus tracking, adapter-level Wi-Fi vs Ethernet network counters).
- Embedded SQLite (`rusqlite`, bundled) with normalized schema, daily rollups, and raw-sample retention.
- Tauri IPC commands + a `telemetry-update` event feeding a React 19 / Tailwind v4 / Recharts dashboard (dashboard, applications, app detail, network, focus, settings).
- Configurable tracking: ignores Windows system processes by default, with per-exe force-track / ignore rules.
