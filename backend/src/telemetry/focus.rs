//! Foreground-window tracking: attribute focus time to the owning exe and to
//! its current window title (e.g. the active browser tab's page title).

use crate::telemetry::FinishedFocus;
use sysinfo::System;

/// The foreground app, window title, browser profile, and URL for a tick.
pub type Foreground = (String, Option<String>, Option<String>, Option<String>);

/// Raw foreground info before profile resolution: exe, title, owned cmdline, url.
pub type ForegroundRaw = (String, Option<String>, Vec<std::ffi::OsString>, Option<String>);

/// Tracks the focused (exe, title, profile, url) tuple and when the current span began.
#[derive(Debug, Default)]
pub struct FocusTracker {
    current_exe: Option<String>,
    current_title: Option<String>,
    current_profile: Option<String>,
    current_url: Option<String>,
    span_start: i64,
}

impl FocusTracker {
    pub fn new() -> Self {
        Self::default()
    }

    /// Feed the current foreground (exe, title, profile, url). Returns a finished session when
    /// focus moves to a different exe, window title, browser profile, or URL.
    pub fn update(&mut self, fg: Option<Foreground>, now: i64) -> Option<FinishedFocus> {
        let (exe, title, profile, url) = match fg {
            Some((e, t, p, u)) => (Some(e), t, p, u),
            None => (None, None, None, None),
        };
        if exe == self.current_exe
            && title == self.current_title
            && profile == self.current_profile
            && url == self.current_url
        {
            return None;
        }
        let finished = self.current_exe.take().map(|e| FinishedFocus {
            exe_path: e,
            title: self.current_title.take(),
            browser_profile: self.current_profile.take(),
            url: self.current_url.take(),
            started_at: self.span_start,
            ended_at: now,
            duration: (now - self.span_start).max(0),
        });
        self.current_exe = exe;
        self.current_title = title;
        self.current_profile = profile;
        self.current_url = url;
        self.span_start = now;
        finished
    }
}

/// Resolve the foreground window's owning process to (exe, title, owned cmdline).
/// Returns owned data so the caller can release the system borrow before doing
/// further lookups (e.g. browser profile resolution).
#[cfg(windows)]
pub fn foreground_window(system: &System) -> Option<ForegroundRaw> {
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
    let cmd = proc.cmd().to_vec();

    // Window title (the active tab's page title for browsers). Empty -> None.
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

    let url = super::browser::extract_url(&exe, hwnd);

    Some((exe, title, cmd, url))
}

#[cfg(not(windows))]
pub fn foreground_window(_system: &System) -> Option<ForegroundRaw> {
    None
}
