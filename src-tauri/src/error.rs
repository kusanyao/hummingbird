use serde::Serialize;

/// Error surfaced to the UI. `message` is user-facing Chinese, `detail`
/// carries the technical chain for the collapsible "technical details" area.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppError {
    pub kind: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

impl AppError {
    pub fn new(kind: &str, message: impl Into<String>) -> Self {
        Self {
            kind: kind.to_string(),
            message: message.into(),
            detail: None,
        }
    }

    pub fn with_detail(kind: &str, message: impl Into<String>, detail: impl Into<String>) -> Self {
        Self {
            kind: kind.to_string(),
            message: message.into(),
            detail: Some(detail.into()),
        }
    }

    pub fn io(message: impl Into<String>, detail: impl Into<String>) -> Self {
        Self::with_detail("io", message, detail)
    }

    pub fn corrupt(message: impl Into<String>, detail: impl Into<String>) -> Self {
        Self::with_detail("corrupt_data", message, detail)
    }

    pub fn cancelled() -> Self {
        Self::new("cancelled", "请求已取消")
    }
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for AppError {}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        Self::io("本地数据读写失败", err.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(err: serde_json::Error) -> Self {
        Self::corrupt("本地数据格式损坏", err.to_string())
    }
}
