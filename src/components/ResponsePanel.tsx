import { lazy, Suspense, useEffect, useMemo, useState, type CSSProperties } from "react";
import { Copy, FileWarning, Inbox } from "lucide-react";
import { formatBytes, formatDuration, prettyJson, statusColor } from "../lib/utils";
import { useUI } from "../stores/ui";
import type { Tab } from "../stores/tabs";

interface ResponsePanelProps {
  tab: Tab;
  style?: CSSProperties;
}

type ResponseTab = "body" | "headers";

export function ResponsePanel({ tab, style }: ResponsePanelProps) {
  const notify = useUI((state) => state.notify);
  const [responseTab, setResponseTab] = useState<ResponseTab>("body");
  const [bodyMode, setBodyMode] = useState<"pretty" | "raw">("pretty");

  const response = tab.response;
  const pretty = useMemo(
    () => (response ? prettyJson(response.bodyText) : null),
    [response],
  );

  useEffect(() => {
    setBodyMode(pretty ? "pretty" : "raw");
  }, [response?.receivedAt, pretty]);

  const copyBody = async () => {
    if (!response) return;
    await navigator.clipboard.writeText(response.bodyText);
    notify("响应内容已复制", "success");
  };

  return (
    <div className="response-panel" style={style}>
      {tab.sending ? (
        <div
          className="flex items-center gap-2 px-3 py-1.5"
          style={{ borderBottom: "1px solid var(--border)", color: "var(--muted)" }}
        >
          <span className="spinner" />
          <span style={{ fontSize: 11.5 }}>正在请求…</span>
        </div>
      ) : null}

      {tab.error ? (
        <div className="error-box">
          <div className="title">{tab.error.message}</div>
          <div className="muted" style={{ fontSize: 11.5 }}>
            错误类型：{tab.error.kind}
          </div>
          {tab.error.detail ? (
            <details>
              <summary style={{ cursor: "pointer" }}>技术详情</summary>
              <pre>{tab.error.detail}</pre>
            </details>
          ) : null}
        </div>
      ) : null}

      {!response && !tab.error ? (
        <div className="empty-state" style={{ flex: 1 }}>
          <Inbox size={26} />
          <div>填写 URL 后点击发送，响应会显示在这里</div>
          <div className="faint" style={{ fontSize: 11 }}>
            Ctrl + Enter 快速发送
          </div>
        </div>
      ) : null}

      {response ? (
        <>
          <div className="response-meta">
            <span
              className="badge"
              style={{
                color: statusColor(response.status),
                background: "var(--panel-3)",
              }}
            >
              {response.status} {response.statusText}
            </span>
            <span>{formatDuration(response.durationMs)}</span>
            <span>{formatBytes(response.sizeBytes)}</span>
            {response.truncated ? <span className="chip">已截断</span> : null}
            {response.isBinary ? <span className="chip">二进制</span> : null}
            <span className="url" title={response.finalUrl}>
              {response.finalUrl}
            </span>
            <span style={{ flex: 1 }} />
            <button className="icon-btn" onClick={() => void copyBody()} title="复制响应体">
              <Copy size={14} />
            </button>
          </div>

          <div className="response-tabs">
            <button
              className={`subtab ${responseTab === "body" ? "active" : ""}`}
              onClick={() => setResponseTab("body")}
            >
              响应体
            </button>
            <button
              className={`subtab ${responseTab === "headers" ? "active" : ""}`}
              onClick={() => setResponseTab("headers")}
            >
              响应头
              <span className="chip">{response.headers.length}</span>
            </button>
            {responseTab === "body" && pretty ? (
              <div className="ml-auto flex items-center gap-1">
                <button
                  className={`btn btn-sm ${bodyMode === "pretty" ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => setBodyMode("pretty")}
                >
                  美化
                </button>
                <button
                  className={`btn btn-sm ${bodyMode === "raw" ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => setBodyMode("raw")}
                >
                  原文
                </button>
              </div>
            ) : null}
          </div>

          <div className="response-content">
            {responseTab === "body" ? (
              response.isBinary ? (
                <div className="empty-state" style={{ flex: 1 }}>
                  <FileWarning size={24} />
                  <div>这是一段二进制响应，暂不支持预览</div>
                  <div className="faint" style={{ fontSize: 11 }}>
                    {formatBytes(response.sizeBytes)}
                  </div>
                </div>
              ) : (
                <CodeEditorLazy
                  value={bodyMode === "pretty" && pretty ? pretty : response.bodyText}
                  language={pretty ? "json" : "text"}
                  readOnly
                  className="h-full"
                />
              )
            ) : (
              <div style={{ overflow: "auto", height: "100%" }}>
                <table className="headers-table">
                  <tbody>
                    {response.headers.map((header, index) => (
                      <tr key={`${header.name}-${index}`}>
                        <td>{header.name}</td>
                        <td>{header.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

// Lazy-loading CodeMirror for the response pane keeps first paint cheap.
const CodeEditor = lazy(() =>
  import("./CodeEditor").then((module) => ({ default: module.CodeEditor })),
);

function CodeEditorLazy(props: {
  value: string;
  language: "json" | "text";
  readOnly?: boolean;
  className?: string;
}) {
  return (
    <Suspense
      fallback={
        <div className="empty-state" style={{ flex: 1 }}>
          <span className="spinner" />
        </div>
      }
    >
      <CodeEditor {...props} />
    </Suspense>
  );
}
