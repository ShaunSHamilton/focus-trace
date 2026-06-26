//! Serde data-transfer objects returned to the frontend over IPC and emitted
//! as the `telemetry-update` event payload. camelCase to match TS conventions.

use serde::Serialize;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppSnapshot {
    pub app_id: i64,
    pub name: String,
    pub exe_path: String,
    pub is_system: bool,
    pub cpu_pct: f32,
    pub mem_bytes: u64,
    pub disk_read_b: u64,
    pub disk_write_b: u64,
    pub run_secs: u64,
    pub is_focused: bool,
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct NetSnapshot {
    pub wifi_in_b: u64,
    pub wifi_out_b: u64,
    pub eth_in_b: u64,
    pub eth_out_b: u64,
    pub other_in_b: u64,
    pub other_out_b: u64,
}

/// Live per-tick payload (cached in app state, emitted as `telemetry-update`).
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LiveSnapshot {
    pub ts: i64,
    pub apps: Vec<AppSnapshot>,
    pub net: NetSnapshot,
    pub focused_app_id: Option<i64>,
}

// ── Historical read DTOs ──────────────────────────────────────────────────────

/// One row of the app list with lifetime totals + windowed averages.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppAggregate {
    pub app_id: i64,
    pub name: String,
    pub exe_path: String,
    pub is_system: bool,
    pub last_seen: i64,
    pub total_focus_secs: i64,
    pub total_run_secs: i64,
    pub avg_cpu_pct: f32,
    pub avg_mem_bytes: i64,
}

/// One point of an app's resource history (raw or downsampled).
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MetricPoint {
    pub ts: i64,
    pub cpu_pct: f32,
    pub mem_bytes: i64,
    pub disk_read_b: i64,
    pub disk_write_b: i64,
}

/// One point of system network history, pivoted by adapter type.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NetPoint {
    pub ts: i64,
    pub wifi_in_b: i64,
    pub wifi_out_b: i64,
    pub eth_in_b: i64,
    pub eth_out_b: i64,
    pub other_in_b: i64,
    pub other_out_b: i64,
}

/// Network byte totals over a range, by adapter type.
#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct NetTotals {
    pub wifi_in_b: i64,
    pub wifi_out_b: i64,
    pub eth_in_b: i64,
    pub eth_out_b: i64,
    pub other_in_b: i64,
    pub other_out_b: i64,
}

/// Focus time per app over a range.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FocusSummaryRow {
    pub app_id: i64,
    pub name: String,
    pub focus_secs: i64,
}
