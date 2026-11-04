import { Plus, X } from "lucide-react";
import { closeTabSafely } from "../lib/actions";
import { useTabs } from "../stores/tabs";
import { methodColor } from "../lib/utils";

export function TabBar() {
  const tabs = useTabs((state) => state.tabs);
  const activeId = useTabs((state) => state.activeId);
  const activate = useTabs((state) => state.activate);
  const newTab = useTabs((state) => state.newTab);

  return (
    <div className="tabbar">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`tab ${tab.id === activeId ? "active" : ""}`}
          onClick={() => activate(tab.id)}
          onAuxClick={(event) => {
            if (event.button === 1) void closeTabSafely(tab.id);
          }}
          title={tab.title}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: methodColor(tab.spec.method),
              flexShrink: 0,
            }}
          />
          <span className="tab-title">{tab.title}</span>
          {tab.sending ? <span className="spinner" style={{ width: 10, height: 10 }} /> : null}
          {tab.dirty ? <span className="dirty-dot" /> : null}
          <button
            className="icon-btn"
            style={{ width: 18, height: 18 }}
            onClick={(event) => {
              event.stopPropagation();
              void closeTabSafely(tab.id);
            }}
            title="关闭标签"
          >
            <X size={12} />
          </button>
        </div>
      ))}
      <button className="icon-btn" style={{ margin: "0 4px" }} onClick={newTab} title="新建标签 (Ctrl+T)">
        <Plus size={15} />
      </button>
    </div>
  );
}
