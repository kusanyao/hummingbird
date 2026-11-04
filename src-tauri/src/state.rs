use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use reqwest::cookie::Jar;
use tokio_util::sync::CancellationToken;

use crate::storage::Store;

pub struct AppState {
    pub store: Mutex<Store>,
    /// Shared across requests so login cookies behave like a browser session.
    pub cookies: Arc<Jar>,
    pub cancels: Mutex<HashMap<String, CancellationToken>>,
}

impl AppState {
    pub fn new(store: Store) -> Self {
        Self {
            store: Mutex::new(store),
            cookies: Arc::new(Jar::default()),
            cancels: Mutex::new(HashMap::new()),
        }
    }
}
