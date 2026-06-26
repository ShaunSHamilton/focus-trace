use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Error {
    debug: String,
    user: String,
    kind: ErrorKind,
}

#[derive(Debug, Serialize, Deserialize)]
pub enum ErrorKind {
    FS,
    Serialization,
    Tauri,
    Request,
    Database,
    Telemetry,
}

impl Error {
    pub fn new(kind: ErrorKind, debug: String, user: &str) -> Self {
        Self {
            kind,
            debug,
            user: user.to_string(),
        }
    }
}

impl From<tauri::Error> for Error {
    fn from(value: tauri::Error) -> Self {
        Self {
            debug: value.to_string(),
            user: value.to_string(),
            kind: ErrorKind::Tauri,
        }
    }
}

impl From<rusqlite::Error> for Error {
    fn from(value: rusqlite::Error) -> Self {
        Self {
            debug: value.to_string(),
            user: "A database error occurred.".to_string(),
            kind: ErrorKind::Database,
        }
    }
}

#[cfg(windows)]
impl From<windows::core::Error> for Error {
    fn from(value: windows::core::Error) -> Self {
        Self {
            debug: value.to_string(),
            user: "A system call failed.".to_string(),
            kind: ErrorKind::Telemetry,
        }
    }
}

impl Error {
    /// Build a telemetry error from a message (sysinfo returns Options, not Errors).
    pub fn telemetry(debug: impl ToString) -> Self {
        Self::new(ErrorKind::Telemetry, debug.to_string(), "Failed to collect telemetry.")
    }
}

impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{:#?}: {}", self.kind, self.debug)
    }
}

impl std::error::Error for Error {}
