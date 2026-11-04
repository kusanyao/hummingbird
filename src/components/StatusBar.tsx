import { FolderOpen } from "lucide-react";
import { ipc } from "../lib/ipc";
import { useWorkspace } from "../stores/workspace";

export function StatusBar() {
  const env = useWorkspace((state) => state.env);
  const version = useWorkspace((state) => state.version);
  const dataDir = useWorkspace((state) => state.dataDir);
  const active = env.environments.find((item) => item.id === env.activeId);

  return (
    <footer className="statusbar">
      <span style={{ color: "var(--accent)" }}>●</span>
      <span>本地模式 · 无需登录</span>
      <span>环境：{active?.name ?? "无"}</span>
      <span style={{ marginLeft: "auto" }}>数据保存在本机</span>
      <button
        className="btn btn-ghost btn-sm"
        style={{ height: 20 }}
        title={dataDir}
        onClick={() => void ipc.openDataDir()}
      >
        <FolderOpen size={11} /> 数据目录
      </button>
      <span>v{version || "0.1.0"}</span>
    </footer>
  );
}
