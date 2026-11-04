use std::sync::MutexGuard;

use tauri::State;

use crate::error::AppError;
use crate::models::{
    Collection, EnvironmentsFile, HistoryEntry, InitData, ResponseData, SCHEMA_VERSION,
    SendRequestInput, Settings,
};
use crate::state::AppState;
use crate::storage::Store;

fn store_lock<'a>(state: &'a State<'_, AppState>) -> Result<MutexGuard<'a, Store>, AppError> {
    state
        .store
        .lock()
        .map_err(|_| AppError::new("internal", "本地数据状态异常，请重启应用"))
}

#[tauri::command]
pub fn app_init(state: State<'_, AppState>) -> Result<InitData, AppError> {
    let store = store_lock(&state)?;
    Ok(InitData {
        settings: store.settings.clone(),
        collections: store.collections.clone(),
        env: store.env.clone(),
        history: store.history.iter().take(50).cloned().collect(),
        data_dir: store.dir.display().to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    })
}

#[tauri::command]
pub fn settings_save(state: State<'_, AppState>, settings: Settings) -> Result<Settings, AppError> {
    let mut store = store_lock(&state)?;
    store.settings = settings.clone();
    store.save_settings()?;
    Ok(settings)
}

#[tauri::command]
pub fn collection_create(state: State<'_, AppState>, name: String) -> Result<Collection, AppError> {
    let now = chrono::Utc::now().timestamp_millis();
    let name = name.trim().to_string();
    let collection = Collection {
        id: uuid::Uuid::new_v4().to_string(),
        name: if name.is_empty() {
            "未命名集合".to_string()
        } else {
            name
        },
        items: Vec::new(),
        created_at: now,
        updated_at: now,
    };
    let mut store = store_lock(&state)?;
    store.collections.push(collection.clone());
    store.save_collection(&collection)?;
    Ok(collection)
}

#[tauri::command]
pub fn collection_save(
    state: State<'_, AppState>,
    mut collection: Collection,
) -> Result<Collection, AppError> {
    let mut store = store_lock(&state)?;
    collection.updated_at = chrono::Utc::now().timestamp_millis();
    match store
        .collections
        .iter_mut()
        .find(|existing| existing.id == collection.id)
    {
        Some(existing) => *existing = collection.clone(),
        None => store.collections.push(collection.clone()),
    }
    store.save_collection(&collection)?;
    Ok(collection)
}

#[tauri::command]
pub fn collection_delete(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
    let mut store = store_lock(&state)?;
    store.collections.retain(|collection| collection.id != id);
    store.delete_collection_file(&id)?;
    Ok(())
}

#[tauri::command]
pub fn environments_save(
    state: State<'_, AppState>,
    mut env: EnvironmentsFile,
) -> Result<EnvironmentsFile, AppError> {
    env.schema_version = SCHEMA_VERSION;
    if let Some(active_id) = &env.active_id {
        if !env.environments.iter().any(|item| &item.id == active_id) {
            env.active_id = None;
        }
    }
    let mut store = store_lock(&state)?;
    store.env = env.clone();
    store.save_env()?;
    Ok(env)
}

#[tauri::command]
pub fn history_list(state: State<'_, AppState>, limit: u32) -> Result<Vec<HistoryEntry>, AppError> {
    let store = store_lock(&state)?;
    Ok(store
        .history
        .iter()
        .take(limit.max(1) as usize)
        .cloned()
        .collect())
}

#[tauri::command]
pub fn history_delete(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
    let mut store = store_lock(&state)?;
    store.history.retain(|entry| entry.id != id);
    store.save_history()?;
    Ok(())
}

#[tauri::command]
pub fn history_clear(state: State<'_, AppState>) -> Result<(), AppError> {
    let mut store = store_lock(&state)?;
    store.history.clear();
    store.save_history()?;
    Ok(())
}

#[tauri::command]
pub async fn request_send(
    state: State<'_, AppState>,
    input: SendRequestInput,
) -> Result<ResponseData, AppError> {
    let (settings, variables, history_limit) = {
        let store = store_lock(&state)?;
        (
            store.settings.clone(),
            store.resolve_variables(),
            store.settings.history_limit,
        )
    };

    let cancel = tokio_util::sync::CancellationToken::new();
    {
        let mut cancels = state
            .cancels
            .lock()
            .map_err(|_| AppError::new("internal", "取消状态异常"))?;
        cancels.insert(input.request_id.clone(), cancel.clone());
    }

    let mut result = crate::http::execute(
        &settings,
        &input.spec,
        &variables,
        state.cookies.clone(),
        cancel,
    )
    .await;

    if let Ok(mut cancels) = state.cancels.lock() {
        cancels.remove(&input.request_id);
    }

    if let Ok(response) = result.as_mut() {
        response.request_id = input.request_id.clone();
        let entry = HistoryEntry {
            id: uuid::Uuid::new_v4().to_string(),
            at: chrono::Utc::now().timestamp_millis(),
            name: if input.name.trim().is_empty() {
                spec_label(&input.spec.url)
            } else {
                input.name.trim().to_string()
            },
            method: input.spec.method.clone(),
            url: response.final_url.clone(),
            status: Some(response.status),
            duration_ms: response.duration_ms,
            size_bytes: response.size_bytes,
            error: None,
            spec: input.spec.clone(),
        };
        {
            let mut store = store_lock(&state)?;
            store.append_history(entry, history_limit)?;
        }
    }

    result
}

fn spec_label(url: &str) -> String {
    if url.is_empty() {
        "未命名请求".to_string()
    } else {
        url.to_string()
    }
}

#[tauri::command]
pub fn request_cancel(state: State<'_, AppState>, request_id: String) -> Result<(), AppError> {
    let cancels = state
        .cancels
        .lock()
        .map_err(|_| AppError::new("internal", "取消状态异常"))?;
    if let Some(token) = cancels.get(&request_id) {
        token.cancel();
    }
    Ok(())
}

#[tauri::command]
pub async fn network_diagnose(
    target: String,
    proxy: Option<String>,
) -> Result<crate::netdiag::DiagnoseReport, AppError> {
    crate::netdiag::diagnose(target, proxy).await
}

#[tauri::command]
pub fn open_data_dir(state: State<'_, AppState>) -> Result<(), AppError> {
    let dir = store_lock(&state)?.dir.clone();
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&dir)
            .spawn()
            .map_err(|err| AppError::io("无法打开数据目录", err.to_string()))?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = dir;
    }
    Ok(())
}
