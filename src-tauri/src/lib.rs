mod commands;
mod error;
mod http;
mod models;
mod netdiag;
mod state;
mod storage;

use tauri::Manager;

use state::AppState;
use storage::Store;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            let store = Store::load(data_dir)?;
            app.manage(AppState::new(store));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_init,
            commands::settings_save,
            commands::collection_create,
            commands::collection_save,
            commands::collection_delete,
            commands::environments_save,
            commands::history_list,
            commands::history_delete,
            commands::history_clear,
            commands::request_send,
            commands::request_cancel,
            commands::network_diagnose,
            commands::open_data_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
