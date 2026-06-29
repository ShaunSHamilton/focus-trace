pub mod browser;
pub mod focus;
pub mod network;
pub mod process;

use crate::dto::{AppSnapshot, LiveSnapshot, NetSnapshot};
use std::collections::HashMap;

/// Per-app aggregated metrics for one poll tick (summed across the app's PIDs).
#[derive(Debug, Clone)]
pub struct AppMetric {
    pub exe_path: String,
    pub name: String,
    pub is_system: bool,
    pub cpu_pct: f32,
    pub mem_bytes: u64,
    pub disk_read_b: u64,  // delta this tick
    pub disk_write_b: u64, // delta this tick
    pub run_secs: u64,     // longest-running instance
}

/// System-wide network deltas for one tick, bucketed by adapter type.
#[derive(Debug, Clone, Default)]
pub struct NetDelta {
    pub wifi_in: u64,
    pub wifi_out: u64,
    pub eth_in: u64,
    pub eth_out: u64,
    pub other_in: u64,
    pub other_out: u64,
}

/// A focus session that ended this tick (foreground moved away from this exe).
#[derive(Debug, Clone)]
pub struct FinishedFocus {
    pub exe_path: String,
    pub title: Option<String>,
    pub browser_profile: Option<String>,
    pub url: Option<String>,
    pub started_at: i64,
    pub ended_at: i64,
    pub duration: i64,
}

/// Everything collected in one tick, before persistence/emit.
#[derive(Debug, Clone)]
pub struct Snapshot {
    pub ts: i64,
    pub apps: Vec<AppMetric>,
    pub net: NetDelta,
    pub focused_exe: Option<String>,
    pub focused_title: Option<String>,
    pub finished_focus: Option<FinishedFocus>,
}

/// Project a collected `Snapshot` into the serializable live payload, using the
/// exe→id map produced by persistence to attach DB ids.
pub fn build_live_snapshot(
    snap: &Snapshot,
    ids: &HashMap<String, i64>,
    focused_app_id: Option<i64>,
) -> LiveSnapshot {
    let apps = snap
        .apps
        .iter()
        .filter_map(|a| {
            let app_id = *ids.get(&a.exe_path)?;
            Some(AppSnapshot {
                app_id,
                name: a.name.clone(),
                exe_path: a.exe_path.clone(),
                is_system: a.is_system,
                cpu_pct: a.cpu_pct,
                mem_bytes: a.mem_bytes,
                disk_read_b: a.disk_read_b,
                disk_write_b: a.disk_write_b,
                run_secs: a.run_secs,
                is_focused: focused_app_id == Some(app_id),
            })
        })
        .collect();

    let n = &snap.net;
    LiveSnapshot {
        ts: snap.ts,
        apps,
        net: NetSnapshot {
            wifi_in_b: n.wifi_in,
            wifi_out_b: n.wifi_out,
            eth_in_b: n.eth_in,
            eth_out_b: n.eth_out,
            other_in_b: n.other_in,
            other_out_b: n.other_out,
        },
        focused_app_id,
        focused_title: snap.focused_title.clone(),
    }
}
