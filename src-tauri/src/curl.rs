use std::collections::HashMap;

use serde::Serialize;
use url::Url;

use crate::error::AppError;
use crate::models::{Auth, KeyValue, RequestBody, RequestSpec};
use crate::template::TemplateContext;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CurlImport {
    pub spec: RequestSpec,
    pub warnings: Vec<String>,
}

fn empty_kv() -> KeyValue {
    KeyValue {
        key: String::new(),
        value: String::new(),
        enabled: true,
    }
}

fn kv(key: impl Into<String>, value: impl Into<String>) -> KeyValue {
    KeyValue {
        key: key.into(),
        value: value.into(),
        enabled: true,
    }
}

fn enabled_rows(rows: &[KeyValue]) -> impl Iterator<Item = &KeyValue> {
    rows.iter()
        .filter(|row| row.enabled && !row.key.trim().is_empty())
}

fn tokenize(input: &str) -> Result<Vec<String>, AppError> {
    let normalized = input.replace("\r\n", "\n");
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut started = false;
    let mut chars = normalized.chars().peekable();
    let mut in_single = false;
    let mut in_double = false;

    while let Some(ch) = chars.next() {
        if in_single {
            if ch == '\'' {
                in_single = false;
            } else {
                current.push(ch);
            }
            started = true;
            continue;
        }

        if in_double {
            if ch == '"' {
                in_double = false;
                started = true;
                continue;
            }
            if ch == '\\' {
                match chars.next() {
                    Some('"') => current.push('"'),
                    Some('\\') => current.push('\\'),
                    Some('$') => current.push('$'),
                    Some('`') => current.push('`'),
                    Some('\n') => {}
                    Some(other) => {
                        current.push('\\');
                        current.push(other);
                    }
                    None => current.push('\\'),
                }
                started = true;
                continue;
            }
            current.push(ch);
            started = true;
            continue;
        }

        match ch {
            ' ' | '\t' | '\n' => {
                if started {
                    tokens.push(current.clone());
                    current.clear();
                    started = false;
                }
            }
            '\'' => {
                in_single = true;
                started = true;
            }
            '"' => {
                in_double = true;
                started = true;
            }
            '\\' => match chars.next() {
                Some('\n') => {}
                Some(other) => {
                    current.push(other);
                    started = true;
                }
                None => {}
            },
            '^' => {
                if chars.peek() == Some(&'\n') {
                    chars.next();
                } else {
                    current.push('^');
                    started = true;
                }
            }
            _ => {
                current.push(ch);
                started = true;
            }
        }
    }

    if in_single || in_double {
        return Err(AppError::new("invalid_curl", "cURL 命令中的引号没有闭合"));
    }
    if started {
        tokens.push(current);
    }
    Ok(tokens)
}

fn short_takes_value(flag: &str) -> bool {
    matches!(
        flag,
        "-X" | "-H"
            | "-d"
            | "-F"
            | "-u"
            | "-A"
            | "-b"
            | "-e"
            | "-m"
            | "-o"
            | "-w"
            | "-x"
            | "-T"
            | "-D"
            | "-E"
            | "-U"
            | "-y"
            | "-Y"
    )
}

fn split_flag(token: &str) -> (String, Option<String>) {
    if token.starts_with("--") {
        if let Some((flag, value)) = token.split_once('=') {
            return (flag.to_string(), Some(value.to_string()));
        }
        return (token.to_string(), None);
    }
    if token.starts_with('-') && token.len() > 2 {
        let (short, rest) = token.split_at(2);
        if short_takes_value(short) {
            return (short.to_string(), Some(rest.to_string()));
        }
    }
    (token.to_string(), None)
}

fn takes_value(flag: &str) -> bool {
    matches!(
        flag,
        "-X" | "--request"
            | "-H"
            | "--header"
            | "-d"
            | "--data"
            | "--data-raw"
            | "--data-binary"
            | "--data-ascii"
            | "--data-urlencode"
            | "-F"
            | "--form"
            | "--form-string"
            | "-u"
            | "--user"
            | "-A"
            | "--user-agent"
            | "-b"
            | "--cookie"
            | "-e"
            | "--referer"
            | "--url"
            | "--oauth2-bearer"
            | "--json"
            | "-m"
            | "--max-time"
            | "--connect-timeout"
            | "--retry"
            | "--retry-delay"
            | "--retry-max-time"
            | "-o"
            | "--output"
            | "-w"
            | "--write-out"
            | "--proxy"
            | "-x"
            | "--cacert"
            | "--cert"
            | "--key"
            | "-T"
            | "--upload-file"
            | "--resolve"
            | "--interface"
            | "--limit-rate"
            | "--max-redirs"
            | "--proto"
            | "--ciphers"
            | "--tlsv1.0"
            | "--tlsv1.1"
            | "--tlsv1.2"
            | "--tlsv1.3"
            | "--keepalive-time"
            | "-D"
            | "--dump-header"
            | "--header-file"
            | "-E"
            | "--cert-type"
            | "--key-type"
            | "--pass"
            | "--netrc-file"
            | "--unix-socket"
            | "--abstract-unix-socket"
            | "--dns-servers"
            | "--doh-url"
            | "--noproxy"
            | "--proxy-user"
            | "-U"
            | "--proxy-header"
            | "--ftp-method"
            | "--ftp-account"
            | "--ftp-alternative-to-user"
            | "--max-filesize"
            | "--speed-limit"
            | "--speed-time"
            | "--local-port"
            | "--happy-eyeballs-timeout-ms"
            | "--expect100-timeout"
            | "--stderr"
            | "--trace"
            | "--trace-ascii"
            | "--trace-time"
    )
}

fn is_boolean(flag: &str) -> bool {
    matches!(
        flag,
        "-s" | "--silent"
            | "-S"
            | "--show-error"
            | "-v"
            | "--verbose"
            | "-i"
            | "--include"
            | "-L"
            | "--location"
            | "--location-trusted"
            | "-k"
            | "--insecure"
            | "--compressed"
            | "-g"
            | "--globoff"
            | "-f"
            | "--fail"
            | "--fail-with-body"
            | "-N"
            | "--no-buffer"
            | "-4"
            | "-6"
            | "--http1.0"
            | "--http1.1"
            | "--http2"
            | "--http2-prior-knowledge"
            | "--tcp-nodelay"
            | "--no-keepalive"
            | "--tcp-fastopen"
            | "--raw"
            | "-q"
            | "--disable"
            | "-G"
            | "--get"
            | "-I"
            | "--head"
    )
}

fn parse_header(value: &str) -> Option<(String, String)> {
    let (key, value) = value.split_once(':')?;
    let key = key.trim();
    if key.is_empty() {
        return None;
    }
    Some((key.to_string(), value.trim().to_string()))
}

fn parse_pair(value: &str) -> Option<(String, String)> {
    let (key, value) = value.split_once('=')?;
    if key.is_empty() {
        return None;
    }
    Some((key.to_string(), value.to_string()))
}

fn normalize_url(input: &str) -> Result<Url, AppError> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err(AppError::new("invalid_curl", "没有找到请求 URL"));
    }
    let candidate = if trimmed.contains("://") {
        trimmed.to_string()
    } else if trimmed.starts_with("localhost")
        || trimmed.starts_with("127.0.0.1")
        || trimmed.starts_with("[::1]")
    {
        format!("http://{trimmed}")
    } else {
        format!("https://{trimmed}")
    };
    let url = Url::parse(&candidate)
        .map_err(|err| AppError::with_detail("invalid_curl", "URL 格式不正确", err.to_string()))?;
    if url.scheme() != "http" && url.scheme() != "https" {
        return Err(AppError::new("invalid_curl", "仅支持 http / https 请求"));
    }
    Ok(url)
}

fn form_fields(parts: &[String]) -> Option<Vec<KeyValue>> {
    let mut fields = Vec::new();
    for part in parts {
        for chunk in part.split('&') {
            if chunk.is_empty() {
                continue;
            }
            let (key, value) = parse_pair(chunk)?;
            fields.push(kv(key, value));
        }
    }
    if fields.is_empty() {
        None
    } else {
        Some(fields)
    }
}

pub fn parse(input: &str) -> Result<CurlImport, AppError> {
    let tokens = tokenize(input)?;
    if tokens.is_empty() {
        return Err(AppError::new("invalid_curl", "请粘贴 curl 命令"));
    }

    let mut index = 0;
    let first = tokens[0].to_ascii_lowercase();
    if first == "curl" || first.ends_with("curl.exe") {
        index = 1;
    }

    let mut method: Option<String> = None;
    let mut url_raw: Option<String> = None;
    let mut headers: Vec<KeyValue> = Vec::new();
    let mut data_parts: Vec<String> = Vec::new();
    let mut form_parts: Vec<KeyValue> = Vec::new();
    let mut json_mode = false;
    let mut get_mode = false;
    let mut basic: Option<(String, String)> = None;
    let mut bearer: Option<String> = None;
    let mut warnings: Vec<String> = Vec::new();

    while index < tokens.len() {
        let token = tokens[index].clone();
        if !token.starts_with('-') || token == "-" {
            if url_raw.is_none() {
                url_raw = Some(token);
            }
            index += 1;
            continue;
        }

        let (flag, inline) = split_flag(&token);
        let take_value = |current: &mut usize| -> Option<String> {
            if let Some(value) = &inline {
                return Some(value.clone());
            }
            if *current + 1 < tokens.len() {
                *current += 1;
                Some(tokens[*current].clone())
            } else {
                None
            }
        };

        match flag.as_str() {
            "-X" | "--request" => {
                if let Some(value) = take_value(&mut index) {
                    method = Some(value.trim().to_uppercase());
                }
            }
            "-H" | "--header" => {
                if let Some(value) = take_value(&mut index) {
                    match parse_header(&value) {
                        Some((key, value)) => headers.push(kv(key, value)),
                        None => warnings.push(format!("忽略无效请求头：{value}")),
                    }
                }
            }
            "-d" | "--data" | "--data-raw" | "--data-ascii" => {
                if let Some(value) = take_value(&mut index) {
                    if value.starts_with('@') {
                        warnings.push("不支持从文件读取请求体，已忽略".to_string());
                    } else {
                        data_parts.push(value);
                    }
                }
            }
            "--data-binary" | "--data-urlencode" => {
                if let Some(value) = take_value(&mut index) {
                    if value.starts_with('@') || value.contains("@/") {
                        warnings.push("不支持从文件读取请求体，已忽略".to_string());
                    } else {
                        data_parts.push(value);
                    }
                }
            }
            "--json" => {
                if let Some(value) = take_value(&mut index) {
                    json_mode = true;
                    data_parts.push(value);
                }
            }
            "-F" | "--form" | "--form-string" => {
                if let Some(value) = take_value(&mut index) {
                    if value.contains("@") {
                        warnings.push("暂不支持 multipart 文件上传，已忽略该字段".to_string());
                    } else if let Some((key, value)) = parse_pair(&value) {
                        form_parts.push(kv(key, value));
                    } else {
                        warnings.push(format!("忽略无效表单字段：{value}"));
                    }
                }
            }
            "-u" | "--user" => {
                if let Some(value) = take_value(&mut index) {
                    match value.split_once(':') {
                        Some((user, pass)) => basic = Some((user.to_string(), pass.to_string())),
                        None => basic = Some((value, String::new())),
                    }
                }
            }
            "--oauth2-bearer" => {
                if let Some(value) = take_value(&mut index) {
                    bearer = Some(value);
                }
            }
            "-A" | "--user-agent" => {
                if let Some(value) = take_value(&mut index) {
                    headers.push(kv("User-Agent", value));
                }
            }
            "-b" | "--cookie" => {
                if let Some(value) = take_value(&mut index) {
                    headers.push(kv("Cookie", value));
                }
            }
            "-e" | "--referer" => {
                if let Some(value) = take_value(&mut index) {
                    headers.push(kv("Referer", value));
                }
            }
            "--url" => {
                if let Some(value) = take_value(&mut index) {
                    url_raw = Some(value);
                }
            }
            "-G" | "--get" => get_mode = true,
            "-I" | "--head" => method = Some("HEAD".to_string()),
            _ if takes_value(&flag) => {
                let _ = take_value(&mut index);
                warnings.push(format!("已忽略参数 {flag}"));
            }
            _ if is_boolean(&flag) => {}
            _ => warnings.push(format!("已忽略未知参数 {flag}")),
        }
        index += 1;
    }

    let url_raw = url_raw.ok_or_else(|| AppError::new("invalid_curl", "没有找到请求 URL"))?;
    let mut url = normalize_url(&url_raw)?;

    let mut params: Vec<KeyValue> = url
        .query_pairs()
        .map(|(key, value)| kv(key.to_string(), value.to_string()))
        .collect();
    url.set_query(None);

    if get_mode {
        for part in &data_parts {
            for chunk in part.split('&') {
                if chunk.is_empty() {
                    continue;
                }
                match parse_pair(chunk) {
                    Some((key, value)) => params.push(kv(key, value)),
                    None => warnings.push(format!("忽略无法转换为查询参数的内容：{chunk}")),
                }
            }
        }
    }

    let content_type = headers
        .iter()
        .find(|header| header.key.eq_ignore_ascii_case("content-type"))
        .map(|header| header.value.to_ascii_lowercase())
        .unwrap_or_default();

    let has_form = !form_parts.is_empty();
    let mut body = RequestBody::default();
    if has_form {
        body.r#type = "multipart".to_string();
        body.fields = form_parts;
    } else if !data_parts.is_empty() && !get_mode {
        let joined = data_parts.join("&");
        let trimmed = joined.trim();
        let looks_json = json_mode
            || trimmed.starts_with('{')
            || trimmed.starts_with('[')
            || content_type.contains("json");
        if looks_json {
            body.r#type = "json".to_string();
            body.raw = joined;
        } else if let Some(fields) = form_fields(&data_parts) {
            body.r#type = "formUrlEncoded".to_string();
            body.fields = fields;
        } else {
            body.r#type = "text".to_string();
            body.raw = joined;
        }
    }

    let method = method.unwrap_or_else(|| {
        if get_mode {
            "GET".to_string()
        } else if !data_parts.is_empty() || has_form {
            "POST".to_string()
        } else {
            "GET".to_string()
        }
    });

    let mut auth = Auth::default();
    if let Some((user, pass)) = basic {
        auth.r#type = "basic".to_string();
        auth.username = user;
        auth.password = pass;
        if bearer.is_some() {
            warnings.push("同时存在 Basic 与 Bearer 认证，已优先使用 Basic".to_string());
        }
    } else if let Some(token) = bearer {
        auth.r#type = "bearer".to_string();
        auth.token = token;
    }

    let mut spec = RequestSpec {
        method,
        url: url.to_string(),
        params,
        headers,
        body,
        auth,
    };
    if spec.params.is_empty() {
        spec.params.push(empty_kv());
    }
    if spec.headers.is_empty() {
        spec.headers.push(empty_kv());
    }
    if spec.body.fields.is_empty() {
        spec.body.fields.push(empty_kv());
    }

    Ok(CurlImport { spec, warnings })
}

fn interp(template: &mut TemplateContext, value: &str) -> String {
    template.resolve(value).0
}

fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

fn build_url(spec: &RequestSpec, template: &mut TemplateContext) -> Result<String, AppError> {
    let raw = interp(template, &spec.url);
    let mut url = normalize_url(&raw)?;
    for param in enabled_rows(&spec.params) {
        let key = interp(template, &param.key);
        let value = interp(template, &param.value);
        url.query_pairs_mut().append_pair(&key, &value);
    }
    if spec.auth.r#type == "apiKey" && spec.auth.location == "query" {
        let key = interp(template, &spec.auth.key);
        let value = interp(template, &spec.auth.value);
        if !key.is_empty() {
            url.query_pairs_mut().append_pair(&key, &value);
        }
    }
    Ok(url.to_string())
}

pub fn export(spec: &RequestSpec, base_vars: &HashMap<String, String>) -> Result<String, AppError> {
    let mut template = TemplateContext::new(base_vars);
    let url = build_url(spec, &mut template)?;
    let method = spec.method.to_uppercase();
    let mut parts: Vec<String> = vec!["curl".to_string()];

    let has_body = match spec.body.r#type.as_str() {
        "json" | "text" => !spec.body.raw.trim().is_empty(),
        "formUrlEncoded" | "multipart" => enabled_rows(&spec.body.fields).next().is_some(),
        _ => false,
    };

    if method == "HEAD" {
        parts.push("-I".to_string());
    } else if method != "GET" || has_body {
        parts.push("-X".to_string());
        parts.push(method);
    }
    parts.push(shell_quote(&url));

    for header in enabled_rows(&spec.headers) {
        let key = interp(&mut template, &header.key);
        let value = interp(&mut template, &header.value);
        parts.push("-H".to_string());
        parts.push(shell_quote(&format!("{key}: {value}")));
    }

    match spec.auth.r#type.as_str() {
        "bearer" => {
            let token = interp(&mut template, &spec.auth.token);
            if !token.is_empty() {
                parts.push("-H".to_string());
                parts.push(shell_quote(&format!("Authorization: Bearer {token}")));
            }
        }
        "basic" => {
            let username = interp(&mut template, &spec.auth.username);
            let password = interp(&mut template, &spec.auth.password);
            parts.push("-u".to_string());
            parts.push(shell_quote(&format!("{username}:{password}")));
        }
        "apiKey" if spec.auth.location == "header" => {
            let key = interp(&mut template, &spec.auth.key);
            let value = interp(&mut template, &spec.auth.value);
            if !key.is_empty() {
                parts.push("-H".to_string());
                parts.push(shell_quote(&format!("{key}: {value}")));
            }
        }
        _ => {}
    }

    match spec.body.r#type.as_str() {
        "json" | "text" => {
            let raw = interp(&mut template, &spec.body.raw);
            if !raw.is_empty() {
                parts.push("--data-raw".to_string());
                parts.push(shell_quote(&raw));
            }
        }
        "formUrlEncoded" => {
            for field in enabled_rows(&spec.body.fields) {
                let key = interp(&mut template, &field.key);
                let value = interp(&mut template, &field.value);
                parts.push("--data-urlencode".to_string());
                parts.push(shell_quote(&format!("{key}={value}")));
            }
        }
        "multipart" => {
            for field in enabled_rows(&spec.body.fields) {
                let key = interp(&mut template, &field.key);
                let value = interp(&mut template, &field.value);
                parts.push("-F".to_string());
                parts.push(shell_quote(&format!("{key}={value}")));
            }
        }
        _ => {}
    }

    Ok(parts.join(" "))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_simple_get() {
        let parsed =
            parse("curl 'https://api.example.com/users?page=1' -H 'Accept: application/json'")
                .expect("parse");
        assert_eq!(parsed.spec.method, "GET");
        assert_eq!(parsed.spec.url, "https://api.example.com/users");
        assert_eq!(parsed.spec.params[0].key, "page");
        assert_eq!(parsed.spec.params[0].value, "1");
        assert!(
            parsed
                .spec
                .headers
                .iter()
                .any(|header| header.key == "Accept")
        );
    }

    #[test]
    fn parses_post_json() {
        let parsed = parse(
            "curl -X POST https://api.example.com/orders -H 'Content-Type: application/json' --data-raw '{\"sku\":\"HB-01\",\"qty\":2}'",
        )
        .expect("parse");
        assert_eq!(parsed.spec.method, "POST");
        assert_eq!(parsed.spec.body.r#type, "json");
        assert!(parsed.spec.body.raw.contains("HB-01"));
    }

    #[test]
    fn parses_form_and_basic_auth() {
        let parsed =
            parse("curl https://api.example.com/login -u user:pass -d 'name=Ada' -d 'role=admin'")
                .expect("parse");
        assert_eq!(parsed.spec.method, "POST");
        assert_eq!(parsed.spec.body.r#type, "formUrlEncoded");
        assert_eq!(parsed.spec.auth.r#type, "basic");
        assert_eq!(parsed.spec.auth.username, "user");
        assert_eq!(parsed.spec.auth.password, "pass");
    }

    #[test]
    fn handles_line_continuations_and_quotes() {
        let parsed =
            parse("curl 'https://example.com/a' \\\n  -H \"X-Test: hello world\"").expect("parse");
        assert!(
            parsed
                .spec
                .headers
                .iter()
                .any(|header| header.key == "X-Test" && header.value == "hello world")
        );
    }

    #[test]
    fn exports_round_trip() {
        let parsed = parse(
            "curl -X POST 'https://api.example.com/orders' -H 'Content-Type: application/json' --data-raw '{\"sku\":\"HB-01\"}'",
        )
        .expect("parse");
        let command = export(&parsed.spec, &HashMap::new()).expect("export");
        assert!(command.contains("-X POST"));
        assert!(command.contains("https://api.example.com/orders"));
        assert!(command.contains("--data-raw"));
    }

    #[test]
    fn quotes_single_quotes() {
        assert_eq!(shell_quote("it's"), "'it'\\''s'");
    }
}
