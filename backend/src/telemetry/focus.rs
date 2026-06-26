//! Foreground-window tracking: attribute focus time to the owning exe and to
//! its current window title (e.g. the active browser tab's page title).

use crate::telemetry::FinishedFocus;
use sysinfo::System;

/// The foreground app + window title for a tick.
pub type Foreground = (String, Option<String>);

/// Tracks the focused (exe, title) pair and when the current span began.
#[derive(Debug, Default)]
pub struct FocusTracker {
    current_exe: Option<String>,
    current_title: Option<String>,
    span_start: i64,
}

impl FocusTracker {
    pub fn new() -> Self {
        Self::default()
    }

    /// Feed the current foreground (exe, title). Returns a finished session when
    /// focus moves to a different exe *or* a different window title.
    pub fn update(&mut self, fg: Option<Foreground>, now: i64) -> Option<FinishedFocus> {
        let (exe, title) = match fg {
            Some((e, t)) => (Some(e), t),
            None => (None, None),
        };
        if exe == self.current_exe && title == self.current_title {
            return None;
        }
        let finished = self.current_exe.take().map(|e| FinishedFocus {
            exe_path: e,
            title: self.current_title.take(),
            started_at: self.span_start,
            ended_at: now,
            duration: (now - self.span_start).max(0),
        });
        self.current_exe = exe;
        self.current_title = title;
        self.span_start = now;
        finished
    }
}

/// Resolve the foreground window's owning process to (exe path, window title).
/// Uses the already-refreshed `system` so PID→exe is a consistent snapshot.
#[cfg(windows)]
pub fn foreground_window(system: &System) -> Option<Foreground> {
    use windows::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId,
    };

    let hwnd = unsafe { GetForegroundWindow() };
    if hwnd.0.is_null() {
        return None;
    }
    let mut pid: u32 = 0;
    let tid = unsafe { GetWindowThreadProcessId(hwnd, Some(&mut pid)) };
    if tid == 0 || pid == 0 {
        return None;
    }
    let proc = system.process(sysinfo::Pid::from_u32(pid))?;
    let exe = proc.exe()?.to_string_lossy().into_owned();

    // Window title (the active tab's page title for browsers). Empty → None.
    let title = unsafe {
        let len = GetWindowTextLengthW(hwnd);
        if len > 0 {
            let mut buf = vec![0u16; len as usize + 1];
            let n = GetWindowTextW(hwnd, &mut buf);
            (n > 0).then(|| String::from_utf16_lossy(&buf[..n as usize]))
        } else {
            None
        }
    };

    Some((exe, title))
}

#[cfg(not(windows))]
pub fn foreground_window(_system: &System) -> Option<Foreground> {
    None
}
