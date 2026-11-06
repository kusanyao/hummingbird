import { Activity, Settings, SlidersHorizontal } from "lucide-react";
import logoUrl from "../assets/logo-mark.svg";
import { useUI } from "../stores/ui";
import { useWorkspace } from "../stores/workspace";
import { CollectionTree } from "./CollectionTree";
import { HistoryList } from "./HistoryList";

export function Sidebar() {
  const view = useUI((state) => state.sidebarView);
  const setView = useUI((state) => state.setSidebarView);
  const setEnvDialogOpen = useUI((state) => state.setEnvDialogOpen);
  const setSettingsOpen = useUI((state) => state.setSettingsOpen);
  const setNetDialogOpen = useUI((state) => state.setNetDialogOpen);

  const env = useWorkspace((state) => state.env);
  const version = useWorkspace((state) => state.version);
  const saveEnv = useWorkspace((state) => state.saveEnv);
  const activeEnv = env.environments.find((item) => item.id === env.activeId);

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <img src={logoUrl} alt="蜂鸟" className="logo-mark" />
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontWeight: 700, fontSize: 13 }}>蜂鸟</span>
            {version ? (
              <span className="faint" style={{ fontSize: 10.5 }}>
                v{version}
              </span>
            ) : null}
          </div>
          <div className="faint" style={{ fontSize: 10.5 }}>
            本地优先 API 客户端
          </div>
        </div>
      </div>

      <div className="segmented">
        <button
          className={view === "collections" ? "active" : ""}
          onClick={() => setView("collections")}
        >
          集合
        </button>
        <button
          className={view === "history" ? "active" : ""}
          onClick={() => setView("history")}
        >
          历史
        </button>
      </div>

      {view === "collections" ? <CollectionTree /> : <HistoryList />}

      <div className="sidebar-footer">
        <select
          className="select"
          style={{ flex: 1, minWidth: 0 }}
          value={env.activeId ?? ""}
          title={activeEnv ? `当前环境：${activeEnv.name}` : "未选择环境"}
          onChange={(event) =>
            void saveEnv({ ...env, activeId: event.target.value || null })
          }
        >
          <option value="">无环境</option>
          {env.environments.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <button
          className="icon-btn"
          title="管理环境变量"
          onClick={() => setEnvDialogOpen(true)}
        >
          <SlidersHorizontal size={14} />
        </button>
        <button
          className="icon-btn"
          title="网络诊断"
          onClick={() => setNetDialogOpen(true)}
        >
          <Activity size={14} />
        </button>
        <button
          className="icon-btn"
          title="设置"
          onClick={() => setSettingsOpen(true)}
        >
          <Settings size={14} />
        </button>
      </div>
    </aside>
  );
}
