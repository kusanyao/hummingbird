import { create } from "zustand";
import { ipc } from "../lib/ipc";
import { uid } from "../lib/utils";
import {
  DEFAULT_SETTINGS,
  createSpec,
  type Collection,
  type CollectionItem,
  type EnvironmentsFile,
  type HistoryEntry,
  type Settings,
} from "../types";

interface WorkspaceState {
  loaded: boolean;
  error: string | null;
  dataDir: string;
  version: string;
  settings: Settings;
  collections: Collection[];
  env: EnvironmentsFile;
  history: HistoryEntry[];
  load: () => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  createCollection: (name?: string) => Promise<Collection | null>;
  saveCollection: (collection: Collection) => Promise<boolean>;
  deleteCollection: (id: string) => Promise<void>;
  createItem: (
    collectionId: string,
    kind: "folder" | "request",
    parentId: string | null,
    name?: string,
  ) => Promise<CollectionItem | null>;
  updateItem: (
    collectionId: string,
    itemId: string,
    patch: Partial<CollectionItem>,
  ) => Promise<void>;
  deleteItem: (collectionId: string, itemId: string) => Promise<void>;
  saveEnv: (env: EnvironmentsFile) => Promise<void>;
  refreshHistory: () => Promise<void>;
  removeHistory: (id: string) => Promise<void>;
  clearHistory: () => Promise<void>;
}

function descendants(items: CollectionItem[], rootId: string): Set<string> {
  const ids = new Set<string>([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of items) {
      if (item.parentId && ids.has(item.parentId) && !ids.has(item.id)) {
        ids.add(item.id);
        changed = true;
      }
    }
  }
  return ids;
}

export const useWorkspace = create<WorkspaceState>()((set, get) => ({
  loaded: false,
  error: null,
  dataDir: "",
  version: "",
  settings: DEFAULT_SETTINGS,
  collections: [],
  env: { schemaVersion: 1, activeId: null, environments: [], globals: [] },
  history: [],

  load: async () => {
    try {
      const data = await ipc.init();
      set({
        loaded: true,
        error: null,
        dataDir: data.dataDir,
        version: data.version,
        settings: { ...DEFAULT_SETTINGS, ...data.settings },
        collections: data.collections,
        env: data.env,
        history: data.history,
      });
    } catch (error) {
      const message =
        error && typeof error === "object" && "message" in error
          ? String((error as { message: unknown }).message)
          : "初始化失败";
      set({ loaded: true, error: message });
    }
  },

  updateSettings: async (patch) => {
    const next = { ...get().settings, ...patch };
    set({ settings: next });
    try {
      const saved = await ipc.settingsSave(next);
      set({ settings: saved });
    } catch (error) {
      console.error(error);
    }
  },

  createCollection: async (name = "未命名集合") => {
    try {
      const collection = await ipc.collectionCreate(name);
      set({ collections: [...get().collections, collection] });
      return collection;
    } catch (error) {
      console.error(error);
      return null;
    }
  },

  saveCollection: async (collection) => {
    try {
      const saved = await ipc.collectionSave(collection);
      set({
        collections: get().collections.map((item) =>
          item.id === saved.id ? saved : item,
        ),
      });
      return true;
    } catch (error) {
      console.error(error);
      return false;
    }
  },

  deleteCollection: async (id) => {
    await ipc.collectionDelete(id);
    set({ collections: get().collections.filter((item) => item.id !== id) });
  },

  createItem: async (collectionId, kind, parentId, name) => {
    const collection = get().collections.find((item) => item.id === collectionId);
    if (!collection) return null;
    const maxOrder = collection.items.reduce(
      (max, item) => Math.max(max, item.order),
      0,
    );
    const item: CollectionItem = {
      id: uid(),
      kind,
      name: name ?? (kind === "folder" ? "新建文件夹" : "未命名请求"),
      parentId,
      order: maxOrder + 1,
      spec: kind === "request" ? createSpec() : null,
    };
    const ok = await get().saveCollection({
      ...collection,
      items: [...collection.items, item],
    });
    return ok ? item : null;
  },

  updateItem: async (collectionId, itemId, patch) => {
    const collection = get().collections.find((item) => item.id === collectionId);
    if (!collection) return;
    await get().saveCollection({
      ...collection,
      items: collection.items.map((item) =>
        item.id === itemId ? { ...item, ...patch } : item,
      ),
    });
  },

  deleteItem: async (collectionId, itemId) => {
    const collection = get().collections.find((item) => item.id === collectionId);
    if (!collection) return;
    const ids = descendants(collection.items, itemId);
    await get().saveCollection({
      ...collection,
      items: collection.items.filter((item) => !ids.has(item.id)),
    });
  },

  saveEnv: async (env) => {
    try {
      const saved = await ipc.environmentsSave(env);
      set({ env: saved });
    } catch (error) {
      console.error(error);
    }
  },

  refreshHistory: async () => {
    try {
      const history = await ipc.historyList(50);
      set({ history });
    } catch (error) {
      console.error(error);
    }
  },

  removeHistory: async (id) => {
    await ipc.historyDelete(id);
    set({ history: get().history.filter((entry) => entry.id !== id) });
  },

  clearHistory: async () => {
    await ipc.historyClear();
    set({ history: [] });
  },
}));

export function activeVariables(env: EnvironmentsFile): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const item of env.globals) {
    if (item.enabled && item.key) vars[item.key] = item.value;
  }
  const active = env.environments.find((item) => item.id === env.activeId);
  if (active) {
    for (const item of active.variables) {
      if (item.enabled && item.key) vars[item.key] = item.value;
    }
  }
  return vars;
}
