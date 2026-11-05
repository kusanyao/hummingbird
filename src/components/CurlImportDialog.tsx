import { useEffect, useState } from "react";
import { ClipboardPaste } from "lucide-react";
import { ipc, toAppError } from "../lib/ipc";
import { useTabs } from "../stores/tabs";
import { useUI } from "../stores/ui";
import type { AppError } from "../types";
import { Modal } from "./common/Modal";

interface CurlImportDialogProps {
  open: boolean;
  onClose: () => void;
}

function titleFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname === "/" ? "" : parsed.pathname;
    return `${parsed.host}${path}` || "导入的请求";
  } catch {
    return "导入的请求";
  }
}

const EXAMPLE = `curl 'https://api.example.com/users' \\
  -H 'Accept: application/json' \\
  -H 'Authorization: Bearer token'`;

export function CurlImportDialog({ open, onClose }: CurlImportDialogProps) {
  const openDraft = useTabs((state) => state.openDraft);
  const notify = useUI((state) => state.notify);

  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  useEffect(() => {
    if (!open) return;
    setInput("");
    setError(null);
    setBusy(false);
  }, [open]);

  const handleImport = async () => {
    if (busy) return;
    if (!input.trim()) {
      setError({ kind: "invalid_curl", message: "请粘贴 curl 命令" });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await ipc.curlImport(input);
      openDraft(titleFromUrl(result.spec.url), result.spec);
      if (result.warnings.length > 0) {
        notify(
          `已导入，${result.warnings.length} 个参数被忽略：${result.warnings
            .slice(0, 2)
            .join("；")}`,
          "info",
        );
      } else {
        notify("已导入 cURL", "success");
      }
      onClose();
    } catch (err) {
      setError(toAppError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title="导入 cURL"
      onClose={onClose}
      width={680}
      footer={
        <>
          <span className="muted" style={{ marginRight: "auto", fontSize: 11.5 }}>
            支持常用参数：-X、-H、-d、--data-raw、-F、-u、-G、--json 等。
          </span>
          <button className="btn" onClick={onClose}>
            取消
          </button>
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void handleImport()}
          >
            {busy ? (
              <>
                <span className="spinner" style={{ width: 12, height: 12 }} />{" "}
                解析中…
              </>
            ) : (
              <>
                <ClipboardPaste size={13} /> 导入
              </>
            )}
          </button>
        </>
      }
    >
      <p className="muted" style={{ marginTop: 0, fontSize: 11.5 }}>
        粘贴从浏览器开发者工具或其他地方复制的 curl 命令。
        文件上传、代理等暂不支持的参数会被忽略并提示。
      </p>
      <textarea
        className="textarea"
        style={{ minHeight: 240 }}
        value={input}
        placeholder={EXAMPLE}
        spellCheck={false}
        onChange={(event) => setInput(event.target.value)}
        onKeyDown={(event) => {
          if (event.ctrlKey && event.key === "Enter") {
            event.preventDefault();
            void handleImport();
          }
        }}
      />
      {error ? (
        <div className="error-box" style={{ margin: "12px 0 0" }}>
          <div className="title">{error.message}</div>
          {error.detail ? (
            <details>
              <summary>技术详情</summary>
              <pre>{error.detail}</pre>
            </details>
          ) : null}
        </div>
      ) : null}
      <p className="faint" style={{ margin: "8px 0 0", fontSize: 11 }}>
        提示：Ctrl + Enter 快速导入。解析后的请求会作为新标签页打开。
      </p>
    </Modal>
  );
}
