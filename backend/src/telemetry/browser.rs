//! Browser profile detection for Chromium-based browsers.

use std::collections::HashMap;
use std::path::PathBuf;

const CHROMIUM_EXES: &[&str] = &["chrome.exe", "msedge.exe", "brave.exe"];

fn local_state_path(exe_name: &str) -> Option<PathBuf> {
    let local_app_data = std::env::var("LOCALAPPDATA").ok()?;
    let subdir = match exe_name {
        "chrome.exe" => "Google\\Chrome\\User Data\\Local State",
        "msedge.exe" => "Microsoft\\Edge\\User Data\\Local State",
        "brave.exe" => "BraveSoftware\\Brave-Browser\\User Data\\Local State",
        _ => return None,
    };
    Some(PathBuf::from(local_app_data).join(subdir))
}

fn parse_local_state(path: &PathBuf) -> Option<HashMap<String, String>> {
    let contents = std::fs::read_to_string(path).ok()?;
    let json: serde_json::Value = serde_json::from_str(&contents).ok()?;
    let cache = json.get("profile")?.get("info_cache")?.as_object()?;
    let mut out = HashMap::new();
    for (dir_name, entry) in cache {
        if let Some(name) = entry.get("name").and_then(|v| v.as_str()) {
            out.insert(dir_name.clone(), name.to_string());
        }
    }
    Some(out)
}

/// Cache of `dirname -> display_name` maps, keyed by browser exe filename.
/// Loaded once on first access; profiles rarely change at runtime.
#[derive(Default)]
pub struct BrowserProfileCache {
    data: HashMap<String, Option<HashMap<String, String>>>,
}

impl BrowserProfileCache {
    fn get_map(&mut self, exe_name: &str) -> Option<&HashMap<String, String>> {
        let entry = self.data.entry(exe_name.to_string()).or_insert_with(|| {
            let path = local_state_path(exe_name)?;
            parse_local_state(&path)
        });
        entry.as_ref()
    }

    /// Force-reload the profile map for a given browser on next access.
    #[allow(dead_code)]
    pub fn invalidate(&mut self, exe_name: &str) {
        self.data.remove(exe_name);
    }
}

/// Read the current URL from a Chromium browser window via Windows UI Automation.
/// Only runs for Chromium exes; returns `None` for everything else or on any failure.
#[cfg(windows)]
pub fn extract_url(exe_path: &str, hwnd: windows::Win32::Foundation::HWND) -> Option<String> {
    let exe_name = std::path::Path::new(exe_path)
        .file_name()?
        .to_str()?
        .to_lowercase();
    if !CHROMIUM_EXES.contains(&exe_name.as_str()) {
        return None;
    }
    unsafe { extract_url_uia(hwnd) }
}

#[cfg(windows)]
unsafe fn extract_url_uia(hwnd: windows::Win32::Foundation::HWND) -> Option<String> {
    use windows::Win32::System::Com::*;
    use windows::Win32::UI::Accessibility::*;
    unsafe {
        let automation: IUIAutomation =
            CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER).ok()?;
        let root = automation.ElementFromHandle(hwnd).ok()?;
        // ControlViewWalker limits traversal to control elements only (not raw/content).
        let walker = automation.ControlViewWalker().ok()?;
        find_url_edit(&walker, &root, 8)
    }
}

/// DFS over the ControlView accessibility tree looking for an Edit control whose
/// value looks like a URL. Chrome's address bar is at depth ~4 from the window root.
/// `depth` caps recursion to avoid traversing unbounded trees.
#[cfg(windows)]
unsafe fn find_url_edit(
    walker: &windows::Win32::UI::Accessibility::IUIAutomationTreeWalker,
    parent: &windows::Win32::UI::Accessibility::IUIAutomationElement,
    depth: u32,
) -> Option<String> {
    use windows::Win32::UI::Accessibility::*;
    use windows::core::Interface;
    unsafe {
        if depth == 0 {
            return None;
        }
        // GetFirstChildElement returns Err when there are no children (null + S_OK).
        let mut current = walker.GetFirstChildElement(parent).ok()?;
        loop {
            if matches!(current.CurrentControlType(), Ok(t) if t == UIA_EditControlTypeId) {
                if let Ok(unk) = current.GetCurrentPattern(UIA_ValuePatternId) {
                    if let Ok(provider) = unk.cast::<IValueProvider>() {
                        if let Ok(val) = provider.Value() {
                            let s = val.to_string();
                            if s.contains('.') || s.starts_with("http") || s.starts_with("about:") {
                                return Some(s);
                            }
                        }
                    }
                }
            }
            if let Some(url) = find_url_edit(walker, &current, depth - 1) {
                return Some(url);
            }
            // GetNextSiblingElement returns Err at end of siblings.
            match walker.GetNextSiblingElement(&current).ok() {
                Some(next) => current = next,
                None => break,
            }
        }
        None
    }
}

/// Extract a profile's display name from a Chromium process cmdline.
/// Returns `None` if the exe is not a Chromium browser or has no `--profile-directory`.
pub fn extract_profile(
    exe_path: &str,
    cmd: &[std::ffi::OsString],
    cache: &mut BrowserProfileCache,
) -> Option<String> {
    let exe_name = std::path::Path::new(exe_path)
        .file_name()?
        .to_str()?
        .to_lowercase();
    let exe_name = exe_name.as_str();

    if !CHROMIUM_EXES.contains(&exe_name) {
        return None;
    }

    let prefix = "--profile-directory=";
    let dir_name = cmd.iter().find_map(|arg| {
        arg.to_str()?.strip_prefix(prefix).map(str::to_string)
    })?;

    // Resolve to display name; fall back to dir_name if not in cache.
    let display = cache
        .get_map(exe_name)
        .and_then(|m| m.get(&dir_name))
        .cloned()
        .unwrap_or_else(|| dir_name.clone());

    Some(display)
}
