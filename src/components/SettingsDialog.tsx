import { useEffect, useState } from "react";
import { FolderOpen } from "lucide-react";
import { ipc } from "../lib/ipc";
import { useUI } from "../stores/ui";
import { useWorkspace } from "../stores/workspace";
import type { Settings } from "../types";
import { Modal } from "./common/Modal";

export function SettingsDialog() {
  const open = useUI((state) => state.settingsOpen);
  const setOpen = useUI((state) => state.setSettingsOpen);
  const settings = useWorkspace((state) => state.settings);
  const updateSettings = useWorkspace((state) => state.updateSettings);
  const dataDir = useWorkspace((state) => state.dataDir);

  const [draft, setDraft] = useState<Settings>(settings);

  useEffect(() => {
    if (open) setDraft(settings);
  }, [open, settings]);

  const patch = (value: Partial<Settings>) => setDraft({ ...draft, ...value });
  const maxMb = Math.round((draft.maxResponseBytes / (1024 * 1024)) * 10) / 10;

  return (
    <Modal
      open={open}
      title="设置"
      onClose={() => setOpen(false)}
      width={520}
      footer={
        <>
          <button
            className="btn btn-ghost"
            style={{ marginRight: "auto" }}
            onClick={() => void ipc.openDataDir()}
            title={dataDir}
          >
            <FolderOpen size={13} /> 打开数据目录
          </button>
          <button className="btn" onClick={() => setOpen(false)}>
            取消
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              void updateSettings(draft);
              setOpen(false);
            }}
          >
            保存
          </button>
        </>
      }
    >
      <div className="form-grid">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">请求超时（毫秒，0 表示不限制）</label>
            <input
              className="input"
              type="number"
              min={0}
              step={1000}
              value={draft.timeoutMs}
              onChange={(event) => patch({ timeoutMs: Number(event.target.value) || 0 })}
            />
          </div>
          <div>
            <label className="field-label">响应大小上限（MB，0 表示不限制）</label>
            <input
              className="input"
              type="number"
              min={0}
              step={1}
              value={maxMb}
              onChange={(event) =>
                patch({
                  maxResponseBytes:
                    Math.max(0, Number(event.target.value) || 0) * 1024 * 1024,
                })
              }
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">最大重定向次数</label>
            <input
              className="input"
              type="number"
              min={1}
              max={20}
              value={draft.maxRedirects}
              disabled={!draft.followRedirects}
              onChange={(event) =>
                patch({ maxRedirects: Number(event.target.value) || 1 })
              }
            />
          </div>
          <div>
            <label className="field-label">历史记录上限</label>
            <input
              className="input"
              type="number"
              min={20}
              max={5000}
              value={draft.historyLimit}
              onChange={(event) =>
                patch({ historyLimit: Number(event.target.value) || 500 })
              }
            />
          </div>
        </div>

        <label className="flex items-center gap-2" style={{ fontSize: 12.5 }}>
          <input
            type="checkbox"
            style={{ accentColor: "var(--accent)" }}
            checked={draft.followRedirects}
            onChange={(event) => patch({ followRedirects: event.target.checked })}
          />
          自动跟随重定向
        </label>

        <label className="flex items-center gap-2" style={{ fontSize: 12.5 }}>
          <input
            type="checkbox"
            style={{ accentColor: "var(--accent)" }}
            checked={!draft.verifyTls}
            onChange={(event) => patch({ verifyTls: !event.target.checked })}
          />
          忽略 TLS 证书错误（仅建议在自签名的内网环境使用）
        </label>

        <div>
          <label className="field-label">主题</label>
          <select
            className="select"
            value={draft.theme}
            onChange={(event) =>
              patch({ theme: event.target.value as Settings["theme"] })
            }
          >
            <option value="dark">深色</option>
            <option value="light">浅色</option>
          </select>
        </div>

        <p className="faint" style={{ margin: 0, fontSize: 11 }}>
          数据目录：{dataDir}
        </p>
      </div>
    </Modal>
  );
}
