//! All SQL lives here. No SQL string should appear outside this module.

use crate::dto::{
    AppAggregate, FocusSummaryRow, MetricPoint, NetPoint, NetTotals, TitleFocusRow, WindowFocusRow,
};
use crate::error::Error;
use crate::telemetry::Snapshot;
use rusqlite::{params, Connection};
use std::collections::HashMap;

fn collect<T>(rows: impl Iterator<Item = rusqlite::Result<T>>) -> Result<Vec<T>, Error> {
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

// ── App identity ────────────────────────────────────────────────────────────

/// Insert the app if new (keyed by exe path) or bump `last_seen`; returns its id.
pub fn upsert_app(
    conn: &Connection,
    exe_path: &str,
    name: &str,
    is_system: bool,
    now: i64,
) -> Result<i64, Error> {
    conn.execute(
        "INSERT INTO apps(exe_path, name, is_system, first_seen, last_seen)
         VALUES(?1, ?2, ?3, ?4, ?4)
         ON CONFLICT(exe_path) DO UPDATE SET last_seen = ?4, name = ?2",
        params![exe_path, name, is_system as i64, now],
    )?;
    let id: i64 = conn.query_row(
        "SELECT id FROM apps WHERE exe_path = ?1",
        params![exe_path],
        |r| r.get(0),
    )?;
    Ok(id)
}

// ── Scalar settings (app_config) ──────────────────────────────────────────────

pub fn get_config(conn: &Connection, key: &str) -> Result<Option<String>, Error> {
    let mut stmt = conn.prepare("SELECT value FROM app_config WHERE key = ?1")?;
    let mut rows = stmt.query(params![key])?;
    match rows.next()? {
        Some(row) => Ok(Some(row.get(0)?)),
        None => Ok(None),
    }
}

pub fn set_config(conn: &Connection, key: &str, value: &str) -> Result<(), Error> {
    conn.execute(
        "INSERT INTO app_config(key, value) VALUES(?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

/// Seed scalar defaults without clobbering existing user values.
pub fn seed_config_defaults(conn: &Connection) -> Result<(), Error> {
    let defaults = [
        ("ignore_system_processes", "1"),
        ("poll_secs", "5"),
        ("raw_retention_days", "30"),
    ];
    for (k, v) in defaults {
        conn.execute(
            "INSERT OR IGNORE INTO app_config(key, value) VALUES(?1, ?2)",
            params![k, v],
        )?;
    }
    Ok(())
}

// ── Per-exe tracking rules (tracking_rules) ───────────────────────────────────

/// Exe paths with the given mode (0 = ignore, 1 = force_track).
pub fn tracking_rules(conn: &Connection, mode: i64) -> Result<Vec<String>, Error> {
    let mut stmt = conn.prepare("SELECT exe_path FROM tracking_rules WHERE mode = ?1")?;
    let rows = stmt.query_map(params![mode], |row| row.get::<_, String>(0))?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

/// Replace the entire rule set in one transaction.
pub fn replace_tracking_rules(
    conn: &mut Connection,
    ignore: &[String],
    force: &[String],
) -> Result<(), Error> {
    let tx = conn.transaction()?;
    tx.execute("DELETE FROM tracking_rules", [])?;
    {
        let mut stmt =
            tx.prepare("INSERT OR REPLACE INTO tracking_rules(exe_path, mode) VALUES(?1, ?2)")?;
        for e in ignore {
            stmt.execute(params![e, 0_i64])?;
        }
        for e in force {
            stmt.execute(params![e, 1_i64])?;
        }
    }
    tx.commit()?;
    Ok(())
}

// ── Per-tick persistence ──────────────────────────────────────────────────────

pub fn lookup_app_id(conn: &Connection, exe_path: &str) -> Result<Option<i64>, Error> {
    let mut stmt = conn.prepare("SELECT id FROM apps WHERE exe_path = ?1")?;
    let mut rows = stmt.query(params![exe_path])?;
    match rows.next()? {
        Some(r) => Ok(Some(r.get(0)?)),
        None => Ok(None),
    }
}

/// Insert (app_id, title) if new; returns its id.
pub fn upsert_window_title(conn: &Connection, app_id: i64, title: &str) -> Result<i64, Error> {
    conn.execute(
        "INSERT OR IGNORE INTO window_titles(app_id, title) VALUES(?1, ?2)",
        params![app_id, title],
    )?;
    let id: i64 = conn.query_row(
        "SELECT id FROM window_titles WHERE app_id = ?1 AND title = ?2",
        params![app_id, title],
        |r| r.get(0),
    )?;
    Ok(id)
}

/// Persist one tick atomically: upsert apps, insert resource + network samples,
/// accumulate run/focus totals, record any finished focus session. Returns the
/// exe→id map (for building the live snapshot) and the focused app's id.
pub fn persist_tick(
    conn: &mut Connection,
    snap: &Snapshot,
    poll_secs: i64,
) -> Result<(HashMap<String, i64>, Option<i64>), Error> {
    let tx = conn.transaction()?;
    let mut ids: HashMap<String, i64> = HashMap::new();

    for app in &snap.apps {
        let id = upsert_app(&tx, &app.exe_path, &app.name, app.is_system, snap.ts)?;
        tx.execute(
            "INSERT OR IGNORE INTO app_usage(app_id) VALUES(?1)",
            params![id],
        )?;
        tx.execute(
            "INSERT OR REPLACE INTO metric_samples
             (app_id, ts, cpu_pct, mem_bytes, disk_read_b, disk_write_b)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                id,
                snap.ts,
                app.cpu_pct as f64,
                app.mem_bytes as i64,
                app.disk_read_b as i64,
                app.disk_write_b as i64
            ],
        )?;
        tx.execute(
            "UPDATE app_usage SET total_run_secs = total_run_secs + ?1, last_run_secs = ?2
             WHERE app_id = ?3",
            params![poll_secs, app.run_secs as i64, id],
        )?;
        ids.insert(app.exe_path.clone(), id);
    }

    let net = &snap.net;
    let net_rows = [
        (0_i64, net.wifi_in, net.wifi_out),
        (1, net.eth_in, net.eth_out),
        (2, net.other_in, net.other_out),
    ];
    for (atype, in_b, out_b) in net_rows {
        if in_b == 0 && out_b == 0 {
            continue;
        }
        tx.execute(
            "INSERT OR REPLACE INTO network_samples (ts, adapter_type, in_delta_b, out_delta_b)
             VALUES (?1, ?2, ?3, ?4)",
            params![snap.ts, atype, in_b as i64, out_b as i64],
        )?;
    }

    if let Some(f) = &snap.finished_focus {
        let id = match ids.get(&f.exe_path) {
            Some(&id) => Some(id),
            None => lookup_app_id(&tx, &f.exe_path)?,
        };
        if let Some(id) = id {
            let title_id = match &f.title {
                Some(t) if !t.is_empty() => Some(upsert_window_title(&tx, id, t)?),
                _ => None,
            };
            tx.execute(
                "INSERT INTO focus_sessions (app_id, started_at, ended_at, duration, title_id)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![id, f.started_at, f.ended_at, f.duration, title_id],
            )?;
            tx.execute(
                "INSERT OR IGNORE INTO app_usage(app_id) VALUES(?1)",
                params![id],
            )?;
            tx.execute(
                "UPDATE app_usage SET total_focus_secs = total_focus_secs + ?1 WHERE app_id = ?2",
                params![f.duration, id],
            )?;
        }
    }

    let focused_app_id = snap.focused_exe.as_ref().and_then(|e| ids.get(e).copied());

    tx.commit()?;
    Ok((ids, focused_app_id))
}

// ── Historical reads ──────────────────────────────────────────────────────────

/// App list with lifetime totals and average CPU/memory since `since` (unix s).
pub fn list_apps(conn: &Connection, since: i64) -> Result<Vec<AppAggregate>, Error> {
    let mut stmt = conn.prepare(
        "SELECT a.id, a.name, a.exe_path, a.is_system, a.last_seen,
                COALESCE(u.total_focus_secs, 0), COALESCE(u.total_run_secs, 0),
                COALESCE(AVG(m.cpu_pct), 0.0),
                COALESCE(CAST(AVG(m.mem_bytes) AS INTEGER), 0)
         FROM apps a
         LEFT JOIN app_usage u ON u.app_id = a.id
         LEFT JOIN metric_samples m ON m.app_id = a.id AND m.ts >= ?1
         GROUP BY a.id
         ORDER BY COALESCE(u.total_focus_secs, 0) DESC, a.last_seen DESC",
    )?;
    let rows = stmt.query_map(params![since], |r| {
        Ok(AppAggregate {
            app_id: r.get(0)?,
            name: r.get(1)?,
            exe_path: r.get(2)?,
            is_system: r.get::<_, i64>(3)? != 0,
            last_seen: r.get(4)?,
            total_focus_secs: r.get(5)?,
            total_run_secs: r.get(6)?,
            avg_cpu_pct: r.get::<_, f64>(7)? as f32,
            avg_mem_bytes: r.get(8)?,
        })
    })?;
    collect(rows)
}

/// Per-app resource history, downsampled into `bucket`-second groups.
pub fn app_history(
    conn: &Connection,
    app_id: i64,
    from: i64,
    to: i64,
    bucket: i64,
) -> Result<Vec<MetricPoint>, Error> {
    let b = bucket.max(1);
    let mut stmt = conn.prepare(
        "SELECT (ts / ?4) * ?4 AS bucket,
                AVG(cpu_pct), CAST(AVG(mem_bytes) AS INTEGER),
                SUM(disk_read_b), SUM(disk_write_b)
         FROM metric_samples
         WHERE app_id = ?1 AND ts BETWEEN ?2 AND ?3
         GROUP BY bucket ORDER BY bucket",
    )?;
    let rows = stmt.query_map(params![app_id, from, to, b], |r| {
        Ok(MetricPoint {
            ts: r.get(0)?,
            cpu_pct: r.get::<_, f64>(1)? as f32,
            mem_bytes: r.get(2)?,
            disk_read_b: r.get(3)?,
            disk_write_b: r.get(4)?,
        })
    })?;
    collect(rows)
}

/// System network history, pivoted by adapter type, downsampled into buckets.
pub fn network_history(
    conn: &Connection,
    from: i64,
    to: i64,
    bucket: i64,
) -> Result<Vec<NetPoint>, Error> {
    let b = bucket.max(1);
    let mut stmt = conn.prepare(
        "SELECT (ts / ?3) * ?3 AS bucket,
            SUM(CASE WHEN adapter_type=0 THEN in_delta_b  ELSE 0 END),
            SUM(CASE WHEN adapter_type=0 THEN out_delta_b ELSE 0 END),
            SUM(CASE WHEN adapter_type=1 THEN in_delta_b  ELSE 0 END),
            SUM(CASE WHEN adapter_type=1 THEN out_delta_b ELSE 0 END),
            SUM(CASE WHEN adapter_type=2 THEN in_delta_b  ELSE 0 END),
            SUM(CASE WHEN adapter_type=2 THEN out_delta_b ELSE 0 END)
         FROM network_samples
         WHERE ts BETWEEN ?1 AND ?2
         GROUP BY bucket ORDER BY bucket",
    )?;
    let rows = stmt.query_map(params![from, to, b], |r| {
        Ok(NetPoint {
            ts: r.get(0)?,
            wifi_in_b: r.get(1)?,
            wifi_out_b: r.get(2)?,
            eth_in_b: r.get(3)?,
            eth_out_b: r.get(4)?,
            other_in_b: r.get(5)?,
            other_out_b: r.get(6)?,
        })
    })?;
    collect(rows)
}

/// Network byte totals over a range, by adapter type.
pub fn network_totals(conn: &Connection, from: i64, to: i64) -> Result<NetTotals, Error> {
    let t = conn.query_row(
        "SELECT
            COALESCE(SUM(CASE WHEN adapter_type=0 THEN in_delta_b  ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN adapter_type=0 THEN out_delta_b ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN adapter_type=1 THEN in_delta_b  ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN adapter_type=1 THEN out_delta_b ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN adapter_type=2 THEN in_delta_b  ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN adapter_type=2 THEN out_delta_b ELSE 0 END), 0)
         FROM network_samples WHERE ts BETWEEN ?1 AND ?2",
        params![from, to],
        |r| {
            Ok(NetTotals {
                wifi_in_b: r.get(0)?,
                wifi_out_b: r.get(1)?,
                eth_in_b: r.get(2)?,
                eth_out_b: r.get(3)?,
                other_in_b: r.get(4)?,
                other_out_b: r.get(5)?,
            })
        },
    )?;
    Ok(t)
}

/// Focus time per app over a range, descending.
pub fn focus_summary(
    conn: &Connection,
    from: i64,
    to: i64,
    limit: i64,
) -> Result<Vec<FocusSummaryRow>, Error> {
    let mut stmt = conn.prepare(
        "SELECT f.app_id, a.name, SUM(f.duration) AS secs
         FROM focus_sessions f JOIN apps a ON a.id = f.app_id
         WHERE f.started_at BETWEEN ?1 AND ?2
         GROUP BY f.app_id ORDER BY secs DESC LIMIT ?3",
    )?;
    let rows = stmt.query_map(params![from, to, limit], |r| {
        Ok(FocusSummaryRow {
            app_id: r.get(0)?,
            name: r.get(1)?,
            focus_secs: r.get(2)?,
        })
    })?;
    collect(rows)
}

/// Top window titles within one app over a range.
pub fn app_window_focus(
    conn: &Connection,
    app_id: i64,
    from: i64,
    to: i64,
    limit: i64,
) -> Result<Vec<TitleFocusRow>, Error> {
    let mut stmt = conn.prepare(
        "SELECT COALESCE(w.title, '(no title)'), SUM(f.duration) AS secs
         FROM focus_sessions f
         LEFT JOIN window_titles w ON w.id = f.title_id
         WHERE f.app_id = ?1 AND f.started_at BETWEEN ?2 AND ?3
         GROUP BY f.title_id ORDER BY secs DESC LIMIT ?4",
    )?;
    let rows = stmt.query_map(params![app_id, from, to, limit], |r| {
        Ok(TitleFocusRow {
            title: r.get(0)?,
            focus_secs: r.get(1)?,
        })
    })?;
    collect(rows)
}

/// Top window titles across all apps over a range.
pub fn window_focus_summary(
    conn: &Connection,
    from: i64,
    to: i64,
    limit: i64,
) -> Result<Vec<WindowFocusRow>, Error> {
    let mut stmt = conn.prepare(
        "SELECT a.id, a.name, COALESCE(w.title, '(no title)'), SUM(f.duration) AS secs
         FROM focus_sessions f
         JOIN apps a ON a.id = f.app_id
         LEFT JOIN window_titles w ON w.id = f.title_id
         WHERE f.started_at BETWEEN ?1 AND ?2
         GROUP BY f.app_id, f.title_id ORDER BY secs DESC LIMIT ?3",
    )?;
    let rows = stmt.query_map(params![from, to, limit], |r| {
        Ok(WindowFocusRow {
            app_id: r.get(0)?,
            name: r.get(1)?,
            title: r.get(2)?,
            focus_secs: r.get(3)?,
        })
    })?;
    collect(rows)
}

// ── Retention: roll completed days into dailies, prune old raw samples ────────

pub fn rollup_and_prune(conn: &mut Connection, retention_days: i64, now: i64) -> Result<(), Error> {
    let today = now - now.rem_euclid(86_400);
    let cutoff = now - retention_days.max(1) * 86_400;
    let tx = conn.transaction()?;
    tx.execute(
        "INSERT OR REPLACE INTO metric_daily
         SELECT app_id, (ts/86400)*86400 AS day, AVG(cpu_pct), MAX(cpu_pct),
                CAST(AVG(mem_bytes) AS INTEGER), MAX(mem_bytes),
                SUM(disk_read_b), SUM(disk_write_b), COUNT(*)
         FROM metric_samples WHERE ts < ?1 GROUP BY app_id, day",
        params![today],
    )?;
    tx.execute(
        "INSERT OR REPLACE INTO network_daily
         SELECT (ts/86400)*86400 AS day, adapter_type, SUM(in_delta_b), SUM(out_delta_b)
         FROM network_samples WHERE ts < ?1 GROUP BY day, adapter_type",
        params![today],
    )?;
    tx.execute("DELETE FROM metric_samples WHERE ts < ?1", params![cutoff])?;
    tx.execute("DELETE FROM network_samples WHERE ts < ?1", params![cutoff])?;
    tx.commit()?;
    Ok(())
}
