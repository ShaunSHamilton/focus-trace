//! Tauri-managed application state. All sync: the DB is rusqlite, the poll loop
//! is a std thread, and commands lock briefly. Keep every lock scope minimal.

use crate::dto::LiveSnapshot;
use crate::settings::TrackingConfig;
use crate::telemetry::browser::BrowserProfileCache;
use crate::telemetry::focus::FocusTracker;
use crate::telemetry::network::NetCounters;
use rusqlite::Connection;
use std::sync::{Mutex, RwLock};
use sysinfo::System;

/// Mutable collectors touched only by the poll thread (blocking syscalls).
pub struct Collectors {
    pub system: System,
    pub net: NetCounters,
    pub focus: FocusTracker,
    pub browser_profiles: BrowserProfileCache,
}

pub struct AppState {
    pub db: Mutex<Connection>,
    pub collectors: Mutex<Collectors>,
    pub last_snapshot: Mutex<Option<LiveSnapshot>>,
    pub config: RwLock<TrackingConfig>,
}
