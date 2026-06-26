use tauri::{AppHandle, State, Window};

use crate::db::queries;
use crate::dto::{AppAggregate, FocusSummaryRow, LiveSnapshot, MetricPoint, NetPoint, NetTotals};
use crate::error::Error;
use crate::settings::TrackingConfig;
use crate::state::AppState;
use crate::util;

#[tauri::command]
pub fn restart_app(app: AppHandle) {
    app.restart()
}

#[tauri::command]
pub fn hide_window(window: Window) {
    let _ = window.hide();
}

/// Most recent telemetry tick (cached by the poll loop); `None` before tick #1.
#[tauri::command]
pub fn live_snapshot(state: State<'_, AppState>) -> Result<Option<LiveSnapshot>, Error> {
    Ok(state.last_snapshot.lock().unwrap().clone())
}

/// Tracked apps with lifetime totals + average CPU/mem over the last
/// `window_secs` seconds (defaults to all time).
#[tauri::command]
pub fn list_apps(
    state: State<'_, AppState>,
    window_secs: Option<i64>,
) -> Result<Vec<AppAggregate>, Error> {
    let since = window_secs.map(|w| util::now_unix() - w).unwrap_or(0);
    let conn = state.db.lock().unwrap();
    queries::list_apps(&conn, since)
}

#[tauri::command]
pub fn app_history(
    state: State<'_, AppState>,
    app_id: i64,
    from: i64,
    to: i64,
    bucket_secs: Option<i64>,
) -> Result<Vec<MetricPoint>, Error> {
    let conn = state.db.lock().unwrap();
    queries::app_history(&conn, app_id, from, to, bucket_secs.unwrap_or(1))
}

#[tauri::command]
pub fn network_history(
    state: State<'_, AppState>,
    from: i64,
    to: i64,
    bucket_secs: Option<i64>,
) -> Result<Vec<NetPoint>, Error> {
    let conn = state.db.lock().unwrap();
    queries::network_history(&conn, from, to, bucket_secs.unwrap_or(1))
}

#[tauri::command]
pub fn network_totals(
    state: State<'_, AppState>,
    from: i64,
    to: i64,
) -> Result<NetTotals, Error> {
    let conn = state.db.lock().unwrap();
    queries::network_totals(&conn, from, to)
}

#[tauri::command]
pub fn focus_summary(
    state: State<'_, AppState>,
    from: i64,
    to: i64,
    limit: Option<i64>,
) -> Result<Vec<FocusSummaryRow>, Error> {
    let conn = state.db.lock().unwrap();
    queries::focus_summary(&conn, from, to, limit.unwrap_or(50))
}

#[tauri::command]
pub fn get_tracking_config(state: State<'_, AppState>) -> Result<TrackingConfig, Error> {
    Ok(state.config.read().unwrap().clone())
}

#[tauri::command]
pub fn set_tracking_config(
    state: State<'_, AppState>,
    config: TrackingConfig,
) -> Result<(), Error> {
    {
        let mut conn = state.db.lock().unwrap();
        config.save(&mut conn)?;
    }
    *state.config.write().unwrap() = config;
    Ok(())
}
