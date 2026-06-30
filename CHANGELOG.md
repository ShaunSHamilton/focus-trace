# CHANGELOG

## Unreleased

## [1.2.1]

### Fixed

- Chrome 2022+ runs all profiles in a single browser process, so `--profile-directory` is absent from the cmdline unless Chrome was launched via a profile-specific shortcut. Fall back to reading `profile.last_used` from the browser's Local State file, which Chrome updates whenever a profile window receives focus.

## [1.2.0]

### Added

- Ability to track browser URLs
- Group by Chromium profile

## [1.1.0]

### Added

- Custom dashboards
- Custom groups

## [1.0.0]

Initial release. Windows only support.

- Per-window-title focus tracking (e.g. browser tab / page titles): focus time is attributed to the active window title, with a per-app drill-down and a top-titles view.
- Updater
- Rust edition 2024; telemetry backend via `sysinfo` (per-app CPU/memory/disk, run time) and the `windows` crate (foreground-window focus tracking, adapter-level Wi-Fi vs Ethernet network counters).
- Embedded SQLite (`rusqlite`, bundled) with normalized schema, daily rollups, and raw-sample retention.
- Tauri IPC commands + a `telemetry-update` event feeding a React 19 / Tailwind v4 / Recharts dashboard (dashboard, applications, app detail, network, focus, settings).
- Configurable tracking: ignores Windows system processes by default, with per-exe force-track / ignore rules.
