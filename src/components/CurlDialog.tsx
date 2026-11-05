import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Copy, RefreshCw, XCircle } from "lucide-react";
import { copyText } from "../lib/clipboard";
import { ipc, toAppError } from "../lib/ipc";
import { useTabs, type Tab } from "../stores/tabs";
import { useUI } from "../stores/ui";
import { Modal } from "./common/Modal";

type SyncStatus = "idle" | "syncing" | "synced" | "error";

const STARTER =
  "curl 'https://api.example.com/users' -H 'Accept: application/json'";

interface CurlDialogProps {
  open: boolean;
  tab: Tab;
  onClose: () => void;
}

export function CurlDialog({ open, tab, onClose }: CurlDialogProps) {
  const setSpec = useTabs((state) => state.setSpec);
  const notify = useUI((state) => state.notify);

  const [text, setText] = useState("");
  const [status, setStatus] = useState<SyncStatus>("idle");
  const [detail, setDetail] = useState<string | null>(null);
  const appliedRef = useRef("");
  const timerRef = useRef<number | null>(null);
  const latestTextRef = useRef("");
  const syncSeqRef = useRef(0);

  latestTextRef.current = text;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setText("");
    setStatus("idle");
    setDetail(null);
    appliedRef.current = "";
    if (!tab.spec.url.trim()) {
      setText(STARTER);
    } else {
      ipc
        .curlExport(tab.spec)
        .then((command) => {
          if (cancelled) return;
          setText(command);
          appliedRef.current = command;
        })
        .catch((err) => {
          if (cancelled) return;
          setStatus("error");
          setDetail(toAppError(err).message);
        });
    }
    return () => {
      cancelled = true;
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
    // Only regenerate when the dialog opens or switches to another tab.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tab.id]);

  const sync = async (value: string) => {
    if (value === appliedRef.current) {
      setStatus("synced");
      return;
    }
    if (!value.trim()) {
      setStatus("error");
      setDetail("命令为空，请求未修改");
      return;
    }
    const seq = ++syncSeqRef.current;
    setStatus("syncing");
    try {
      const result = await ipc.curlImport(value);
      if (seq !== syncSeqRef.current) return;
      setSpec(tab.id, result.spec);
      appliedRef.current = value;
      setStatus("synced");
      setDetail(
        result.warnings.length > 0
          ? `已同步，忽略 ${result.warnings.length} 个参数`
          : null,
      );
    } catch (err) {
      if (seq !== syncSeqRef.current) return;
      setStatus("error");
      setDetail(toAppError(err).message);
    }
  };

  const schedule = (value: string) => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void sync(value);
    }, 500);
  };

  const handleChange = (value: string) => {
    setText(value);
    setStatus("idle");
    setDetail(null);
    schedule(value);
  };

  const handleClose = async () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
      await sync(latestTextRef.current);
    }
    onClose();
  };

  const handleCopy = async () => {
    await copyText(text);
    notify("cURL 已复制", "success");
  };

  const handleRegenerate = async () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!tab.spec.url.trim()) {
      setText(STARTER);
      appliedRef.current = "";
      setStatus("idle");
      setDetail(null);
      return;
    }
    try {
      const command = await ipc.curlExport(tab.spec);
      setText(command);
      appliedRef.current = command;
      setStatus("synced");
      setDetail("已从当前请求重新生成");
    } catch (err) {
      setStatus("error");
      setDetail(toAppError(err).message);
    }
  };

  const statusView = (() => {
    if (status === "syncing") {
      return (
        <>
          <span className="spinner" /> 正在同步到请求…
        </>
      );
    }
    if (status === "synced") {
      return (
        <>
          <CheckCircle2 size={13} /> 已同步到请求
          {detail ? ` · ${detail}` : ""}
        </>
      );
    }
    if (status === "error") {
      return (
        <>
          <XCircle size={13} /> {detail ?? "命令无法解析，请求未修改"}
        </>
      );
    }
    return "编辑命令会自动同步到请求；全选粘贴可替换当前请求。";
  })();

  return (
    <Modal
      open={open}
      title={`cURL · ${tab.title}`}
      onClose={() => void handleClose()}
      width={760}
      footer={
        <>
          <span className="muted" style={{ marginRight: "auto", fontSize: 11.5 }}>
            变量已按当前环境替换。
          </span>
          <button className="btn" onClick={() => void handleCopy()}>
            <Copy size={13} /> 复制
          </button>
          <button className="btn" onClick={() => void handleRegenerate()}>
            <RefreshCw size={13} /> 重新生成
          </button>
          <button className="btn btn-primary" onClick={() => void handleClose()}>
            关闭
          </button>
        </>
      }
    >
      <textarea
        className="textarea"
        style={{
          minHeight: 340,
          fontSize: 12,
          lineHeight: 1.6,
          whiteSpace: "pre-wrap",
        }}
        value={text}
        placeholder="curl 'https://api.example.com/users' -H 'Accept: application/json'"
        spellCheck={false}
        onChange={(event) => handleChange(event.target.value)}
      />
      <div className={`curl-status ${status}`}>{statusView}</div>
    </Modal>
  );
}
