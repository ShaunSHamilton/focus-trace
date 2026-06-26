//! Per-process metrics via `sysinfo`, aggregated per executable.

use crate::settings::TrackingConfig;
use crate::telemetry::AppMetric;
use std::collections::HashMap;
use std::sync::OnceLock;
use sysinfo::System;

/// Lower-cased Windows directory (e.g. `c:\windows`) used to flag system exes.
fn windows_dir_lower() -> &'static str {
    static DIR: OnceLock<String> = OnceLock::new();
    DIR.get_or_init(|| {
        std::env::var("SystemRoot")
            .or_else(|_| std::env::var("windir"))
            .unwrap_or_else(|_| r"C:\Windows".to_string())
            .to_lowercase()
    })
}

struct Acc {
    name: String,
    is_system: bool,
    cpu: f32,
    mem: u64,
    read: u64,
    write: u64,
    run: u64,
}

/// Fold all live processes into per-exe aggregates, applying the tracking
/// filter. `system` must already have been refreshed at least twice (for CPU).
pub fn aggregate(system: &System, config: &TrackingConfig) -> Vec<AppMetric> {
    let windir = windows_dir_lower();
    let mut by_exe: HashMap<String, Acc> = HashMap::new();

    for proc in system.processes().values() {
        let Some(exe) = proc.exe() else {
            continue; // can't identify (kernel/system idle, access denied)
        };
        let exe_path = exe.to_string_lossy().into_owned();
        let is_system = exe_path.to_lowercase().starts_with(windir);

        if !config.should_track(&exe_path, is_system) {
            continue;
        }

        let name = exe
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| proc.name().to_string_lossy().into_owned());

        let du = proc.disk_usage();
        let entry = by_exe.entry(exe_path).or_insert_with(|| Acc {
            name,
            is_system,
            cpu: 0.0,
            mem: 0,
            read: 0,
            write: 0,
            run: 0,
        });
        entry.cpu += proc.cpu_usage();
        entry.mem += proc.memory();
        entry.read += du.read_bytes;
        entry.write += du.written_bytes;
        entry.run = entry.run.max(proc.run_time());
    }

    by_exe
        .into_iter()
        .map(|(exe_path, a)| AppMetric {
            exe_path,
            name: a.name,
            is_system: a.is_system,
            cpu_pct: a.cpu,
            mem_bytes: a.mem,
            disk_read_b: a.read,
            disk_write_b: a.write,
            run_secs: a.run,
        })
        .collect()
}
