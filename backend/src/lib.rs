use tauri::{
    App, AppHandle, Emitter, Manager, Window, WindowEvent,
    menu::{Menu, MenuEvent, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent},
};

use std::sync::{Mutex, RwLock};
use std::time::Duration;
use sysinfo::{ProcessesToUpdate, System};

use crate::settings::TrackingConfig;
use crate::state::{AppState, Collectors};
use crate::telemetry::{focus::FocusTracker, network::NetCounters};

mod commands;
mod db;
mod dto;
mod error;
mod settings;
mod state;
mod telemetry;
mod util;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            commands::restart_app,
            commands::hide_window,
            commands::live_snapshot,
            commands::list_apps,
            commands::app_history,
            commands::network_history,
            commands::network_totals,
            commands::focus_summary,
            commands::app_window_focus,
            commands::window_focus_summary,
            commands::get_tracking_config,
            commands::set_tracking_config,
        ])
        .setup(setup)
        .on_window_event(on_window_event)
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn setup(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    let open_i = MenuItem::with_id(app, "open", "Open Focus Trace", true, None::<&str>)?;
    let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open_i, &quit_i])?;
    let _tray = TrayIconBuilder::new()
        .menu(&menu)
        .show_menu_on_left_click(false)
        .icon(
            app.default_window_icon()
                .expect("window default icon to exist")
                .clone(),
        )
        .title("Focus Trace")
        .tooltip("Focus Trace")
        .on_menu_event(on_menu_event)
        .on_tray_icon_event(on_tray_icon_event)
        .build(app)?;

    // ── Telemetry: open DB, seed state, spawn the poll loop ──────────────────
    let db_path = app.path().app_data_dir()?.join("app-view.db");
    let conn = db::init(&db_path)?;
    let config = TrackingConfig::load(&conn)?;
    let poll_secs = config.poll_secs.max(1);

    // First refresh establishes the CPU baseline; the loop's initial sleep
    // provides the gap before the second refresh yields real CPU percentages.
    let mut system = System::new();
    system.refresh_processes(ProcessesToUpdate::All, true);

    app.manage(AppState {
        db: Mutex::new(conn),
        collectors: Mutex::new(Collectors {
            system,
            net: NetCounters::new(),
            focus: FocusTracker::new(),
        }),
        last_snapshot: Mutex::new(None),
        config: RwLock::new(config),
    });

    let handle = app.handle().clone();

    // Roll up + prune any data left from previous runs.
    {
        let state = handle.state::<AppState>();
        let retention = state.config.read().unwrap().raw_retention_days as i64;
        let mut conn = state.db.lock().unwrap();
        if let Err(e) = db::queries::rollup_and_prune(&mut conn, retention, util::now_unix()) {
            eprintln!("startup rollup failed: {e}");
        }
    }

    std::thread::spawn(move || poll_loop(handle, poll_secs));

    Ok(())
}

/// Background telemetry loop: collect → persist → cache → emit, once per tick.
fn poll_loop(handle: AppHandle, poll_secs: u64) {
    let mut last_day = util::utc_midnight(util::now_unix());

    loop {
        std::thread::sleep(Duration::from_secs(poll_secs));
        let now = util::now_unix();
        let state = handle.state::<AppState>();

        // 1. Collect (blocking syscalls). Build a plain Snapshot, then drop the lock.
        let snapshot = {
            let mut c = state.collectors.lock().unwrap();
            c.system.refresh_processes(ProcessesToUpdate::All, true);
            let cfg = state.config.read().unwrap().clone();
            let apps = telemetry::process::aggregate(&c.system, &cfg);
            let fg = telemetry::focus::foreground_window(&c.system);
            let finished = c.focus.update(fg.clone(), now);
            let (focused_exe, focused_title) = match fg {
                Some((exe, title)) => (Some(exe), title),
                None => (None, None),
            };
            let net = telemetry::network::read_and_diff(&mut c.net);
            telemetry::Snapshot {
                ts: now,
                apps,
                net,
                focused_exe,
                focused_title,
                finished_focus: finished,
            }
        };

        // 2. Persist (one transaction) and build the live payload.
        let live = {
            let mut conn = state.db.lock().unwrap();
            match db::queries::persist_tick(&mut conn, &snapshot, poll_secs as i64) {
                Ok((ids, focused)) => {
                    Some(telemetry::build_live_snapshot(&snapshot, &ids, focused))
                }
                Err(e) => {
                    eprintln!("persist_tick failed: {e}");
                    None
                }
            }
        };

        // 3. Cache + emit.
        if let Some(live) = live {
            *state.last_snapshot.lock().unwrap() = Some(live.clone());
            let _ = handle.emit("telemetry-update", &live);
        }

        // 4. Daily rollup + prune at UTC midnight rollover.
        let today = util::utc_midnight(now);
        if today != last_day {
            last_day = today;
            let retention = state.config.read().unwrap().raw_retention_days as i64;
            let mut conn = state.db.lock().unwrap();
            if let Err(e) = db::queries::rollup_and_prune(&mut conn, retention, now) {
                eprintln!("daily rollup failed: {e}");
            }
        }
    }
}

pub fn on_window_event(window: &Window, event: &WindowEvent) {
    if let WindowEvent::CloseRequested { api, .. } = event {
        api.prevent_close();
        let _ = window.hide();
    };
}

pub fn on_menu_event(app: &AppHandle, event: MenuEvent) {
    match event.id.as_ref() {
        "quit" => app.exit(0),
        "open" => {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
        _ => {}
    }
}

pub fn on_tray_icon_event(tray: &TrayIcon, event: TrayIconEvent) {
    if let TrayIconEvent::Click {
        button: MouseButton::Left,
        button_state: MouseButtonState::Up,
        ..
    } = event
    {
        let app = tray.app_handle();
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}
