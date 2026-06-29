use crate::error::Error;
use rusqlite::Connection;

/// Connection-level pragmas, applied on every open.
pub const PRAGMAS: &str = "\
PRAGMA journal_mode = WAL;\n\
PRAGMA synchronous = NORMAL;\n\
PRAGMA foreign_keys = ON;";

/// Ordered, idempotent migrations. Index + 1 == the `user_version` it sets.
/// Append new entries; never edit a shipped one.
pub const MIGRATIONS: &[&str] = &[V1, V2, V3, V4];

const V1: &str = r#"
-- App identity: the long exe-path string is stored ONCE and referenced by FK.
CREATE TABLE IF NOT EXISTS apps (
    id         INTEGER PRIMARY KEY,
    exe_path   TEXT    NOT NULL UNIQUE,
    name       TEXT    NOT NULL,
    is_system  INTEGER NOT NULL DEFAULT 0,   -- exe under %SystemRoot%
    first_seen INTEGER NOT NULL,
    last_seen  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_apps_last_seen ON apps(last_seen);

-- Per-app resource samples (high-volume time-series; summed across the app's PIDs).
CREATE TABLE IF NOT EXISTS metric_samples (
    app_id       INTEGER NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
    ts           INTEGER NOT NULL,
    cpu_pct      REAL    NOT NULL,
    mem_bytes    INTEGER NOT NULL,
    disk_read_b  INTEGER NOT NULL,
    disk_write_b INTEGER NOT NULL,
    PRIMARY KEY (app_id, ts)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS idx_samples_ts ON metric_samples(ts);

-- Accumulated lifetime totals per app (O(1) reads).
CREATE TABLE IF NOT EXISTS app_usage (
    app_id           INTEGER PRIMARY KEY REFERENCES apps(id) ON DELETE CASCADE,
    total_focus_secs INTEGER NOT NULL DEFAULT 0,
    total_run_secs   INTEGER NOT NULL DEFAULT 0,
    last_run_secs    INTEGER NOT NULL DEFAULT 0
);

-- Discrete focus sessions, written on focus CHANGE (low volume).
CREATE TABLE IF NOT EXISTS focus_sessions (
    id         INTEGER PRIMARY KEY,
    app_id     INTEGER NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
    started_at INTEGER NOT NULL,
    ended_at   INTEGER NOT NULL,
    duration   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_focus_app ON focus_sessions(app_id, started_at);
CREATE INDEX IF NOT EXISTS idx_focus_started ON focus_sessions(started_at);

-- System-wide network samples, bucketed by adapter type (NOT per app).
CREATE TABLE IF NOT EXISTS network_samples (
    ts           INTEGER NOT NULL,
    adapter_type INTEGER NOT NULL,            -- 0=WiFi 1=Ethernet 2=Other
    in_delta_b   INTEGER NOT NULL,
    out_delta_b  INTEGER NOT NULL,
    PRIMARY KEY (ts, adapter_type)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS idx_net_ts ON network_samples(ts);

-- Daily rollups (retention target; raw samples are pruned after rollup).
CREATE TABLE IF NOT EXISTS metric_daily (
    app_id        INTEGER NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
    day           INTEGER NOT NULL,           -- unix secs at UTC midnight
    avg_cpu_pct   REAL    NOT NULL,
    max_cpu_pct   REAL    NOT NULL,
    avg_mem_bytes INTEGER NOT NULL,
    max_mem_bytes INTEGER NOT NULL,
    disk_read_b   INTEGER NOT NULL,
    disk_write_b  INTEGER NOT NULL,
    sample_count  INTEGER NOT NULL,
    PRIMARY KEY (app_id, day)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS network_daily (
    day          INTEGER NOT NULL,
    adapter_type INTEGER NOT NULL,
    in_total_b   INTEGER NOT NULL,
    out_total_b  INTEGER NOT NULL,
    PRIMARY KEY (day, adapter_type)
) WITHOUT ROWID;

-- Scalar settings: one row per key, value is a plain primitive string (NO JSON).
CREATE TABLE IF NOT EXISTS app_config (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Per-exe tracking rules: mode 0=ignore, 1=force_track.
CREATE TABLE IF NOT EXISTS tracking_rules (
    exe_path TEXT PRIMARY KEY,
    mode     INTEGER NOT NULL
);
"#;

// Window-title focus: dedup titles per app, link focus sessions to a title.
const V2: &str = r#"
CREATE TABLE IF NOT EXISTS window_titles (
    id     INTEGER PRIMARY KEY,
    app_id INTEGER NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
    title  TEXT    NOT NULL,
    UNIQUE (app_id, title)
);
-- Nullable FK; SQLite ADD COLUMN with REFERENCES requires a NULL default.
ALTER TABLE focus_sessions ADD COLUMN title_id INTEGER REFERENCES window_titles(id);
CREATE INDEX IF NOT EXISTS idx_focus_title ON focus_sessions(title_id);
"#;

// Custom dashboards: a dashboard owns a set of panels. A panel binds a data
// `kind` (frontend registry key) + `chart_type` to a grid cell (x,y,w,h).
const V3: &str = r#"
CREATE TABLE IF NOT EXISTS dashboards (
    id         INTEGER PRIMARY KEY,
    name       TEXT    NOT NULL,
    is_default INTEGER NOT NULL DEFAULT 0,
    sort       INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS panels (
    id           INTEGER PRIMARY KEY,
    dashboard_id INTEGER NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
    title        TEXT    NOT NULL,
    kind         TEXT    NOT NULL,            -- frontend panel-kind key
    chart_type   TEXT    NOT NULL,            -- area | bar | donut | calendar | gauge
    args_json    TEXT    NOT NULL DEFAULT '{}',
    range_key    TEXT    NOT NULL DEFAULT '24h',
    x            INTEGER NOT NULL DEFAULT 0,
    y            INTEGER NOT NULL DEFAULT 0,
    w            INTEGER NOT NULL DEFAULT 6,
    h            INTEGER NOT NULL DEFAULT 6,
    sort         INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_panels_dashboard ON panels(dashboard_id);
"#;

// User-defined focus groups: a named group owns ordered match rules. A focus
// session (by exe/app name + window title) is assigned to the first group (by
// sort) with a matching rule; unmatched sessions fall into "Ungrouped".
const V4: &str = r#"
CREATE TABLE IF NOT EXISTS focus_groups (
    id    INTEGER PRIMARY KEY,
    name  TEXT    NOT NULL,
    color TEXT    NOT NULL DEFAULT '',
    sort  INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS focus_group_rules (
    id       INTEGER PRIMARY KEY,
    group_id INTEGER NOT NULL REFERENCES focus_groups(id) ON DELETE CASCADE,
    field    TEXT    NOT NULL,            -- exe | title
    op       TEXT    NOT NULL,            -- contains | equals | regex
    value    TEXT    NOT NULL,
    sort     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_group_rules_group ON focus_group_rules(group_id);
"#;

/// Apply any migrations newer than the stored `user_version`.
pub fn migrate(conn: &Connection) -> Result<(), Error> {
    let current: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    for (i, stmt) in MIGRATIONS.iter().enumerate() {
        let version = (i + 1) as i64;
        if version > current {
            conn.execute_batch(stmt)?;
            conn.pragma_update(None, "user_version", version)?;
        }
    }
    Ok(())
}
