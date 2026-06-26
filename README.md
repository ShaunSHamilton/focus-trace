# Focus Trace

Desktop app that monitors system and process telemetry in real-time, tracking CPU, memory, disk, and network usage per application. It records focus time by window title and app, stores data in embedded SQLite with daily rollups, and displays live metrics in a React dashboard with drill-downs for individual apps and network interfaces. Configurable per-app tracking rules ignore system processes by default while allowing fine-grained include/exclude filters.

## Development

```ps1
.\scripts\WindowsEnv.ps1 -Command "cargo tauri build --bundles msi,updater"
```
