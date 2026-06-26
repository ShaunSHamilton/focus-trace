//! Foreground-window tracking: attribute focus time to the owning exe.

use crate::telemetry::FinishedFocus;
use sysinfo::System;

/// Tracks which exe currently holds the foreground and when its span began.
#[derive(Debug, Default)]
pub struct FocusTracker {
    current_exe: Option<String>,
    span_start: i64,
}

impl FocusTracker {
    pub fn new() -> Self {
        Self::default()
    }

    /// Feed the current foreground exe for this tick. Returns a finished session
    /// when focus moves away from the previously-focused exe.
    pub fn update(&mut self, fg_exe: Option<String>, now: i64) -> Option<FinishedFocus> {
        if fg_exe == self.current_exe {
            return None;
        }
        let finished = self.current_exe.take().map(|exe| FinishedFocus {
            exe_path: exe,
            started_at: self.span_start,
            ended_at: now,
            duration: (now - self.span_start).max(0),
        });
        self.current_exe = fg_exe;
        self.span_start = now;
        finished
    }

    /// Exe currently holding focus (if any).
    pub fn current(&self) -> Option<&str> {
        self.current_exe.as_deref()
    }
}

/// Resolve the foreground window's owning process to an exe path.
/// Uses the already-refreshed `system` so PID→exe is a consistent snapshot.
#[cfg(windows)]
pub fn foreground_exe(system: &System) -> Option<String> {
    use windows::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowThreadProcessId,
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
    let exe = proc.exe()?;
    Some(exe.to_string_lossy().into_owned())
}

#[cfg(not(windows))]
pub fn foreground_exe(_system: &System) -> Option<String> {
    None
}
