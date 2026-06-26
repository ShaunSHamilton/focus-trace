pub mod queries;
pub mod schema;

use crate::error::{Error, ErrorKind};
use rusqlite::Connection;
use std::path::Path;

/// Open the embedded SQLite database: ensure the parent dir exists, apply
/// pragmas, run migrations, and seed config defaults. Returns an open
/// connection to be held behind a `Mutex` in app state.
pub fn init(path: &Path) -> Result<Connection, Error> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| {
            Error::new(
                ErrorKind::FS,
                e.to_string(),
                "Could not create the data directory.",
            )
        })?;
    }
    let conn = Connection::open(path)?;
    conn.execute_batch(schema::PRAGMAS)?;
    schema::migrate(&conn)?;
    queries::seed_config_defaults(&conn)?;
    Ok(conn)
}
