import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import logoUrl from "./assets/logo.svg";
import { EnvironmentDialog } from "./components/EnvironmentDialog";
import { NetworkDialog } from "./components/NetworkDialog";
import { RequestPanel } from "./components/RequestPanel";
import { ResponsePanel } from "./components/ResponsePanel";
import { SaveDialog } from "./components/SaveDialog";
import { SettingsDialog } from "./components/SettingsDialog";
import { Sidebar } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import { TabBar } from "./components/TabBar";
import { Toasts } from "./components/Toasts";
import { closeTabSafely, saveTabToCollection, sendTab } from "./lib/actions";
import { useTabs } from "./stores/tabs";
import { useUI } from "./stores/ui";
import { useWorkspace } from "./stores/workspace";

function App() {
  const loaded = useWorkspace((state) => state.loaded);
  const loadError = useWorkspace((state) => state.error);
  const load = useWorkspace((state) => state.load);
  const settings = useWorkspace((state) => state.settings);
  const updateSettings = useWorkspace((state) => state.updateSettings);

  const activeTab = useTabs((state) =>
    state.tabs.find((tab) => tab.id === state.activeId),
  );

  const [ratio, setRatio] = useState(settings.splitRatio);
  const ratioRef = useRef(ratio);
  ratioRef.current = ratio;
  const mainRef = useRef<HTMLElement | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void load();
  }, [load]);

  useEffect(() => {
    document.documentElement.classList.toggle(
      "light",
      settings.theme === "light",
    );
  }, [settings.theme]);

  useEffect(() => {
    const blockContextMenu = (event: MouseEvent) => event.preventDefault();
    window.addEventListener("contextmenu", blockContextMenu);
    return () => window.removeEventListener("contextmenu", blockContextMenu);
  }, []);

  useEffect(() => {
    setRatio(settings.splitRatio);
  }, [settings.splitRatio]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      if (!mod) return;
      const key = event.key.toLowerCase();
      const tabsState = useTabs.getState();
      if (key === "enter") {
        event.preventDefault();
        void sendTab(tabsState.activeId);
      } else if (key === "s") {
        event.preventDefault();
        const tab = tabsState.tabs.find((item) => item.id === tabsState.activeId);
        if (!tab) return;
        if (tab.ref) void saveTabToCollection(tab.id);
        else useUI.getState().setSaveDialogTabId(tab.id);
      } else if (key === "t") {
        event.preventDefault();
        tabsState.newTab();
      } else if (key === "w") {
        event.preventDefault();
        void closeTabSafely(tabsState.activeId);
      } else if (key === "l") {
        event.preventDefault();
        window.dispatchEvent(new Event("hummingbird:focus-url"));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Debounced autosave for every saved tab, not just the visible one, so
  // switching tabs never drops pending edits.
  useEffect(() => {
    const timers = new Map<string, number>();
    const unsubscribe = useTabs.subscribe((state) => {
      for (const tab of state.tabs) {
        if (tab.ref && tab.dirty && !timers.has(tab.id)) {
          const timer = window.setTimeout(() => {
            timers.delete(tab.id);
            void saveTabToCollection(tab.id);
          }, 800);
          timers.set(tab.id, timer);
        } else if ((!tab.ref || !tab.dirty) && timers.has(tab.id)) {
          window.clearTimeout(timers.get(tab.id));
          timers.delete(tab.id);
        }
      }
      const ids = new Set(state.tabs.map((tab) => tab.id));
      for (const [id, timer] of timers) {
        if (!ids.has(id)) {
          window.clearTimeout(timer);
          timers.delete(id);
        }
      }
    });
    return () => {
      unsubscribe();
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    document.body.style.cursor = "row-resize";
    const onMove = (moveEvent: PointerEvent) => {
      const element = mainRef.current;
      if (!element) return;
      const rect = element.getBoundingClientRect();
      const available = rect.height - 36;
      if (available <= 0) return;
      const next = (moveEvent.clientY - rect.top - 36) / available;
      setRatio(Math.min(0.78, Math.max(0.22, next)));
    };
    const onUp = () => {
      document.body.style.cursor = "";
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      void updateSettings({ splitRatio: ratioRef.current });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  if (!loaded) {
    return (
      <div className="loading-screen">
        <img src={logoUrl} alt="蜂鸟" className="logo-mark" style={{ width: 46, height: 46 }} />
        <div>正在加载本地数据…</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="loading-screen">
        <div style={{ fontWeight: 600, color: "var(--fg)" }}>初始化失败</div>
        <div className="muted" style={{ maxWidth: 520, textAlign: "center" }}>
          {loadError}
        </div>
        <button
          className="btn"
          onClick={() => {
            useWorkspace.setState({ loaded: false, error: null });
            void load();
          }}
        >
          重试
        </button>
      </div>
    );
  }

  if (!activeTab) return null;

  return (
    <div className="app-shell">
      <div className="workspace">
        <Sidebar />
        <main className="main" ref={mainRef}>
          <TabBar />
          <RequestPanel
            tab={activeTab}
            style={{
              height: `calc((100% - 36px) * ${ratio} - 3px)`,
              flexShrink: 0,
            }}
          />
          <div className="splitter" onPointerDown={startResize} />
          <ResponsePanel tab={activeTab} style={{ flex: 1 }} />
        </main>
      </div>
      <StatusBar />
      <Toasts />
      <SaveDialog />
      <EnvironmentDialog />
      <NetworkDialog />
      <SettingsDialog />
    </div>
  );
}

export default App;
