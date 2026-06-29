//! Serde data-transfer objects returned to the frontend over IPC and emitted
//! as the `telemetry-update` event payload. camelCase to match TS conventions.

use serde::{Deserialize, Serialize};

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
    pub focused_title: Option<String>,
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

/// Focus time for a single window title within one app.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TitleFocusRow {
    pub title: String,
    pub focus_secs: i64,
}

/// Focus time for a single browser profile within one Chromium app.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BrowserProfileRow {
    pub profile: String,
    pub focus_secs: i64,
}

/// Focus time for a single URL within one Chromium app.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UrlRow {
    pub url: String,
    pub focus_secs: i64,
}

/// Focus time per window title across all apps (with the owning app).
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WindowFocusRow {
    pub app_id: i64,
    pub name: String,
    pub title: String,
    pub focus_secs: i64,
}

// ── Focus timeline (per-window focus over time, bucketed) ─────────────────────

/// One window/title series in the timeline. `id` is the title id; `0` means
/// "(no title)" and `-1` is the aggregated "Other" bucket.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FocusTimelineSeries {
    pub id: i64,
    pub app_name: String,
    pub title: String,
    pub total_secs: i64,
    /// Explicit series color (used by the grouped timeline); empty = let the
    /// frontend pick a palette color by index.
    pub color: String,
}

/// Focus seconds for one time bucket, aligned to the `series` order.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FocusTimelinePoint {
    pub ts: i64,
    pub secs: Vec<i64>,
}

/// Per-window focus, split across time buckets over a range. The frontend
/// cumulates `points[*].secs` per series for the cumulative stacked chart.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FocusTimeline {
    pub bucket_secs: i64,
    pub series: Vec<FocusTimelineSeries>,
    pub points: Vec<FocusTimelinePoint>,
}

// ── Focus groups (user-defined buckets with match rules) ──────────────────────

/// One match rule. `field` is `exe` (app name) or `title` (window title);
/// `op` is `contains` | `equals` | `regex`; all case-insensitive.
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FocusGroupRule {
    pub field: String,
    pub op: String,
    pub value: String,
}

/// A named group with its ordered rules (OR semantics within a group).
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FocusGroup {
    pub id: i64,
    pub name: String,
    pub color: String,
    pub rules: Vec<FocusGroupRule>,
}

/// Incoming group on save (id/sort assigned by the server).
#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FocusGroupInput {
    pub name: String,
    pub color: String,
    pub rules: Vec<FocusGroupRule>,
}

/// Distinct executables, window titles, browser profiles, and URLs seen so far, for
/// autocompleting rule values when building groups.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FocusFilterOptions {
    pub exes: Vec<String>,
    pub titles: Vec<String>,
    pub browser_profiles: Vec<String>,
    pub urls: Vec<String>,
}

/// Focus time rolled up into one group over a range. `group_id` 0 = "Ungrouped".
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FocusGroupSummaryRow {
    pub group_id: i64,
    pub name: String,
    pub color: String,
    pub focus_secs: i64,
}

/// Total focus seconds for one UTC day (for the calendar-heatmap panel).
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DayFocus {
    pub day: i64, // unix secs at UTC midnight
    pub focus_secs: i64,
}

// ── Custom dashboards ─────────────────────────────────────────────────────────

/// One panel on a dashboard: a data `kind` + `chart_type` placed in a grid cell.
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Panel {
    pub id: i64,
    pub dashboard_id: i64,
    pub title: String,
    pub kind: String,
    pub chart_type: String,
    pub args_json: String,
    pub range_key: String,
    pub x: i64,
    pub y: i64,
    pub w: i64,
    pub h: i64,
    pub sort: i64,
}

/// A dashboard with its panels (returned by `list_dashboards`).
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Dashboard {
    pub id: i64,
    pub name: String,
    pub is_default: bool,
    pub sort: i64,
    pub panels: Vec<Panel>,
}

/// Incoming panel from the frontend on save (id/dashboard_id assigned by server).
#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PanelInput {
    pub title: String,
    pub kind: String,
    pub chart_type: String,
    pub args_json: String,
    pub range_key: String,
    pub x: i64,
    pub y: i64,
    pub w: i64,
    pub h: i64,
    pub sort: i64,
}
