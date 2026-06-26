use crate::db::queries;
use crate::error::Error;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};

pub const DEFAULT_POLL_SECS: u64 = 5;
pub const DEFAULT_RAW_RETENTION_DAYS: u64 = 30;

/// In-memory view of tracking settings, assembled from the normalized
/// `app_config` (scalars) and `tracking_rules` (per-exe) tables. No JSON.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackingConfig {
    /// Skip processes whose exe lives under %SystemRoot% unless force-tracked.
    pub ignore_system_processes: bool,
    pub poll_secs: u64,
    pub raw_retention_days: u64,
    /// Exe paths to always ignore (tracking_rules mode 0).
    pub ignore_exes: Vec<String>,
    /// Exe paths to always track, even if they are system processes (mode 1).
    pub force_track_exes: Vec<String>,
}

impl Default for TrackingConfig {
    fn default() -> Self {
        Self {
            ignore_system_processes: true,
            poll_secs: DEFAULT_POLL_SECS,
            raw_retention_days: DEFAULT_RAW_RETENTION_DAYS,
            ignore_exes: Vec::new(),
            force_track_exes: Vec::new(),
        }
    }
}

impl TrackingConfig {
    pub fn load(conn: &Connection) -> Result<Self, Error> {
        let mut cfg = Self::default();
        if let Some(v) = queries::get_config(conn, "ignore_system_processes")? {
            cfg.ignore_system_processes = v != "0";
        }
        if let Some(v) = queries::get_config(conn, "poll_secs")? {
            cfg.poll_secs = v.parse().unwrap_or(DEFAULT_POLL_SECS).max(1);
        }
        if let Some(v) = queries::get_config(conn, "raw_retention_days")? {
            cfg.raw_retention_days = v.parse().unwrap_or(DEFAULT_RAW_RETENTION_DAYS);
        }
        cfg.ignore_exes = queries::tracking_rules(conn, 0)?;
        cfg.force_track_exes = queries::tracking_rules(conn, 1)?;
        Ok(cfg)
    }

    pub fn save(&self, conn: &mut Connection) -> Result<(), Error> {
        queries::set_config(
            conn,
            "ignore_system_processes",
            if self.ignore_system_processes { "1" } else { "0" },
        )?;
        queries::set_config(conn, "poll_secs", &self.poll_secs.max(1).to_string())?;
        queries::set_config(
            conn,
            "raw_retention_days",
            &self.raw_retention_days.to_string(),
        )?;
        queries::replace_tracking_rules(conn, &self.ignore_exes, &self.force_track_exes)?;
        Ok(())
    }

    /// Decide whether a process (by exe path + system flag) should be tracked.
    pub fn should_track(&self, exe_path: &str, is_system: bool) -> bool {
        if self.force_track_exes.iter().any(|e| e == exe_path) {
            return true;
        }
        if self.ignore_exes.iter().any(|e| e == exe_path) {
            return false;
        }
        !(self.ignore_system_processes && is_system)
    }
}
