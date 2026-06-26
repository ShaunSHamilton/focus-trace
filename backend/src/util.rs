use std::time::{SystemTime, UNIX_EPOCH};

/// Current Unix time in whole seconds.
pub fn now_unix() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// UTC midnight (in Unix seconds) of the day containing `ts`.
pub fn utc_midnight(ts: i64) -> i64 {
    ts - ts.rem_euclid(86_400)
}
