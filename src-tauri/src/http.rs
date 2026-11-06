use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use futures_util::StreamExt;
use reqwest::cookie::Jar;
use reqwest::header::{CONTENT_TYPE, HeaderMap, HeaderName, HeaderValue};
use reqwest::{Client, Method, Url};
use tokio_util::sync::CancellationToken;

use crate::error::AppError;
use crate::models::{HeaderPair, RequestSpec, ResponseData, Settings};
use crate::template::TemplateContext;

/// Executes a request with interpolated variables. Tauri-free so it can be
/// unit tested without a WebView.
pub async fn execute(
    settings: &Settings,
    spec: &RequestSpec,
    base_vars: &HashMap<String, String>,
    cookies: Arc<Jar>,
    cancel: CancellationToken,
) -> Result<ResponseData, AppError> {
    let mut template = TemplateContext::new(base_vars);
    let mut missing: Vec<String> = Vec::new();

    let url_raw = resolve(&mut template, &spec.url, &mut missing);
    let url_raw = url_raw.trim();
    if url_raw.is_empty() {
        return Err(AppError::new("invalid_url", "请先填写请求 URL"));
    }
    let mut url = Url::parse(url_raw).map_err(|err| {
        AppError::with_detail(
            "invalid_url",
            "URL 格式不正确，请检查是否包含 https:// 前缀",
            err.to_string(),
        )
    })?;
    if url.scheme() != "http" && url.scheme() != "https" {
        return Err(AppError::new("invalid_url", "仅支持 http 与 https 协议"));
    }

    for item in enabled(&spec.params) {
        let key = resolve(&mut template, &item.key, &mut missing);
        let value = resolve(&mut template, &item.value, &mut missing);
        if !key.is_empty() {
            url.query_pairs_mut().append_pair(&key, &value);
        }
    }

    let mut headers = HeaderMap::new();
    for item in enabled(&spec.headers) {
        let key = resolve(&mut template, &item.key, &mut missing);
        let value = resolve(&mut template, &item.value, &mut missing);
        if key.is_empty() {
            continue;
        }
        let name = HeaderName::from_bytes(key.as_bytes()).map_err(|err| {
            AppError::with_detail(
                "invalid_header",
                format!("请求头名称不合法：{key}"),
                err.to_string(),
            )
        })?;
        let value = HeaderValue::from_bytes(value.as_bytes()).map_err(|err| {
            AppError::with_detail(
                "invalid_header",
                format!("请求头 {key} 的值不合法（可能包含非 ASCII 字符）"),
                err.to_string(),
            )
        })?;
        headers.append(name, value);
    }

    // API key in query string.
    if spec.auth.r#type == "apiKey" && spec.auth.location == "query" {
        let key = resolve(&mut template, &spec.auth.key, &mut missing);
        let value = resolve(&mut template, &spec.auth.value, &mut missing);
        if !key.is_empty() {
            url.query_pairs_mut().append_pair(&key, &value);
        }
    }

    let body_raw = match spec.body.r#type.as_str() {
        "json" | "text" => Some(resolve(&mut template, &spec.body.raw, &mut missing)),
        _ => None,
    };
    if !missing.is_empty() {
        missing.sort();
        missing.dedup();
        return Err(AppError::with_detail(
            "unresolved_variable",
            format!("变量未定义：{}", missing.join("、")),
            "Define these variables in the active environment or globals.",
        ));
    }

    let method =
        Method::from_bytes(spec.method.trim().to_uppercase().as_bytes()).map_err(|err| {
            AppError::with_detail(
                "invalid_method",
                format!("不支持的请求方法：{}", spec.method),
                err.to_string(),
            )
        })?;

    let has_content_type = headers.contains_key(CONTENT_TYPE);

    let mut client_builder = Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .redirect(if settings.follow_redirects {
            reqwest::redirect::Policy::limited(settings.max_redirects.max(1) as usize)
        } else {
            reqwest::redirect::Policy::none()
        })
        .danger_accept_invalid_certs(!settings.verify_tls)
        .cookie_provider(cookies)
        .user_agent(format!("Hummingbird/{}", env!("CARGO_PKG_VERSION")));
    if settings.timeout_ms > 0 {
        client_builder = client_builder.timeout(Duration::from_millis(settings.timeout_ms));
    }
    let client = client_builder.build().map_err(|err| {
        AppError::with_detail("internal", "创建 HTTP 客户端失败", err.to_string())
    })?;

    let mut request = client.request(method, url.clone()).headers(headers);

    match spec.body.r#type.as_str() {
        "json" => {
            if !has_content_type {
                request = request.header(CONTENT_TYPE, "application/json; charset=utf-8");
            }
            request = request.body(body_raw.unwrap_or_default());
        }
        "text" => {
            if !has_content_type {
                request = request.header(CONTENT_TYPE, "text/plain; charset=utf-8");
            }
            request = request.body(body_raw.unwrap_or_default());
        }
        "formUrlEncoded" => {
            let mut serializer = url::form_urlencoded::Serializer::new(String::new());
            for item in enabled(&spec.body.fields) {
                let key = resolve(&mut template, &item.key, &mut missing);
                let value = resolve(&mut template, &item.value, &mut missing);
                if !key.is_empty() {
                    serializer.append_pair(&key, &value);
                }
            }
            if !has_content_type {
                request = request.header(CONTENT_TYPE, "application/x-www-form-urlencoded");
            }
            request = request.body(serializer.finish());
        }
        "multipart" => {
            let mut form = reqwest::multipart::Form::new();
            for item in enabled(&spec.body.fields) {
                let key = resolve(&mut template, &item.key, &mut missing);
                let value = resolve(&mut template, &item.value, &mut missing);
                if !key.is_empty() {
                    form = form.text(key, value);
                }
            }
            request = request.multipart(form);
        }
        _ => {}
    }

    match spec.auth.r#type.as_str() {
        "bearer" => {
            let token = resolve(&mut template, &spec.auth.token, &mut missing);
            if !token.is_empty() {
                request = request.bearer_auth(token);
            }
        }
        "basic" => {
            let username = resolve(&mut template, &spec.auth.username, &mut missing);
            let password = resolve(&mut template, &spec.auth.password, &mut missing);
            request = request.basic_auth(username, Some(password));
        }
        "apiKey" if spec.auth.location == "header" => {
            let key = resolve(&mut template, &spec.auth.key, &mut missing);
            let value = resolve(&mut template, &spec.auth.value, &mut missing);
            if !key.is_empty() {
                request = request.header(key, value);
            }
        }
        _ => {}
    }

    if !missing.is_empty() {
        missing.sort();
        missing.dedup();
        return Err(AppError::with_detail(
            "unresolved_variable",
            format!("变量未定义：{}", missing.join("、")),
            "Define these variables in the active environment or globals.",
        ));
    }

    let started = Instant::now();
    let response = tokio::select! {
        _ = cancel.cancelled() => return Err(AppError::cancelled()),
        result = request.send() => result.map_err(map_reqwest_error)?,
    };

    let status = response.status();
    let final_url = response.url().to_string();
    let content_type = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("")
        .to_lowercase();
    let header_pairs: Vec<HeaderPair> = response
        .headers()
        .iter()
        .map(|(name, value)| HeaderPair {
            name: name.as_str().to_string(),
            value: String::from_utf8_lossy(value.as_bytes()).to_string(),
        })
        .collect();

    let cap = if settings.max_response_bytes == 0 {
        u64::MAX
    } else {
        settings.max_response_bytes
    };
    let mut buffer: Vec<u8> = Vec::new();
    let mut truncated = false;
    let mut stream = response.bytes_stream();
    loop {
        let next = tokio::select! {
            _ = cancel.cancelled() => return Err(AppError::cancelled()),
            chunk = stream.next() => chunk,
        };
        match next {
            Some(Ok(chunk)) => {
                let remaining = cap.saturating_sub(buffer.len() as u64);
                if chunk.len() as u64 > remaining {
                    buffer.extend_from_slice(&chunk[..remaining as usize]);
                    truncated = true;
                    break;
                }
                buffer.extend_from_slice(&chunk);
            }
            Some(Err(err)) => return Err(map_reqwest_error(err)),
            None => break,
        }
    }

    let duration_ms = started.elapsed().as_millis() as u64;
    let is_binary = looks_binary(&content_type, &buffer);
    let body_text = if is_binary {
        String::new()
    } else {
        String::from_utf8_lossy(&buffer).to_string()
    };

    Ok(ResponseData {
        request_id: String::new(),
        status: status.as_u16(),
        status_text: status.canonical_reason().unwrap_or("").to_string(),
        headers: header_pairs,
        body_text,
        is_binary,
        size_bytes: buffer.len() as u64,
        truncated,
        duration_ms,
        final_url,
        received_at: chrono::Utc::now().timestamp_millis(),
    })
}

fn enabled(
    items: &[crate::models::KeyValue],
) -> impl Iterator<Item = &crate::models::KeyValue> + '_ {
    items.iter().filter(|item| item.enabled)
}

fn resolve(template: &mut TemplateContext, value: &str, missing: &mut Vec<String>) -> String {
    let (output, unresolved) = template.resolve(value);
    missing.extend(unresolved);
    output
}

fn looks_binary(content_type: &str, bytes: &[u8]) -> bool {
    let binary_type = content_type.starts_with("image/")
        || content_type.starts_with("audio/")
        || content_type.starts_with("video/")
        || content_type.contains("octet-stream")
        || content_type.contains("application/pdf")
        || content_type.contains("application/zip")
        || content_type.contains("font/");
    if binary_type {
        return true;
    }
    let textual = content_type.starts_with("text/")
        || content_type.contains("json")
        || content_type.contains("xml")
        || content_type.contains("javascript")
        || content_type.contains("x-www-form-urlencoded");
    if textual {
        return false;
    }
    std::str::from_utf8(bytes).is_err() || bytes.contains(&0)
}

fn map_reqwest_error(err: reqwest::Error) -> AppError {
    let detail = err.to_string();
    let lower = detail.to_lowercase();
    if err.is_timeout() {
        return AppError::with_detail("timeout", "请求超时，请检查网络或调大超时时间", detail);
    }
    if err.is_redirect() {
        return AppError::with_detail("redirect", "重定向次数过多", detail);
    }
    if lower.contains("certificate") || lower.contains("tls") || lower.contains("ssl") {
        return AppError::with_detail(
            "tls",
            "TLS 证书校验失败，可在设置中关闭证书校验后重试",
            detail,
        );
    }
    if err.is_connect() {
        return AppError::with_detail("network", "无法连接到服务器，请检查地址和网络", detail);
    }
    AppError::with_detail("network", "请求失败", detail)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn interpolates_known_variables() {
        let mut vars = HashMap::new();
        vars.insert("base".to_string(), "https://example.com".to_string());
        let mut template = TemplateContext::new(&vars);
        let mut missing = Vec::new();
        let out = resolve(&mut template, "{{base}}/api?x={{n}}", &mut missing);
        assert_eq!(out, "https://example.com/api?x={{n}}");
        assert_eq!(missing, vec!["n".to_string()]);
    }

    #[test]
    fn leaves_unrelated_braces_alone() {
        let mut template = TemplateContext::new(&HashMap::<String, String>::new());
        let mut missing = Vec::new();
        let out = resolve(&mut template, r#"{"a":1}"#, &mut missing);
        assert_eq!(out, r#"{"a":1}"#);
        assert!(missing.is_empty());
    }

    #[test]
    fn binary_detection() {
        assert!(looks_binary("image/png", b"\x89PNG"));
        assert!(!looks_binary("application/json", b"{\"ok\":true}"));
        assert!(!looks_binary("", "纯文本".as_bytes()));
    }

    fn run_against_local_server(
        handler: impl FnOnce(std::net::TcpStream) + Send + 'static,
        spec: RequestSpec,
        settings: Settings,
    ) -> ResponseData {
        use std::net::TcpListener;
        use std::sync::Arc;

        let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
        let addr = listener.local_addr().expect("addr");
        let server = std::thread::spawn(move || {
            let (stream, _) = listener.accept().expect("accept");
            handler(stream);
        });

        let mut spec = spec;
        spec.url = format!("http://{addr}{}", spec.url);
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("runtime");
        let result = runtime.block_on(execute(
            &settings,
            &spec,
            &HashMap::new(),
            Arc::new(Jar::default()),
            CancellationToken::new(),
        ));
        server.join().expect("server");
        result.expect("request should succeed")
    }

    #[test]
    fn performs_real_http_request() {
        use std::io::{Read, Write};

        let response = run_against_local_server(
            |mut stream| {
                let mut buffer = [0u8; 4096];
                let _ = stream.read(&mut buffer);
                let body = r#"{"ok":true}"#;
                let message = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    body.len(),
                    body
                );
                let _ = stream.write_all(message.as_bytes());
            },
            RequestSpec {
                url: "/hello".to_string(),
                ..Default::default()
            },
            Settings {
                timeout_ms: 5_000,
                ..Default::default()
            },
        );

        assert_eq!(response.status, 200);
        assert_eq!(response.body_text, r#"{"ok":true}"#);
        assert!(!response.is_binary);
        assert!(!response.truncated);
    }

    #[test]
    fn truncates_response_over_limit() {
        use std::io::{Read, Write};

        let response = run_against_local_server(
            |mut stream| {
                let mut buffer = [0u8; 4096];
                let _ = stream.read(&mut buffer);
                let body = "x".repeat(500);
                let message = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    body.len(),
                    body
                );
                let _ = stream.write_all(message.as_bytes());
            },
            RequestSpec {
                url: "/big".to_string(),
                ..Default::default()
            },
            Settings {
                max_response_bytes: 100,
                timeout_ms: 5_000,
                ..Default::default()
            },
        );

        assert_eq!(response.status, 200);
        assert!(response.truncated);
        assert_eq!(response.body_text.len(), 100);
    }
}
