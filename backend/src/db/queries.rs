//! All SQL lives here. No SQL string should appear outside this module.

use crate::dto::{
    AppAggregate, BrowserProfileRow, Dashboard, DayFocus, FocusFilterOptions, FocusGroup,
    FocusGroupInput, FocusGroupRule, FocusGroupSummaryRow, FocusSummaryRow, FocusTimeline,
    FocusTimelinePoint, FocusTimelineSeries, MetricPoint, NetPoint, NetTotals, Panel, PanelInput,
    TitleFocusRow, UrlRow, WindowFocusRow,
};
use crate::error::Error;
use crate::focus_groups::Matcher;
use crate::telemetry::Snapshot;
use rusqlite::{params, Connection};
use std::collections::HashMap;

/// Identity of the implicit catch-all bucket for unmatched focus sessions.
const UNGROUPED: (i64, &str, &str) = (0, "Ungrouped", "#525252");

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
                "INSERT INTO focus_sessions
                 (app_id, started_at, ended_at, duration, title_id, browser_profile, url)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![id, f.started_at, f.ended_at, f.duration, title_id, f.browser_profile, f.url],
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

/// Per-window focus split across `bucket`-second time buckets over [from, to].
/// Each focus session is distributed across the buckets it overlaps (clamped to
/// the range). Returns the top `limit` windows by total focus plus an aggregated
/// "Other" series for the remainder.
pub fn focus_timeline(
    conn: &Connection,
    from: i64,
    to: i64,
    bucket: i64,
    limit: i64,
) -> Result<FocusTimeline, Error> {
    use std::collections::{HashMap, HashSet};

    let bucket = bucket.max(1);
    let span = (to - from).max(bucket);
    let n = (((span + bucket - 1) / bucket) as usize).clamp(1, 5000);

    let mut stmt = conn.prepare(
        "SELECT f.started_at, f.ended_at, f.title_id, COALESCE(w.title, '(no title)'), a.name
         FROM focus_sessions f
         JOIN apps a ON a.id = f.app_id
         LEFT JOIN window_titles w ON w.id = f.title_id
         WHERE f.ended_at >= ?1 AND f.started_at <= ?2",
    )?;

    let mut buckets: HashMap<i64, Vec<i64>> = HashMap::new();
    let mut totals: HashMap<i64, i64> = HashMap::new();
    let mut meta: HashMap<i64, (String, String)> = HashMap::new(); // key -> (app, title)

    let rows = stmt.query_map(params![from, to], |r| {
        Ok((
            r.get::<_, i64>(0)?,                       // started
            r.get::<_, i64>(1)?,                       // ended
            r.get::<_, Option<i64>>(2)?.unwrap_or(0),  // title_id (0 = none)
            r.get::<_, String>(3)?,                    // title
            r.get::<_, String>(4)?,                    // app name
        ))
    })?;

    for row in rows {
        let (started, ended, key, title, app) = row?;
        meta.entry(key).or_insert((app, title));
        let s = started.max(from);
        let e = ended.min(to);
        if e <= s {
            continue;
        }
        let bi_start = ((s - from) / bucket) as usize;
        let bi_end = (((e - 1 - from) / bucket) as usize).min(n - 1);
        let arr = buckets.entry(key).or_insert_with(|| vec![0i64; n]);
        for bi in bi_start..=bi_end {
            let bstart = from + (bi as i64) * bucket;
            let bend = bstart + bucket;
            let overlap = e.min(bend) - s.max(bstart);
            if overlap > 0 {
                arr[bi] += overlap;
                *totals.entry(key).or_insert(0) += overlap;
            }
        }
    }

    // Rank windows by total focus; keep top `limit`, aggregate the rest as Other.
    let mut keys: Vec<i64> = totals.keys().copied().collect();
    keys.sort_by(|a, b| totals[b].cmp(&totals[a]));
    let top: Vec<i64> = keys.iter().copied().take(limit.max(1) as usize).collect();
    let top_set: HashSet<i64> = top.iter().copied().collect();

    let mut series = Vec::new();
    for k in &top {
        let (app, title) = meta.get(k).cloned().unwrap_or_default();
        series.push(FocusTimelineSeries {
            id: *k,
            app_name: app,
            title,
            total_secs: totals[k],
            color: String::new(),
        });
    }

    let mut other = vec![0i64; n];
    let mut other_total = 0i64;
    for k in keys.iter().filter(|k| !top_set.contains(k)) {
        if let Some(arr) = buckets.get(k) {
            for (i, v) in arr.iter().enumerate() {
                other[i] += v;
            }
            other_total += totals[k];
        }
    }
    let has_other = other_total > 0;
    if has_other {
        series.push(FocusTimelineSeries {
            id: -1,
            app_name: String::new(),
            title: "Other".to_string(),
            total_secs: other_total,
            color: String::new(),
        });
    }

    let mut points = Vec::with_capacity(n);
    for bi in 0..n {
        let ts = from + (bi as i64) * bucket;
        let mut secs: Vec<i64> = top
            .iter()
            .map(|k| buckets.get(k).map(|a| a[bi]).unwrap_or(0))
            .collect();
        if has_other {
            secs.push(other[bi]);
        }
        points.push(FocusTimelinePoint { ts, secs });
    }

    Ok(FocusTimeline {
        bucket_secs: bucket,
        series,
        points,
    })
}

/// Total focus seconds per UTC day over a range (for the calendar heatmap).
pub fn focus_by_day(conn: &Connection, from: i64, to: i64) -> Result<Vec<DayFocus>, Error> {
    let mut stmt = conn.prepare(
        "SELECT (started_at/86400)*86400 AS day, SUM(duration) AS secs
         FROM focus_sessions
         WHERE started_at BETWEEN ?1 AND ?2
         GROUP BY day ORDER BY day",
    )?;
    let rows = stmt.query_map(params![from, to], |r| {
        Ok(DayFocus {
            day: r.get(0)?,
            focus_secs: r.get(1)?,
        })
    })?;
    collect(rows)
}

// ── Focus groups ──────────────────────────────────────────────────────────────

/// All focus groups with their ordered rules.
pub fn list_focus_groups(conn: &Connection) -> Result<Vec<FocusGroup>, Error> {
    let mut stmt = conn.prepare("SELECT id, name, color FROM focus_groups ORDER BY sort, id")?;
    let metas = stmt.query_map([], |r| {
        Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?))
    })?;
    let metas = collect(metas)?;
    let mut out = Vec::with_capacity(metas.len());
    for (id, name, color) in metas {
        let mut rs = conn.prepare(
            "SELECT field, op, value FROM focus_group_rules WHERE group_id = ?1 ORDER BY sort, id",
        )?;
        let rules = rs.query_map(params![id], |r| {
            Ok(FocusGroupRule {
                field: r.get(0)?,
                op: r.get(1)?,
                value: r.get(2)?,
            })
        })?;
        out.push(FocusGroup {
            id,
            name,
            color,
            rules: collect(rules)?,
        });
    }
    Ok(out)
}

/// Replace the entire group set (+ rules) in one transaction. Order is taken
/// from the input array. Cascades drop old rules via the FK.
pub fn replace_focus_groups(
    conn: &mut Connection,
    groups: &[FocusGroupInput],
) -> Result<(), Error> {
    let tx = conn.transaction()?;
    tx.execute("DELETE FROM focus_groups", [])?;
    {
        let mut gstmt =
            tx.prepare("INSERT INTO focus_groups(name, color, sort) VALUES(?1, ?2, ?3)")?;
        let mut rstmt = tx.prepare(
            "INSERT INTO focus_group_rules(group_id, field, op, value, sort)
             VALUES(?1, ?2, ?3, ?4, ?5)",
        )?;
        for (gi, g) in groups.iter().enumerate() {
            gstmt.execute(params![g.name, g.color, gi as i64])?;
            let gid = tx.last_insert_rowid();
            for (ri, r) in g.rules.iter().enumerate() {
                rstmt.execute(params![gid, r.field, r.op, r.value, ri as i64])?;
            }
        }
    }
    tx.commit()?;
    Ok(())
}

/// Focus time per browser profile for one app over a range.
pub fn app_browser_profile_focus(
    conn: &Connection,
    app_id: i64,
    from: i64,
    to: i64,
    limit: i64,
) -> Result<Vec<BrowserProfileRow>, Error> {
    let mut stmt = conn.prepare(
        "SELECT browser_profile, SUM(duration) AS secs
         FROM focus_sessions
         WHERE app_id = ?1 AND started_at BETWEEN ?2 AND ?3
           AND browser_profile IS NOT NULL
         GROUP BY browser_profile
         ORDER BY secs DESC
         LIMIT ?4",
    )?;
    let rows = stmt.query_map(params![app_id, from, to, limit], |r| {
        Ok(BrowserProfileRow {
            profile: r.get(0)?,
            focus_secs: r.get(1)?,
        })
    })?;
    collect(rows)
}

/// Focus time per URL for one Chromium app over a range.
pub fn app_url_focus(
    conn: &Connection,
    app_id: i64,
    from: i64,
    to: i64,
    limit: i64,
) -> Result<Vec<UrlRow>, Error> {
    let mut stmt = conn.prepare(
        "SELECT url, SUM(duration) AS secs
         FROM focus_sessions
         WHERE app_id = ?1 AND started_at BETWEEN ?2 AND ?3
           AND url IS NOT NULL
         GROUP BY url
         ORDER BY secs DESC
         LIMIT ?4",
    )?;
    let rows = stmt.query_map(params![app_id, from, to, limit], |r| {
        Ok(UrlRow {
            url: r.get(0)?,
            focus_secs: r.get(1)?,
        })
    })?;
    collect(rows)
}

/// Distinct executables + window titles + browser profiles + URLs for rule autocompletion.
/// Titles and URLs are ranked by total focus time and capped to keep the payload small.
pub fn focus_filter_options(conn: &Connection) -> Result<FocusFilterOptions, Error> {
    let mut exes_stmt = conn.prepare("SELECT name FROM apps GROUP BY name ORDER BY name")?;
    let exes = collect(exes_stmt.query_map([], |r| r.get::<_, String>(0))?)?;

    let mut titles_stmt = conn.prepare(
        "SELECT w.title
         FROM window_titles w
         LEFT JOIN focus_sessions f ON f.title_id = w.id
         GROUP BY w.title
         ORDER BY COALESCE(SUM(f.duration), 0) DESC, w.title
         LIMIT 500",
    )?;
    let titles = collect(titles_stmt.query_map([], |r| r.get::<_, String>(0))?)?;

    let mut profiles_stmt = conn.prepare(
        "SELECT DISTINCT browser_profile FROM focus_sessions
         WHERE browser_profile IS NOT NULL
         ORDER BY browser_profile",
    )?;
    let browser_profiles = collect(profiles_stmt.query_map([], |r| r.get::<_, String>(0))?)?;

    let mut urls_stmt = conn.prepare(
        "SELECT url, SUM(duration) AS secs
         FROM focus_sessions
         WHERE url IS NOT NULL
         GROUP BY url
         ORDER BY secs DESC
         LIMIT 500",
    )?;
    let urls = collect(urls_stmt.query_map([], |r| r.get::<_, String>(0))?)?;

    eprintln!(
        "[queries::focus_filter_options] exes={} titles={} browser_profiles={} urls={}",
        exes.len(), titles.len(), browser_profiles.len(), urls.len()
    );
    eprintln!("[queries::focus_filter_options] browser_profiles={browser_profiles:?}");
    Ok(FocusFilterOptions { exes, titles, browser_profiles, urls })
}

/// All focus rows (app name, title, browser_profile, url, duration) over a range.
fn focus_rows(
    conn: &Connection,
    from: i64,
    to: i64,
) -> Result<Vec<(String, String, Option<String>, Option<String>, i64)>, Error> {
    let mut stmt = conn.prepare(
        "SELECT a.name, COALESCE(w.title, '(no title)'), f.browser_profile, f.url, f.duration
         FROM focus_sessions f
         JOIN apps a ON a.id = f.app_id
         LEFT JOIN window_titles w ON w.id = f.title_id
         WHERE f.started_at BETWEEN ?1 AND ?2",
    )?;
    let rows = stmt.query_map(params![from, to], |r| {
        Ok((
            r.get::<_, String>(0)?,
            r.get::<_, String>(1)?,
            r.get::<_, Option<String>>(2)?,
            r.get::<_, Option<String>>(3)?,
            r.get::<_, i64>(4)?,
        ))
    })?;
    collect(rows)
}

/// Focus time rolled up into user groups over a range, descending. Unmatched
/// sessions accumulate into the "Ungrouped" bucket (group id 0).
pub fn focus_by_group(
    conn: &Connection,
    matcher: &Matcher,
    from: i64,
    to: i64,
) -> Result<Vec<FocusGroupSummaryRow>, Error> {
    let mut totals: HashMap<i64, i64> = HashMap::new();
    let mut meta: HashMap<i64, (String, String)> = HashMap::new();
    for (name, title, profile, url, dur) in focus_rows(conn, from, to)? {
        let (gid, gname, gcolor) = matcher
            .assign(&name, &title, profile.as_deref(), url.as_deref())
            .map(|(id, n, c)| (id, n.to_string(), c.to_string()))
            .unwrap_or_else(|| (UNGROUPED.0, UNGROUPED.1.to_string(), UNGROUPED.2.to_string()));
        meta.entry(gid).or_insert((gname, gcolor));
        *totals.entry(gid).or_insert(0) += dur;
    }
    let mut out: Vec<FocusGroupSummaryRow> = totals
        .into_iter()
        .map(|(group_id, focus_secs)| {
            let (name, color) = meta.remove(&group_id).unwrap_or_default();
            FocusGroupSummaryRow {
                group_id,
                name,
                color,
                focus_secs,
            }
        })
        .collect();
    out.sort_by(|a, b| b.focus_secs.cmp(&a.focus_secs));
    Ok(out)
}

/// Per-group focus split across time buckets over a range (grouped timeline).
/// Mirrors `focus_timeline` bucketing, but keys by assigned group and carries
/// the group color on each series. No "Other" rollup (groups are already few).
pub fn focus_group_timeline(
    conn: &Connection,
    matcher: &Matcher,
    from: i64,
    to: i64,
    bucket: i64,
) -> Result<FocusTimeline, Error> {
    let bucket = bucket.max(1);
    let span = (to - from).max(bucket);
    let n = (((span + bucket - 1) / bucket) as usize).clamp(1, 5000);

    let mut stmt = conn.prepare(
        "SELECT f.started_at, f.ended_at, COALESCE(w.title, '(no title)'), a.name, f.browser_profile, f.url
         FROM focus_sessions f
         JOIN apps a ON a.id = f.app_id
         LEFT JOIN window_titles w ON w.id = f.title_id
         WHERE f.ended_at >= ?1 AND f.started_at <= ?2",
    )?;

    let mut buckets: HashMap<i64, Vec<i64>> = HashMap::new();
    let mut totals: HashMap<i64, i64> = HashMap::new();
    let mut meta: HashMap<i64, (String, String)> = HashMap::new();

    let rows = stmt.query_map(params![from, to], |r| {
        Ok((
            r.get::<_, i64>(0)?,
            r.get::<_, i64>(1)?,
            r.get::<_, String>(2)?,
            r.get::<_, String>(3)?,
            r.get::<_, Option<String>>(4)?,
            r.get::<_, Option<String>>(5)?,
        ))
    })?;

    for row in rows {
        let (started, ended, title, app, profile, url) = row?;
        let (gid, gname, gcolor) = matcher
            .assign(&app, &title, profile.as_deref(), url.as_deref())
            .map(|(id, n, c)| (id, n.to_string(), c.to_string()))
            .unwrap_or_else(|| (UNGROUPED.0, UNGROUPED.1.to_string(), UNGROUPED.2.to_string()));
        meta.entry(gid).or_insert((gname, gcolor));
        let s = started.max(from);
        let e = ended.min(to);
        if e <= s {
            continue;
        }
        let bi_start = ((s - from) / bucket) as usize;
        let bi_end = (((e - 1 - from) / bucket) as usize).min(n - 1);
        let arr = buckets.entry(gid).or_insert_with(|| vec![0i64; n]);
        for bi in bi_start..=bi_end {
            let bstart = from + (bi as i64) * bucket;
            let bend = bstart + bucket;
            let overlap = e.min(bend) - s.max(bstart);
            if overlap > 0 {
                arr[bi] += overlap;
                *totals.entry(gid).or_insert(0) += overlap;
            }
        }
    }

    let mut keys: Vec<i64> = totals.keys().copied().collect();
    keys.sort_by(|a, b| totals[b].cmp(&totals[a]));

    let series = keys
        .iter()
        .map(|k| {
            let (name, color) = meta.get(k).cloned().unwrap_or_default();
            FocusTimelineSeries {
                id: *k,
                app_name: String::new(),
                title: name,
                total_secs: totals[k],
                color,
            }
        })
        .collect();

    let mut points = Vec::with_capacity(n);
    for bi in 0..n {
        let ts = from + (bi as i64) * bucket;
        let secs = keys
            .iter()
            .map(|k| buckets.get(k).map(|a| a[bi]).unwrap_or(0))
            .collect();
        points.push(FocusTimelinePoint { ts, secs });
    }

    Ok(FocusTimeline {
        bucket_secs: bucket,
        series,
        points,
    })
}

// ── Custom dashboards ─────────────────────────────────────────────────────────

fn panels_for(conn: &Connection, dashboard_id: i64) -> Result<Vec<Panel>, Error> {
    let mut stmt = conn.prepare(
        "SELECT id, dashboard_id, title, kind, chart_type, args_json, range_key, x, y, w, h, sort
         FROM panels WHERE dashboard_id = ?1 ORDER BY sort, id",
    )?;
    let rows = stmt.query_map(params![dashboard_id], |r| {
        Ok(Panel {
            id: r.get(0)?,
            dashboard_id: r.get(1)?,
            title: r.get(2)?,
            kind: r.get(3)?,
            chart_type: r.get(4)?,
            args_json: r.get(5)?,
            range_key: r.get(6)?,
            x: r.get(7)?,
            y: r.get(8)?,
            w: r.get(9)?,
            h: r.get(10)?,
            sort: r.get(11)?,
        })
    })?;
    collect(rows)
}

/// All dashboards with their panels, ordered by sort.
pub fn list_dashboards(conn: &Connection) -> Result<Vec<Dashboard>, Error> {
    let mut stmt =
        conn.prepare("SELECT id, name, is_default, sort FROM dashboards ORDER BY sort, id")?;
    let metas = stmt.query_map([], |r| {
        Ok((
            r.get::<_, i64>(0)?,
            r.get::<_, String>(1)?,
            r.get::<_, i64>(2)? != 0,
            r.get::<_, i64>(3)?,
        ))
    })?;
    let metas = collect(metas)?;
    let mut out = Vec::with_capacity(metas.len());
    for (id, name, is_default, sort) in metas {
        out.push(Dashboard {
            id,
            name,
            is_default,
            sort,
            panels: panels_for(conn, id)?,
        });
    }
    Ok(out)
}

/// Create an empty dashboard; returns its id.
pub fn create_dashboard(conn: &Connection, name: &str) -> Result<i64, Error> {
    let sort: i64 = conn.query_row("SELECT COALESCE(MAX(sort), -1) + 1 FROM dashboards", [], |r| {
        r.get(0)
    })?;
    conn.execute(
        "INSERT INTO dashboards(name, is_default, sort) VALUES(?1, 0, ?2)",
        params![name, sort],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn rename_dashboard(conn: &Connection, id: i64, name: &str) -> Result<(), Error> {
    conn.execute("UPDATE dashboards SET name = ?2 WHERE id = ?1", params![id, name])?;
    Ok(())
}

pub fn delete_dashboard(conn: &Connection, id: i64) -> Result<(), Error> {
    conn.execute("DELETE FROM dashboards WHERE id = ?1", params![id])?;
    Ok(())
}

/// Replace all panels of a dashboard in one transaction (layout + config save).
pub fn replace_panels(
    conn: &mut Connection,
    dashboard_id: i64,
    panels: &[PanelInput],
) -> Result<(), Error> {
    let tx = conn.transaction()?;
    tx.execute("DELETE FROM panels WHERE dashboard_id = ?1", params![dashboard_id])?;
    {
        let mut stmt = tx.prepare(
            "INSERT INTO panels
             (dashboard_id, title, kind, chart_type, args_json, range_key, x, y, w, h, sort)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        )?;
        for (i, p) in panels.iter().enumerate() {
            stmt.execute(params![
                dashboard_id,
                p.title,
                p.kind,
                p.chart_type,
                p.args_json,
                p.range_key,
                p.x,
                p.y,
                p.w,
                p.h,
                if p.sort != 0 { p.sort } else { i as i64 },
            ])?;
        }
    }
    tx.commit()?;
    Ok(())
}

/// Seed one default dashboard the first time V3 runs (no-op if any exist).
pub fn seed_default_dashboard(conn: &Connection) -> Result<(), Error> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM dashboards", [], |r| r.get(0))?;
    if count > 0 {
        return Ok(());
    }
    conn.execute(
        "INSERT INTO dashboards(name, is_default, sort) VALUES('Overview', 1, 0)",
        [],
    )?;
    let id = conn.last_insert_rowid();
    // (title, kind, chart_type, range_key, x, y, w, h)
    let seed: &[(&str, &str, &str, &str, i64, i64, i64, i64)] = &[
        ("Focused windows over time", "focus_timeline", "area", "24h", 0, 0, 12, 7),
        ("Top apps by CPU", "top_apps", "bar", "24h", 0, 7, 6, 7),
        ("Network throughput", "net_throughput", "area", "24h", 6, 7, 6, 7),
        ("Connection split", "net_split", "donut", "24h", 0, 14, 4, 6),
        ("Focus by day", "focus_calendar", "calendar", "30d", 4, 14, 8, 6),
    ];
    let mut stmt = conn.prepare(
        "INSERT INTO panels
         (dashboard_id, title, kind, chart_type, args_json, range_key, x, y, w, h, sort)
         VALUES (?1, ?2, ?3, ?4, '{}', ?5, ?6, ?7, ?8, ?9, ?10)",
    )?;
    for (i, (title, kind, chart, range, x, y, w, h)) in seed.iter().enumerate() {
        stmt.execute(params![id, title, kind, chart, range, x, y, w, h, i as i64])?;
    }
    Ok(())
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
