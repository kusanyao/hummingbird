import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ClipboardPaste, Save, Send, Square, Terminal } from "lucide-react";
import { cancelTab, saveTabToCollection, sendTab } from "../lib/actions";
import { copyText } from "../lib/clipboard";
import { ipc, toAppError } from "../lib/ipc";
import { useTabs, type Tab } from "../stores/tabs";
import { useUI } from "../stores/ui";
import { HTTP_METHODS, type RequestSpec } from "../types";
import { AuthEditor } from "./AuthEditor";
import { BodyEditor } from "./BodyEditor";
import { CurlImportDialog } from "./CurlImportDialog";
import { KeyValueEditor } from "./KeyValueEditor";

type SubTab = "params" | "headers" | "body" | "auth";

interface RequestPanelProps {
  tab: Tab;
  style?: CSSProperties;
}

export function RequestPanel({ tab, style }: RequestPanelProps) {
  const setSpec = useTabs((state) => state.setSpec);
  const setSaveDialogTabId = useUI((state) => state.setSaveDialogTabId);
  const notify = useUI((state) => state.notify);
  const [subTab, setSubTab] = useState<SubTab>("params");
  const [curlOpen, setCurlOpen] = useState(false);
  const urlRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setSubTab("params");
  }, [tab.id]);

  useEffect(() => {
    const focusUrl = () => urlRef.current?.focus();
    window.addEventListener("hummingbird:focus-url", focusUrl);
    return () => window.removeEventListener("hummingbird:focus-url", focusUrl);
  }, []);

  const update = (patch: Partial<RequestSpec>) => {
    setSpec(tab.id, { ...tab.spec, ...patch });
  };

  const activeParams = tab.spec.params.filter(
    (item) => item.enabled && item.key.trim(),
  ).length;
  const activeHeaders = tab.spec.headers.filter(
    (item) => item.enabled && item.key.trim(),
  ).length;

  const handleSave = async () => {
    if (!tab.ref) {
      setSaveDialogTabId(tab.id);
      return;
    }
    const saved = await saveTabToCollection(tab.id);
    notify(saved ? "已保存" : "保存失败", saved ? "success" : "error");
  };

  const copyCurl = async () => {
    try {
      const command = await ipc.curlExport(tab.spec);
      await copyText(command);
      notify("cURL 已复制", "success");
    } catch (err) {
      notify(toAppError(err).message, "error");
    }
  };

  return (
    <div className="request-panel" style={style}>
      <div className="request-top">
        <select
          className="select method-select"
          value={tab.spec.method}
          style={{ color: "var(--fg)" }}
          onChange={(event) => update({ method: event.target.value })}
        >
          {HTTP_METHODS.map((method) => (
            <option key={method} value={method}>
              {method}
            </option>
          ))}
        </select>
        <input
          ref={urlRef}
          className="input url-input"
          value={tab.spec.url}
          placeholder="https://api.example.com/users 或 {{base_url}}/users"
          spellCheck={false}
          onChange={(event) => update({ url: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void sendTab(tab.id);
            }
          }}
        />
        {tab.sending ? (
          <button
            className="btn btn-danger send-btn"
            onClick={() => void cancelTab(tab.id)}
          >
            <Square size={12} /> 取消
          </button>
        ) : (
          <button
            className="btn btn-primary send-btn"
            onClick={() => void sendTab(tab.id)}
          >
            <Send size={13} /> 发送
          </button>
        )}
        <button
          className="icon-btn"
          onClick={() => setCurlOpen(true)}
          title="导入 cURL"
        >
          <ClipboardPaste size={15} />
        </button>
        <button
          className="icon-btn"
          onClick={() => void copyCurl()}
          title="复制为 cURL"
        >
          <Terminal size={15} />
        </button>
        <button className="icon-btn" onClick={() => void handleSave()} title="保存 (Ctrl+S)">
          <Save size={15} />
        </button>
      </div>

      <div className="subtabs">
        <button
          className={`subtab ${subTab === "params" ? "active" : ""}`}
          onClick={() => setSubTab("params")}
        >
          参数
          {activeParams > 0 ? <span className="chip">{activeParams}</span> : null}
        </button>
        <button
          className={`subtab ${subTab === "headers" ? "active" : ""}`}
          onClick={() => setSubTab("headers")}
        >
          请求头
          {activeHeaders > 0 ? <span className="chip">{activeHeaders}</span> : null}
        </button>
        <button
          className={`subtab ${subTab === "body" ? "active" : ""}`}
          onClick={() => setSubTab("body")}
        >
          请求体
          {tab.spec.body.type !== "none" ? <span className="chip">•</span> : null}
        </button>
        <button
          className={`subtab ${subTab === "auth" ? "active" : ""}`}
          onClick={() => setSubTab("auth")}
        >
          认证
          {tab.spec.auth.type !== "none" ? <span className="chip">•</span> : null}
        </button>
      </div>

      <div className="request-body">
        {subTab === "params" ? (
          <KeyValueEditor
            rows={tab.spec.params}
            onChange={(params) => update({ params })}
            keyPlaceholder="参数名"
            valuePlaceholder="参数值，支持 {{变量}}"
          />
        ) : null}
        {subTab === "headers" ? (
          <KeyValueEditor
            rows={tab.spec.headers}
            onChange={(headers) => update({ headers })}
            keyPlaceholder="Header 名称"
            valuePlaceholder="Header 值，支持 {{变量}}"
          />
        ) : null}
        {subTab === "body" ? (
          <BodyEditor body={tab.spec.body} onChange={(body) => update({ body })} />
        ) : null}
        {subTab === "auth" ? (
          <AuthEditor auth={tab.spec.auth} onChange={(auth) => update({ auth })} />
        ) : null}
      </div>

      <CurlImportDialog open={curlOpen} onClose={() => setCurlOpen(false)} />
    </div>
  );
}
