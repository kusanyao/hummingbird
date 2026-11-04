use std::time::{Duration, Instant};

use reqwest::redirect::Policy;
use serde::Serialize;
use tokio::net::TcpStream;
use tokio::time::timeout;
use url::Url;

use crate::error::AppError;

const DNS_TIMEOUT: Duration = Duration::from_secs(3);
const TCP_TIMEOUT: Duration = Duration::from_secs(3);
const HTTP_TIMEOUT: Duration = Duration::from_secs(8);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnoseStep {
    pub name: String,
    pub ok: bool,
    pub skipped: bool,
    pub detail: String,
    pub duration_ms: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnoseReport {
    pub target: String,
    pub host: String,
    pub port: u16,
    pub direct: Vec<DiagnoseStep>,
    pub proxy: Vec<DiagnoseStep>,
    pub proxy_url: Option<String>,
    pub conclusion: String,
    pub advice: Option<String>,
}

fn elapsed_ms(start: Instant) -> u64 {
    start.elapsed().as_millis() as u64
}

fn step(name: &str, ok: bool, detail: String, start: Instant) -> DiagnoseStep {
    DiagnoseStep {
        name: name.to_string(),
        ok,
        skipped: false,
        detail,
        duration_ms: elapsed_ms(start),
    }
}

fn skipped(name: &str, detail: &str) -> DiagnoseStep {
    DiagnoseStep {
        name: name.to_string(),
        ok: false,
        skipped: true,
        detail: detail.to_string(),
        duration_ms: 0,
    }
}

fn normalize_target(input: &str) -> Result<Url, AppError> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err(AppError::new("invalid_url", "请输入要测试的网址或域名"));
    }
    let candidate = if trimmed.contains("://") {
        trimmed.to_string()
    } else {
        format!("https://{trimmed}")
    };
    let url = Url::parse(&candidate).map_err(|err| {
        AppError::with_detail("invalid_url", "测试地址格式不正确", err.to_string())
    })?;
    if url.scheme() != "http" && url.scheme() != "https" {
        return Err(AppError::new("invalid_url", "仅支持 http / https 地址"));
    }
    if url.host_str().is_none() {
        return Err(AppError::new("invalid_url", "地址中缺少域名"));
    }
    Ok(url)
}

fn normalize_proxy(input: &str) -> Result<Url, AppError> {
    let trimmed = input.trim();
    let candidate = if trimmed.contains("://") {
        trimmed.to_string()
    } else {
        format!("http://{trimmed}")
    };
    let url = Url::parse(&candidate).map_err(|err| {
        AppError::with_detail("invalid_proxy", "代理地址格式不正确", err.to_string())
    })?;
    if !matches!(url.scheme(), "http" | "https" | "socks5" | "socks5h") {
        return Err(AppError::new(
            "invalid_proxy",
            "代理仅支持 http / https / socks5",
        ));
    }
    if url.host_str().is_none() {
        return Err(AppError::new("invalid_proxy", "代理地址中缺少主机名"));
    }
    if url.port().is_none() && url.port_or_known_default().is_none() {
        return Err(AppError::new(
            "invalid_proxy",
            "代理地址需要包含端口，例如 http://127.0.0.1:7897",
        ));
    }
    Ok(url)
}

fn proxy_display(url: &Url) -> String {
    let mut text = url.to_string();
    if url.path() == "/" && text.ends_with('/') {
        text.pop();
    }
    text
}

fn request_label(url: &Url) -> &'static str {
    if url.scheme() == "https" {
        "HTTPS 请求"
    } else {
        "HTTP 请求"
    }
}

fn friendly_io(err: &std::io::Error) -> String {
    use std::io::ErrorKind;
    match err.kind() {
        ErrorKind::ConnectionRefused => "连接被拒绝".to_string(),
        ErrorKind::TimedOut => "连接超时".to_string(),
        ErrorKind::NetworkUnreachable => "网络不可达".to_string(),
        ErrorKind::HostUnreachable => "主机不可达".to_string(),
        _ => err.to_string(),
    }
}

fn friendly_reqwest(err: &reqwest::Error) -> String {
    let text = err.to_string();
    let lower = text.to_lowercase();
    if err.is_timeout() {
        "请求超时".to_string()
    } else if lower.contains("certificate") || lower.contains("tls") || lower.contains("ssl") {
        "TLS 握手或证书校验失败".to_string()
    } else if err.is_connect() {
        "无法建立连接".to_string()
    } else if err.is_builder() {
        format!("请求配置错误：{text}")
    } else {
        format!("请求失败：{text}")
    }
}

async fn dns_step(host: &str, port: u16) -> DiagnoseStep {
    let started = Instant::now();
    match timeout(DNS_TIMEOUT, tokio::net::lookup_host((host, port))).await {
        Err(_) => step("DNS 解析", false, "解析超时".to_string(), started),
        Ok(Err(err)) => step("DNS 解析", false, format!("解析失败：{err}"), started),
        Ok(Ok(addrs)) => {
            let mut ips: Vec<String> = Vec::new();
            for addr in addrs {
                let ip = addr.ip().to_string();
                if !ips.contains(&ip) {
                    ips.push(ip);
                }
            }
            if ips.is_empty() {
                step("DNS 解析", false, "没有解析到地址".to_string(), started)
            } else {
                step("DNS 解析", true, ips.join("，"), started)
            }
        }
    }
}

async fn tcp_step(host: &str, port: u16, name: &str) -> DiagnoseStep {
    let started = Instant::now();
    match timeout(TCP_TIMEOUT, TcpStream::connect((host, port))).await {
        Err(_) => step(name, false, format!("连接 {host}:{port} 超时"), started),
        Ok(Err(err)) => step(
            name,
            false,
            format!("{host}:{port} 连接失败：{}", friendly_io(&err)),
            started,
        ),
        Ok(Ok(stream)) => {
            drop(stream);
            step(name, true, format!("{host}:{port} 可连接"), started)
        }
    }
}

async fn http_step(url: &Url, proxy: Option<&str>) -> DiagnoseStep {
    let label = request_label(url);
    let started = Instant::now();
    let mut builder = reqwest::Client::builder()
        .timeout(HTTP_TIMEOUT)
        .redirect(Policy::limited(5))
        .user_agent(format!("Hummingbird/{}", env!("CARGO_PKG_VERSION")));
    if let Some(proxy) = proxy {
        match reqwest::Proxy::all(proxy) {
            Ok(value) => builder = builder.proxy(value),
            Err(err) => return step(label, false, format!("代理配置无效：{err}"), started),
        }
    } else {
        // A direct test must not silently go through HTTP(S)_PROXY from the
        // environment, otherwise the report would label a proxied request
        // as "direct".
        builder = builder.no_proxy();
    }
    let client = match builder.build() {
        Ok(client) => client,
        Err(err) => return step(label, false, format!("客户端创建失败：{err}"), started),
    };
    match client
        .get(url.clone())
        .header(reqwest::header::RANGE, "bytes=0-0")
        .send()
        .await
    {
        Ok(response) => {
            let status = response.status();
            let detail = format!(
                "HTTP {} {}",
                status.as_u16(),
                status.canonical_reason().unwrap_or("")
            );
            drop(response);
            if proxy.is_some() && status.as_u16() == 407 {
                step(
                    label,
                    false,
                    "代理需要认证（HTTP 407）".to_string(),
                    started,
                )
            } else {
                step(label, true, detail, started)
            }
        }
        Err(err) => step(label, false, friendly_reqwest(&err), started),
    }
}

fn http_ok(steps: &[DiagnoseStep]) -> bool {
    steps
        .iter()
        .any(|item| item.name.contains("请求") && item.ok)
}

fn build_conclusion(
    direct: &[DiagnoseStep],
    proxy: &[DiagnoseStep],
    proxy_url: Option<&str>,
) -> (String, Option<String>) {
    let direct_ok = http_ok(direct);
    let proxy_ok = http_ok(proxy);
    let dns_ok = direct.iter().any(|item| item.name == "DNS 解析" && item.ok);
    let tcp_ok = direct.iter().any(|item| item.name == "TCP 连接" && item.ok);
    let has_proxy = proxy_url.is_some();

    if direct_ok {
        if has_proxy && proxy_ok {
            return ("直连正常，代理也可以访问该地址。".to_string(), None);
        }
        return ("直连正常，可以访问目标地址。".to_string(), None);
    }

    if has_proxy && proxy_ok {
        return (
            "直连不可用，但通过代理可以访问目标地址。".to_string(),
            Some(format!(
                "需要联网的程序请使用该代理：{}",
                proxy_url.unwrap_or_default()
            )),
        );
    }

    if has_proxy {
        return (
            "直连和代理都无法访问目标地址。".to_string(),
            Some("请检查目标地址、代理地址或网络连接。".to_string()),
        );
    }

    if tcp_ok {
        return (
            "端口可以连接，但 HTTP/TLS 请求失败。".to_string(),
            Some("可能是 TLS 证书、协议不匹配或目标服务异常。".to_string()),
        );
    }

    if !dns_ok {
        return (
            "域名解析失败。".to_string(),
            Some("请检查 DNS、hosts 或 VPN 设置。".to_string()),
        );
    }

    (
        "直连不可用。".to_string(),
        Some(
            "如果浏览器能打开同一地址，说明网络本身可用，通常是代理只应用到了浏览器。把本机代理地址填进来再检测一次。"
                .to_string(),
        ),
    )
}

pub async fn diagnose(target: String, proxy: Option<String>) -> Result<DiagnoseReport, AppError> {
    let url = normalize_target(&target)?;
    let host = url.host_str().unwrap_or_default().to_string();
    let port = url.port_or_known_default().unwrap_or(443);
    let proxy_url = match proxy.as_deref() {
        Some(value) if !value.trim().is_empty() => Some(normalize_proxy(value)?),
        _ => None,
    };

    let direct_future = async {
        let dns = dns_step(&host, port).await;
        let mut steps = vec![dns.clone()];
        if dns.ok {
            steps.push(tcp_step(&host, port, "TCP 连接").await);
            steps.push(http_step(&url, None).await);
        } else {
            steps.push(skipped("TCP 连接", "跳过：域名未解析"));
            steps.push(skipped(request_label(&url), "跳过：域名未解析"));
        }
        steps
    };

    let proxy_future = async {
        match &proxy_url {
            None => Vec::new(),
            Some(proxy) => {
                let proxy_host = proxy.host_str().unwrap_or("127.0.0.1").to_string();
                let proxy_port = proxy.port_or_known_default().unwrap_or(8080);
                let tcp = tcp_step(&proxy_host, proxy_port, "代理端口").await;
                let http = if tcp.ok {
                    http_step(&url, Some(proxy.as_str())).await
                } else {
                    skipped(request_label(&url), "跳过：代理端口不可达")
                };
                vec![tcp, http]
            }
        }
    };

    let (direct, proxy_steps) = tokio::join!(direct_future, proxy_future);
    let proxy_display = proxy_url.as_ref().map(proxy_display);
    let (conclusion, advice) = build_conclusion(&direct, &proxy_steps, proxy_display.as_deref());

    Ok(DiagnoseReport {
        target: url.to_string(),
        host,
        port,
        direct,
        proxy: proxy_steps,
        proxy_url: proxy_display,
        conclusion,
        advice,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_bare_hosts() {
        let url = normalize_target("github.com").expect("target");
        assert_eq!(url.as_str(), "https://github.com/");
        assert_eq!(url.port_or_known_default(), Some(443));
    }

    #[test]
    fn keeps_explicit_scheme_and_port() {
        let url = normalize_target("http://127.0.0.1:8080/health").expect("target");
        assert_eq!(url.scheme(), "http");
        assert_eq!(url.port(), Some(8080));
    }

    #[test]
    fn normalizes_proxy_without_scheme() {
        let proxy = normalize_proxy("127.0.0.1:7897").expect("proxy");
        assert_eq!(proxy_display(&proxy), "http://127.0.0.1:7897");
    }

    #[test]
    fn rejects_unsupported_proxy_scheme() {
        assert!(normalize_proxy("ftp://127.0.0.1:21").is_err());
    }

    #[test]
    fn direct_success_conclusion() {
        let direct = vec![
            step("DNS 解析", true, "1.1.1.1".into(), Instant::now()),
            step("TCP 连接", true, "ok".into(), Instant::now()),
            step("HTTPS 请求", true, "HTTP 200 OK".into(), Instant::now()),
        ];
        let (conclusion, advice) = build_conclusion(&direct, &[], None);
        assert!(conclusion.contains("直连正常"));
        assert!(advice.is_none());
    }

    #[test]
    fn proxy_success_conclusion() {
        let direct = vec![
            step("DNS 解析", true, "1.1.1.1".into(), Instant::now()),
            step("TCP 连接", false, "timeout".into(), Instant::now()),
            step("HTTPS 请求", false, "请求超时".into(), Instant::now()),
        ];
        let proxy = vec![
            step("代理端口", true, "ok".into(), Instant::now()),
            step("HTTPS 请求", true, "HTTP 200 OK".into(), Instant::now()),
        ];
        let (conclusion, advice) = build_conclusion(&direct, &proxy, Some("http://127.0.0.1:7897"));
        assert!(conclusion.contains("代理可以访问"));
        assert!(advice.expect("advice").contains("http://127.0.0.1:7897"));
    }
}
