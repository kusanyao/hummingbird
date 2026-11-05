import { create } from "zustand";
import { uid } from "../lib/utils";
import {
  cloneSpec,
  createSpec,
  type AppError,
  type HistoryEntry,
  type RequestSpec,
  type ResponseData,
} from "../types";

export interface TabRef {
  collectionId: string;
  itemId: string;
}

export interface Tab {
  id: string;
  title: string;
  ref?: TabRef;
  spec: RequestSpec;
  dirty: boolean;
  sending: boolean;
  response?: ResponseData;
  error?: AppError;
}

function blankTab(): Tab {
  return {
    id: uid(),
    title: "未命名请求",
    spec: createSpec(),
    dirty: false,
    sending: false,
  };
}

const initialTab = blankTab();

interface TabsState {
  tabs: Tab[];
  activeId: string;
  newTab: () => void;
  openRequest: (
    collectionId: string,
    itemId: string,
    name: string,
    spec: RequestSpec,
  ) => void;
  openHistory: (entry: HistoryEntry) => void;
  openDraft: (title: string, spec: RequestSpec) => void;
  closeTab: (id: string) => void;
  activate: (id: string) => void;
  setSpec: (id: string, spec: RequestSpec) => void;
  setSending: (id: string, sending: boolean) => void;
  setResponse: (id: string, response: ResponseData) => void;
  setError: (id: string, error: AppError | undefined) => void;
  markSaved: (id: string) => void;
  updateTitle: (id: string, title: string) => void;
  attach: (id: string, ref: TabRef, title: string) => void;
}

export const useTabs = create<TabsState>()((set, get) => ({
  tabs: [initialTab],
  activeId: initialTab.id,

  newTab: () => {
    const tab = blankTab();
    set({ tabs: [...get().tabs, tab], activeId: tab.id });
  },

  openRequest: (collectionId, itemId, name, spec) => {
    const existing = get().tabs.find(
      (tab) =>
        tab.ref?.collectionId === collectionId && tab.ref?.itemId === itemId,
    );
    if (existing) {
      set({ activeId: existing.id });
      return;
    }
    const tab: Tab = {
      id: uid(),
      title: name,
      ref: { collectionId, itemId },
      spec: cloneSpec(spec),
      dirty: false,
      sending: false,
    };
    set({ tabs: [...get().tabs, tab], activeId: tab.id });
  },

  openHistory: (entry) => {
    const tab: Tab = {
      id: uid(),
      title: entry.name || entry.url,
      spec: cloneSpec(entry.spec),
      dirty: false,
      sending: false,
    };
    set({ tabs: [...get().tabs, tab], activeId: tab.id });
  },

  openDraft: (title, spec) => {
    const tab: Tab = {
      id: uid(),
      title,
      spec: cloneSpec(spec),
      dirty: false,
      sending: false,
    };
    set({ tabs: [...get().tabs, tab], activeId: tab.id });
  },

  closeTab: (id) => {
    const tabs = get().tabs.filter((tab) => tab.id !== id);
    if (tabs.length === 0) {
      const tab = blankTab();
      set({ tabs: [tab], activeId: tab.id });
      return;
    }
    const activeId =
      get().activeId === id
        ? tabs[Math.max(0, get().tabs.findIndex((tab) => tab.id === id) - 1)].id
        : get().activeId;
    set({ tabs, activeId });
  },

  activate: (id) => set({ activeId: id }),

  setSpec: (id, spec) =>
    set({
      tabs: get().tabs.map((tab) =>
        tab.id === id ? { ...tab, spec, dirty: true } : tab,
      ),
    }),

  setSending: (id, sending) =>
    set({
      tabs: get().tabs.map((tab) => (tab.id === id ? { ...tab, sending } : tab)),
    }),

  setResponse: (id, response) =>
    set({
      tabs: get().tabs.map((tab) =>
        tab.id === id ? { ...tab, response, error: undefined } : tab,
      ),
    }),

  setError: (id, error) =>
    set({
      tabs: get().tabs.map((tab) => (tab.id === id ? { ...tab, error } : tab)),
    }),

  markSaved: (id) =>
    set({
      tabs: get().tabs.map((tab) =>
        tab.id === id ? { ...tab, dirty: false } : tab,
      ),
    }),

  updateTitle: (id, title) =>
    set({
      tabs: get().tabs.map((tab) => (tab.id === id ? { ...tab, title } : tab)),
    }),

  attach: (id, ref, title) =>
    set({
      tabs: get().tabs.map((tab) =>
        tab.id === id ? { ...tab, ref, title, dirty: false } : tab,
      ),
    }),
}));

export function findTab(id: string): Tab | undefined {
  return useTabs.getState().tabs.find((tab) => tab.id === id);
}
