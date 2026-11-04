use serde::{Deserialize, Serialize};

pub const SCHEMA_VERSION: u32 = 1;

fn default_true() -> bool {
    true
}

fn default_method() -> String {
    "GET".to_string()
}

fn default_body_type() -> String {
    "none".to_string()
}

fn default_auth_type() -> String {
    "none".to_string()
}

fn default_api_key_location() -> String {
    "header".to_string()
}

fn default_timeout() -> u64 {
    30_000
}

fn default_max_redirects() -> u32 {
    5
}

fn default_max_response() -> u64 {
    10 * 1024 * 1024
}

fn default_history_limit() -> u32 {
    500
}

fn default_theme() -> String {
    "dark".to_string()
}

fn default_split_ratio() -> f64 {
    0.56
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyValue {
    #[serde(default)]
    pub key: String,
    #[serde(default)]
    pub value: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestBody {
    #[serde(default = "default_body_type")]
    pub r#type: String,
    #[serde(default)]
    pub raw: String,
    #[serde(default)]
    pub fields: Vec<KeyValue>,
}

impl Default for RequestBody {
    fn default() -> Self {
        Self {
            r#type: default_body_type(),
            raw: String::new(),
            fields: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Auth {
    #[serde(default = "default_auth_type")]
    pub r#type: String,
    #[serde(default)]
    pub token: String,
    #[serde(default)]
    pub username: String,
    #[serde(default)]
    pub password: String,
    #[serde(default)]
    pub key: String,
    #[serde(default)]
    pub value: String,
    #[serde(default = "default_api_key_location")]
    pub location: String,
}

impl Default for Auth {
    fn default() -> Self {
        Self {
            r#type: default_auth_type(),
            token: String::new(),
            username: String::new(),
            password: String::new(),
            key: String::new(),
            value: String::new(),
            location: default_api_key_location(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestSpec {
    #[serde(default = "default_method")]
    pub method: String,
    #[serde(default)]
    pub url: String,
    #[serde(default)]
    pub params: Vec<KeyValue>,
    #[serde(default)]
    pub headers: Vec<KeyValue>,
    #[serde(default)]
    pub body: RequestBody,
    #[serde(default)]
    pub auth: Auth,
}

impl Default for RequestSpec {
    fn default() -> Self {
        Self {
            method: default_method(),
            url: String::new(),
            params: Vec::new(),
            headers: Vec::new(),
            body: RequestBody::default(),
            auth: Auth::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionItem {
    pub id: String,
    /// "folder" or "request"
    pub kind: String,
    pub name: String,
    #[serde(default)]
    pub parent_id: Option<String>,
    #[serde(default)]
    pub order: i32,
    #[serde(default)]
    pub spec: Option<RequestSpec>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Collection {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub items: Vec<CollectionItem>,
    #[serde(default)]
    pub created_at: i64,
    #[serde(default)]
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Environment {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub variables: Vec<KeyValue>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentsFile {
    #[serde(default = "schema_version")]
    pub schema_version: u32,
    #[serde(default)]
    pub active_id: Option<String>,
    #[serde(default)]
    pub environments: Vec<Environment>,
    #[serde(default)]
    pub globals: Vec<KeyValue>,
}

fn schema_version() -> u32 {
    SCHEMA_VERSION
}

impl Default for EnvironmentsFile {
    fn default() -> Self {
        Self {
            schema_version: SCHEMA_VERSION,
            active_id: None,
            environments: Vec::new(),
            globals: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub id: String,
    pub at: i64,
    #[serde(default)]
    pub name: String,
    pub method: String,
    pub url: String,
    #[serde(default)]
    pub status: Option<u16>,
    #[serde(default)]
    pub duration_ms: u64,
    #[serde(default)]
    pub size_bytes: u64,
    #[serde(default)]
    pub error: Option<String>,
    pub spec: RequestSpec,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryFile {
    #[serde(default = "schema_version")]
    pub schema_version: u32,
    #[serde(default)]
    pub entries: Vec<HistoryEntry>,
}

impl Default for HistoryFile {
    fn default() -> Self {
        Self {
            schema_version: SCHEMA_VERSION,
            entries: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    #[serde(default = "default_timeout")]
    pub timeout_ms: u64,
    #[serde(default = "default_true")]
    pub follow_redirects: bool,
    #[serde(default = "default_max_redirects")]
    pub max_redirects: u32,
    #[serde(default = "default_true")]
    pub verify_tls: bool,
    #[serde(default = "default_max_response")]
    pub max_response_bytes: u64,
    #[serde(default = "default_history_limit")]
    pub history_limit: u32,
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default = "default_split_ratio")]
    pub split_ratio: f64,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            timeout_ms: default_timeout(),
            follow_redirects: true,
            max_redirects: default_max_redirects(),
            verify_tls: true,
            max_response_bytes: default_max_response(),
            history_limit: default_history_limit(),
            theme: default_theme(),
            split_ratio: default_split_ratio(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HeaderPair {
    pub name: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResponseData {
    pub request_id: String,
    pub status: u16,
    pub status_text: String,
    pub headers: Vec<HeaderPair>,
    pub body_text: String,
    pub is_binary: bool,
    pub size_bytes: u64,
    pub truncated: bool,
    pub duration_ms: u64,
    pub final_url: String,
    pub received_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendRequestInput {
    pub request_id: String,
    #[serde(default)]
    pub name: String,
    pub spec: RequestSpec,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InitData {
    pub settings: Settings,
    pub collections: Vec<Collection>,
    pub env: EnvironmentsFile,
    pub history: Vec<HistoryEntry>,
    pub data_dir: String,
    pub version: String,
}
