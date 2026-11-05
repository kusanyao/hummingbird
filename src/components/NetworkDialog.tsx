import { useEffect, useState } from "react";
import {
  Activity,
  CheckCircle2,
  Copy,
  MinusCircle,
  XCircle,
} from "lucide-react";
import { copyText } from "../lib/clipboard";
import { ipc, toAppError } from "../lib/ipc";
import { useUI } from "../stores/ui";
import type { AppError, DiagnoseReport, DiagnoseStep } from "../types";
import { Modal } from "./common/Modal";

const TARGET_KEY = "hummingbird.network.target";
const PROXY_KEY = "hummingbird.network.proxy";

function tone(report: DiagnoseReport): "ok" | "warn" | "bad" {
  const directOk = report.direct.some(
    (step) => step.name.includes("请求") && step.ok,
  );
  const proxyOk = report.proxy.some(
    (step) => step.name.includes("请求") && step.ok,
  );
  if (directOk) return "ok";
  if (proxyOk) return "warn";
  return "bad";
}

function StepRow({ step }: { step: DiagnoseStep }) {
  const Icon = step.skipped ? MinusCircle : step.ok ? CheckCircle2 : XCircle;
  const color = step.skipped
    ? "var(--faint)"
    : step.ok
      ? "var(--accent)"
      : "var(--danger)";
  return (
    <div className={`diag-step ${step.skipped ? "skipped" : ""}`}>
      <Icon size={15} style={{ color }} />
      <span className="diag-name">{step.name}</span>
      <span className="diag-detail" title={step.detail}>
        {step.detail}
      </span>
      <span className="diag-time">
        {step.skipped ? "—" : `${step.durationMs} ms`}
      </span>
    </div>
  );
}

export function NetworkDialog() {
  const open = useUI((state) => state.netDialogOpen);
  const setOpen = useUI((state) => state.setNetDialogOpen);
  const notify = useUI((state) => state.notify);

  const [target, setTarget] = useState(
    () => localStorage.getItem(TARGET_KEY) ?? "https://github.com",
  );
  const [proxy, setProxy] = useState(
    () => localStorage.getItem(PROXY_KEY) ?? "",
  );
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<DiagnoseReport | null>(null);
  const [error, setError] = useState<AppError | null>(null);

  useEffect(() => {
    if (!open) return;
    setReport(null);
    setError(null);
  }, [open]);

  const run = async () => {
    if (running) return;
    const trimmed = target.trim();
    if (!trimmed) {
      setError({ kind: "invalid_url", message: "请输入要测试的网址或域名" });
      return;
    }
    setRunning(true);
    setError(null);
    setReport(null);
    localStorage.setItem(TARGET_KEY, trimmed);
    localStorage.setItem(PROXY_KEY, proxy.trim());
    try {
      setReport(
        await ipc.networkDiagnose(trimmed, proxy.trim() || null),
      );
    } catch (err) {
      setError(toAppError(err));
    } finally {
      setRunning(false);
    }
  };

  const copyProxy = async () => {
    if (!report?.proxyUrl) return;
    await copyText(report.proxyUrl);
    notify("代理地址已复制", "success");
  };

  return (
    <Modal
      open={open}
      title="网络诊断"
      onClose={() => setOpen(false)}
      width={700}
      footer={
        <>
          <span
            className="muted"
            style={{ marginRight: "auto", fontSize: 11.5 }}
          >
            浏览器能访问但这里直连失败时，填写本机代理再测一次。
          </span>
          <button className="btn" onClick={() => setOpen(false)}>
            关闭
          </button>
          <button
            className="btn btn-primary"
            disabled={running}
            onClick={() => void run()}
          >
            {running ? (
              <>
                <span className="spinner" style={{ width: 12, height: 12 }} />{" "}
                检测中…
              </>
            ) : (
              <>
                <Activity size={13} /> 开始检测
              </>
            )}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <div>
          <label className="field-label">测试地址</label>
          <input
            className="input"
            value={target}
            placeholder="https://github.com 或 github.com"
            spellCheck={false}
            onChange={(event) => setTarget(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void run();
            }}
          />
        </div>
        <div>
          <label className="field-label">代理（可选）</label>
          <input
            className="input"
            value={proxy}
            placeholder="http://127.0.0.1:7897"
            spellCheck={false}
            onChange={(event) => setProxy(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void run();
            }}
          />
          <p className="faint" style={{ margin: "5px 0 0", fontSize: 11 }}>
            支持 http://、https://、socks5://；不填则只测直连。
          </p>
        </div>
      </div>

      {running ? (
        <div className="diag-running">
          <span className="spinner" />
          正在解析并连接…
        </div>
      ) : null}

      {error ? (
        <div className="error-box" style={{ margin: "14px 0 0" }}>
          <div className="title">{error.message}</div>
          {error.detail ? (
            <details>
              <summary>技术详情</summary>
              <pre>{error.detail}</pre>
            </details>
          ) : null}
        </div>
      ) : null}

      {report ? (
        <div style={{ marginTop: 16 }}>
          <div className="diag-section">
            <div className="diag-group-title">
              直连 · {report.host}:{report.port}
            </div>
            {report.direct.map((step) => (
              <StepRow key={step.name} step={step} />
            ))}
          </div>

          {report.proxyUrl ? (
            <div className="diag-section">
              <div className="diag-group-title">代理 · {report.proxyUrl}</div>
              {report.proxy.map((step) => (
                <StepRow key={step.name} step={step} />
              ))}
            </div>
          ) : null}

          <div className={`diag-conclusion ${tone(report)}`}>
            <div style={{ fontWeight: 600 }}>{report.conclusion}</div>
            {report.advice ? (
              <div className="diag-advice">{report.advice}</div>
            ) : null}
            {report.proxyUrl ? (
              <div className="diag-proxy-code">
                <span>{report.proxyUrl}</span>
                <button
                  className="icon-btn"
                  title="复制代理地址"
                  onClick={() => void copyProxy()}
                >
                  <Copy size={13} />
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
