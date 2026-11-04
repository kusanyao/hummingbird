use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::thread::sleep;
use std::time::Duration;

use serde::Serialize;
use serde::de::DeserializeOwned;

use crate::error::AppError;
use crate::models::{
    Collection, EnvironmentsFile, HistoryEntry, HistoryFile, SCHEMA_VERSION, Settings,
};

/// All persisted state lives in a handful of human-readable JSON files:
///
/// ```text
/// %APPDATA%\dev.hummingbird.app\
///   settings.json
///   environments.json
///   history.json
///   collections\<id>.json
///   backups\<date>\
/// ```
///
/// Writes are atomic (temp file + rename, keeping a `.bak`), so a crash during
/// save cannot truncate user data.
pub struct Store {
    pub dir: PathBuf,
    pub settings: Settings,
    pub env: EnvironmentsFile,
    pub collections: Vec<Collection>,
    pub history: Vec<HistoryEntry>,
}

impl Store {
    pub fn load(dir: PathBuf) -> Result<Self, AppError> {
        fs::create_dir_all(&dir)?;
        fs::create_dir_all(dir.join("collections"))?;
        fs::create_dir_all(dir.join("backups"))?;

        let settings = read_json_or_default(&dir.join("settings.json"))?;
        let env = read_json_or_default(&dir.join("environments.json"))?;
        let history_file: HistoryFile = read_json_or_default(&dir.join("history.json"))?;
        let collections = load_collections(&dir)?;

        let store = Self {
            dir,
            settings,
            env,
            collections,
            history: history_file.entries,
        };
        store.backup_if_needed();
        Ok(store)
    }

    pub fn collections_dir(&self) -> PathBuf {
        self.dir.join("collections")
    }

    pub fn save_settings(&self) -> Result<(), AppError> {
        write_json(&self.dir.join("settings.json"), &self.settings)
    }

    pub fn save_env(&self) -> Result<(), AppError> {
        write_json(&self.dir.join("environments.json"), &self.env)
    }

    pub fn save_history(&self) -> Result<(), AppError> {
        let file = HistoryFile {
            schema_version: SCHEMA_VERSION,
            entries: self.history.clone(),
        };
        write_json(&self.dir.join("history.json"), &file)
    }

    pub fn save_collection(&self, collection: &Collection) -> Result<(), AppError> {
        let path = self
            .collections_dir()
            .join(format!("{}.json", collection.id));
        write_json(&path, collection)
    }

    pub fn delete_collection_file(&self, id: &str) -> Result<(), AppError> {
        let path = self.collections_dir().join(format!("{id}.json"));
        if path.exists() {
            fs::remove_file(&path)?;
        }
        Ok(())
    }

    pub fn append_history(&mut self, entry: HistoryEntry, limit: u32) -> Result<(), AppError> {
        self.history.insert(0, entry);
        let keep = limit.max(1) as usize;
        self.history.truncate(keep);
        self.save_history()
    }

    /// Enabled global variables overlaid by enabled active-environment
    /// variables (environment wins, matching Postman semantics).
    pub fn resolve_variables(&self) -> HashMap<String, String> {
        let mut vars = HashMap::new();
        for item in self
            .env
            .globals
            .iter()
            .filter(|v| v.enabled && !v.key.is_empty())
        {
            vars.insert(item.key.clone(), item.value.clone());
        }
        if let Some(active_id) = &self.env.active_id {
            if let Some(env) = self.env.environments.iter().find(|e| &e.id == active_id) {
                for item in env
                    .variables
                    .iter()
                    .filter(|v| v.enabled && !v.key.is_empty())
                {
                    vars.insert(item.key.clone(), item.value.clone());
                }
            }
        }
        vars
    }

    /// Best-effort daily snapshot of the data directory.
    fn backup_if_needed(&self) {
        let date = chrono::Local::now().format("%Y-%m-%d").to_string();
        let target = self.dir.join("backups").join(date);
        if target.exists() {
            return;
        }
        let _ = fs::create_dir_all(&target);
        let files = ["settings.json", "environments.json", "history.json"];
        for name in files {
            let src = self.dir.join(name);
            if src.exists() {
                let _ = fs::copy(&src, target.join(name));
            }
        }
        let collections_backup = target.join("collections");
        let _ = fs::create_dir_all(&collections_backup);
        if let Ok(entries) = fs::read_dir(self.collections_dir()) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|e| e.to_str()) == Some("json") {
                    if let Some(name) = path.file_name() {
                        let _ = fs::copy(&path, collections_backup.join(name));
                    }
                }
            }
        }
        prune_backups(&self.dir.join("backups"), 10);
    }
}

fn load_collections(dir: &Path) -> Result<Vec<Collection>, AppError> {
    let mut collections = Vec::new();
    let cdir = dir.join("collections");
    if let Ok(entries) = fs::read_dir(&cdir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("json") {
                continue;
            }
            if let Some(collection) = read_json_opt::<Collection>(&path)? {
                collections.push(collection);
            }
        }
    }
    collections.sort_by(|a, b| a.created_at.cmp(&b.created_at));
    Ok(collections)
}

fn prune_backups(dir: &Path, keep: usize) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    let mut dirs: Vec<PathBuf> = entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.is_dir())
        .collect();
    dirs.sort();
    while dirs.len() > keep {
        let oldest = dirs.remove(0);
        let _ = fs::remove_dir_all(oldest);
    }
}

fn read_json_or_default<T>(path: &Path) -> Result<T, AppError>
where
    T: DeserializeOwned + Default,
{
    Ok(read_json_opt::<T>(path)?.unwrap_or_default())
}

/// Reads a JSON file, falling back to its `.bak` sibling if the primary file
/// is unreadable. Never silently discards an unparseable file: the caller gets
/// a `corrupt_data` error instead so the user can inspect the backups.
fn read_json_opt<T: DeserializeOwned>(path: &Path) -> Result<Option<T>, AppError> {
    if !path.exists() {
        return Ok(None);
    }
    match fs::read_to_string(path) {
        Ok(text) => match serde_json::from_str::<T>(&text) {
            Ok(value) => Ok(Some(value)),
            Err(primary_err) => {
                let bak = backup_path(path);
                if let Ok(bak_text) = fs::read_to_string(&bak) {
                    if let Ok(value) = serde_json::from_str::<T>(&bak_text) {
                        return Ok(Some(value));
                    }
                }
                Err(AppError::corrupt(
                    format!("无法读取本地数据：{}", path.display()),
                    primary_err.to_string(),
                ))
            }
        },
        Err(err) => Err(AppError::io(
            format!("读取文件失败：{}", path.display()),
            err.to_string(),
        )),
    }
}

fn backup_path(path: &Path) -> PathBuf {
    path.with_extension("bak")
}

fn temp_path(path: &Path) -> PathBuf {
    path.with_extension("tmp")
}

fn write_json<T: Serialize>(path: &Path, value: &T) -> Result<(), AppError> {
    let bytes = serde_json::to_vec_pretty(value)?;
    atomic_write(path, &bytes)
}

/// Write via a temp file, keep the previous version as `.bak`, then rename.
/// Retries briefly because antivirus scanners can hold the destination open
/// on Windows.
fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), AppError> {
    let tmp = temp_path(path);
    {
        let mut file = fs::File::create(&tmp)?;
        file.write_all(bytes)?;
        file.sync_all()?;
    }
    if path.exists() {
        let _ = fs::copy(path, backup_path(path));
    }
    let mut last_err = None;
    for attempt in 0..4 {
        match fs::rename(&tmp, path) {
            Ok(()) => return Ok(()),
            Err(err) => {
                last_err = Some(err);
                if attempt < 3 {
                    sleep(Duration::from_millis(60));
                }
            }
        }
    }
    let detail = last_err
        .map(|e| e.to_string())
        .unwrap_or_else(|| "unknown error".to_string());
    Err(AppError::io(
        format!("保存失败：{}", path.display()),
        detail,
    ))
}
